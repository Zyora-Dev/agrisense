from datetime import datetime, timedelta, timezone
from decimal import Decimal
from hashlib import sha256
from hmac import compare_digest
from secrets import token_urlsafe
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Farm, IotDevice, User
from security import get_current_user

router = APIRouter(prefix="/farms", tags=["Farms and IoT Devices"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
CONNECTED_WINDOW = timedelta(minutes=5)
SoilType = Literal["sandy", "clay", "loamy", "silty", "peaty", "chalky", "mixed"]


class FarmCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    location: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    latitude: Decimal | None = Field(default=None, ge=-90, le=90, max_digits=8, decimal_places=6)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180, max_digits=9, decimal_places=6)
    area_hectares: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    soil_type: SoilType | None = None

    @model_validator(mode="after")
    def coordinates_are_paired(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be provided together")
        return self


class FarmUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    location: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None
    latitude: Decimal | None = Field(default=None, ge=-90, le=90, max_digits=8, decimal_places=6)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180, max_digits=9, decimal_places=6)
    area_hectares: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    soil_type: SoilType | None = None

    @field_validator("name", "location")
    @classmethod
    def reject_null_text(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Field cannot be null")
        return value

    @model_validator(mode="after")
    def coordinates_are_paired(self):
        provided = self.model_fields_set
        if ("latitude" in provided) != ("longitude" in provided):
            raise ValueError("Latitude and longitude must be updated together")
        if "latitude" in provided and (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must both be coordinates or both be null")
        return self


class FarmResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    location: str
    latitude: Decimal | None
    longitude: Decimal | None
    area_hectares: Decimal | None
    soil_type: SoilType | None
    detected_soil_type: SoilType | None
    soil_type_confidence: Decimal | None
    soil_type_detected_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DeviceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    serial_number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=100)]
    capabilities: list[Literal["camera", "soil_moisture", "temperature", "humidity", "rainfall", "ph", "nitrogen", "phosphorus", "potassium"]] = Field(
        min_length=1, max_length=9
    )

    @field_validator("serial_number")
    @classmethod
    def normalize_serial_number(cls, value: str) -> str:
        return value.upper()

    @field_validator("capabilities")
    @classmethod
    def unique_capabilities(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("Capabilities must be unique")
        return value


class DeviceResponse(BaseModel):
    id: UUID
    farm_id: UUID
    name: str
    serial_number: str
    capabilities: list[str]
    is_active: bool
    last_seen_at: datetime | None
    connection_status: Literal["connected", "offline", "never_connected"]
    created_at: datetime


class DeviceProvisionResponse(DeviceResponse):
    device_key: str


class HeartbeatResponse(BaseModel):
    device_id: UUID
    connection_status: Literal["connected"] = "connected"
    last_seen_at: datetime


def hash_device_key(device_key: str) -> str:
    return sha256(device_key.encode("utf-8")).hexdigest()


def device_response(device: IotDevice, now: datetime | None = None) -> DeviceResponse:
    now = now or datetime.now(timezone.utc)
    if device.last_seen_at is None:
        status = "never_connected"
    elif device.is_active and now - device.last_seen_at <= CONNECTED_WINDOW:
        status = "connected"
    else:
        status = "offline"
    return DeviceResponse(
        id=device.id,
        farm_id=device.farm_id,
        name=device.name,
        serial_number=device.serial_number,
        capabilities=device.capabilities,
        is_active=device.is_active,
        last_seen_at=device.last_seen_at,
        connection_status=status,
        created_at=device.created_at,
    )


async def owned_farm(session: AsyncSession, farm_id: UUID, owner_id: UUID) -> Farm:
    farm = await session.scalar(select(Farm).where(Farm.id == farm_id, Farm.owner_id == owner_id))
    if farm is None:
        raise HTTPException(status_code=404, detail="Farm not found")
    return farm


@router.post("/", response_model=FarmResponse, status_code=201)
async def create_farm(payload: FarmCreate, session: DatabaseSession, user: CurrentUser) -> Farm:
    farm = Farm(owner_id=user.id, **payload.model_dump())
    session.add(farm)
    await session.commit()
    await session.refresh(farm)
    return farm


@router.get("/", response_model=list[FarmResponse])
async def list_farms(session: DatabaseSession, user: CurrentUser) -> list[Farm]:
    return list((await session.scalars(select(Farm).where(Farm.owner_id == user.id).order_by(Farm.created_at))).all())


@router.get("/{farm_id}", response_model=FarmResponse)
async def get_farm(farm_id: UUID, session: DatabaseSession, user: CurrentUser) -> Farm:
    return await owned_farm(session, farm_id, user.id)


@router.patch("/{farm_id}", response_model=FarmResponse)
async def update_farm(payload: FarmUpdate, farm_id: UUID, session: DatabaseSession, user: CurrentUser) -> Farm:
    farm = await owned_farm(session, farm_id, user.id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="At least one field is required")
    for field, value in updates.items():
        setattr(farm, field, value)
    await session.commit()
    await session.refresh(farm)
    return farm


@router.delete("/{farm_id}", status_code=204)
async def delete_farm(farm_id: UUID, session: DatabaseSession, user: CurrentUser) -> Response:
    farm = await owned_farm(session, farm_id, user.id)
    await session.delete(farm)
    await session.commit()
    return Response(status_code=204)


@router.post("/{farm_id}/devices", response_model=DeviceProvisionResponse, status_code=201)
async def provision_device(
    payload: DeviceCreate, farm_id: UUID, session: DatabaseSession, user: CurrentUser
) -> DeviceProvisionResponse:
    await owned_farm(session, farm_id, user.id)
    device_key = token_urlsafe(32)
    device = IotDevice(farm_id=farm_id, api_key_hash=hash_device_key(device_key), **payload.model_dump())
    session.add(device)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Device serial number already registered") from None
    await session.refresh(device)
    return DeviceProvisionResponse(**device_response(device).model_dump(), device_key=device_key)


@router.get("/{farm_id}/devices", response_model=list[DeviceResponse])
async def list_devices(farm_id: UUID, session: DatabaseSession, user: CurrentUser) -> list[DeviceResponse]:
    await owned_farm(session, farm_id, user.id)
    devices = (await session.scalars(
        select(IotDevice).where(IotDevice.farm_id == farm_id).order_by(IotDevice.created_at)
    )).all()
    now = datetime.now(timezone.utc)
    return [device_response(device, now) for device in devices]


@router.post("/{farm_id}/devices/{device_id}/heartbeat", response_model=HeartbeatResponse)
async def device_heartbeat(
    farm_id: UUID,
    device_id: UUID,
    session: DatabaseSession,
    device_key: Annotated[str | None, Header(alias="X-Device-Key")] = None,
) -> HeartbeatResponse:
    device = await session.scalar(select(IotDevice).where(IotDevice.id == device_id, IotDevice.farm_id == farm_id))
    supplied_hash = hash_device_key(device_key or "")
    if device is None or not device.is_active or not compare_digest(supplied_hash, device.api_key_hash):
        raise HTTPException(status_code=401, detail="Invalid device credentials")
    device.last_seen_at = datetime.now(timezone.utc)
    await session.commit()
    return HeartbeatResponse(device_id=device.id, last_seen_at=device.last_seen_at)