from datetime import datetime, timezone
from decimal import Decimal
from hmac import compare_digest
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from farms import hash_device_key, owned_farm
from models import IotDevice, SensorReading, User
from security import get_current_user

router = APIRouter(prefix="/farms", tags=["Sensor Readings"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
Metric = Literal["soil_moisture", "temperature", "humidity", "rainfall", "ph", "nitrogen", "phosphorus", "potassium"]
DeviceSource = Literal["device", "simulated"]

METRIC_RANGES: dict[str, tuple[Decimal, Decimal]] = {
    "soil_moisture": (Decimal("0"), Decimal("100")),
    "temperature": (Decimal("-40"), Decimal("85")),
    "humidity": (Decimal("0"), Decimal("100")),
    "rainfall": (Decimal("0"), Decimal("10000")),
    "ph": (Decimal("0"), Decimal("14")),
    "nitrogen": (Decimal("0"), Decimal("10000")),
    "phosphorus": (Decimal("0"), Decimal("10000")),
    "potassium": (Decimal("0"), Decimal("10000")),
}
METRIC_UNITS = {
    "soil_moisture": "%", "temperature": "C", "humidity": "%", "rainfall": "mm", "ph": "pH",
    "nitrogen": "mg/kg", "phosphorus": "mg/kg", "potassium": "mg/kg",
}
MANUAL_METRICS = {"ph", "nitrogen", "phosphorus", "potassium"}


class ReadingValue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metric: Metric
    value: Decimal = Field(max_digits=12, decimal_places=4)
    recorded_at: datetime | None = None

    @model_validator(mode="after")
    def value_is_in_metric_range(self):
        minimum, maximum = METRIC_RANGES[self.metric]
        if not minimum <= self.value <= maximum:
            raise ValueError(f"{self.metric} must be between {minimum} and {maximum}")
        if self.recorded_at is not None and self.recorded_at.tzinfo is None:
            raise ValueError("recorded_at must include a timezone")
        return self


class DeviceReadingBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: DeviceSource
    readings: list[ReadingValue] = Field(min_length=1, max_length=7)

    @model_validator(mode="after")
    def metrics_are_unique(self):
        metrics = [reading.metric for reading in self.readings]
        if len(metrics) != len(set(metrics)):
            raise ValueError("Each metric may appear only once per batch")
        return self


class ManualReadingBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    readings: list[ReadingValue] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def readings_are_manual_metrics(self):
        metrics = [reading.metric for reading in self.readings]
        if any(metric not in MANUAL_METRICS for metric in metrics):
            raise ValueError("Manual entry currently supports only pH and NPK")
        if len(metrics) != len(set(metrics)):
            raise ValueError("Each metric may appear only once per batch")
        return self


class ReadingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    farm_id: UUID
    device_id: UUID | None
    metric: Metric
    value: Decimal
    unit: str
    source: Literal["device", "manual", "simulated"]
    recorded_at: datetime
    created_at: datetime


def reading_response(reading: SensorReading) -> ReadingResponse:
    return ReadingResponse(
        id=reading.id,
        farm_id=reading.farm_id,
        device_id=reading.device_id,
        metric=reading.metric,
        value=reading.value,
        unit=METRIC_UNITS[reading.metric],
        source=reading.source,
        recorded_at=reading.recorded_at,
        created_at=reading.created_at,
    )


def create_readings(
    farm_id: UUID,
    values: list[ReadingValue],
    source: str,
    device_id: UUID | None = None,
) -> list[SensorReading]:
    now = datetime.now(timezone.utc)
    return [SensorReading(
        farm_id=farm_id,
        device_id=device_id,
        metric=value.metric,
        value=value.value,
        source=source,
        recorded_at=value.recorded_at or now,
    ) for value in values]


@router.post("/{farm_id}/devices/{device_id}/readings", response_model=list[ReadingResponse], status_code=201)
async def ingest_device_readings(
    payload: DeviceReadingBatch,
    farm_id: UUID,
    device_id: UUID,
    session: DatabaseSession,
    device_key: Annotated[str | None, Header(alias="X-Device-Key")] = None,
) -> list[ReadingResponse]:
    device = await session.scalar(select(IotDevice).where(IotDevice.id == device_id, IotDevice.farm_id == farm_id))
    supplied_hash = hash_device_key(device_key or "")
    if device is None or not device.is_active or not compare_digest(supplied_hash, device.api_key_hash):
        raise HTTPException(status_code=401, detail="Invalid device credentials")
    unsupported = sorted({reading.metric for reading in payload.readings} - set(device.capabilities))
    if unsupported:
        raise HTTPException(status_code=422, detail=f"Device lacks capabilities: {', '.join(unsupported)}")

    readings = create_readings(farm_id, payload.readings, payload.source, device.id)
    session.add_all(readings)
    device.last_seen_at = datetime.now(timezone.utc)
    await session.commit()
    for reading in readings:
        await session.refresh(reading)
    return [reading_response(reading) for reading in readings]


@router.post("/{farm_id}/readings", response_model=list[ReadingResponse], status_code=201)
async def add_manual_readings(
    payload: ManualReadingBatch, farm_id: UUID, session: DatabaseSession, user: CurrentUser
) -> list[ReadingResponse]:
    await owned_farm(session, farm_id, user.id)
    readings = create_readings(farm_id, payload.readings, "manual")
    session.add_all(readings)
    await session.commit()
    for reading in readings:
        await session.refresh(reading)
    return [reading_response(reading) for reading in readings]


@router.get("/{farm_id}/readings", response_model=list[ReadingResponse])
async def list_readings(
    farm_id: UUID,
    session: DatabaseSession,
    user: CurrentUser,
    metric: Metric | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[ReadingResponse]:
    await owned_farm(session, farm_id, user.id)
    statement = select(SensorReading).where(SensorReading.farm_id == farm_id)
    if metric is not None:
        statement = statement.where(SensorReading.metric == metric)
    statement = statement.order_by(SensorReading.recorded_at.desc()).limit(limit)
    readings = (await session.scalars(statement)).all()
    return [reading_response(reading) for reading in readings]


@router.get("/{farm_id}/readings/latest", response_model=list[ReadingResponse])
async def latest_readings(
    farm_id: UUID, session: DatabaseSession, user: CurrentUser
) -> list[ReadingResponse]:
    await owned_farm(session, farm_id, user.id)
    readings = (await session.scalars(
        select(SensorReading)
        .where(SensorReading.farm_id == farm_id)
        .order_by(SensorReading.recorded_at.desc())
    )).all()
    latest: dict[str, SensorReading] = {}
    for reading in readings:
        latest.setdefault(reading.metric, reading)
    return [reading_response(reading) for reading in latest.values()]