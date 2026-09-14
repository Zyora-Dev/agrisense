from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from crop_suitability import CropSuitabilityPredictor
from farms import owned_farm
from models import SensorReading, User
from readings import METRIC_UNITS, Metric
from security import get_current_user

router = APIRouter(prefix="/farms", tags=["Farm Analysis"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

REQUIRED_METRICS: tuple[Metric, ...] = (
    "soil_moisture", "temperature", "humidity", "rainfall", "ph",
    "nitrogen", "phosphorus", "potassium",
)
MODEL_METRICS: tuple[Metric, ...] = (
    "nitrogen", "phosphorus", "potassium", "temperature", "humidity", "ph", "rainfall",
)
SENSOR_FRESHNESS = timedelta(hours=6)
MANUAL_FRESHNESS = timedelta(days=30)
predictor = CropSuitabilityPredictor()


class AnalysisInput(BaseModel):
    metric: Metric
    value: float
    unit: str
    source: Literal["device", "manual", "simulated"]
    recorded_at: datetime
    is_stale: bool


class CropPrediction(BaseModel):
    rank: int
    crop: str
    confidence: float


class ModelResult(BaseModel):
    status: Literal["not_ready", "predicted"]
    model_type: Literal["xgboost"] = "xgboost"
    model_version: str
    scope: str
    reason: str | None = None
    required_metrics: list[Metric]
    missing_metrics: list[Metric]
    stale_metrics: list[Metric]
    uses_simulated_data: bool
    predictions: list[CropPrediction]


class FarmAnalysisSnapshot(BaseModel):
    farm_id: UUID
    generated_at: datetime
    input_status: Literal["ready", "incomplete", "stale"]
    inputs: list[AnalysisInput]
    missing_metrics: list[Metric]
    stale_metrics: list[Metric]
    contains_simulated_data: bool
    model: ModelResult


def build_analysis_snapshot(
    farm_id: UUID,
    readings: list[SensorReading],
    now: datetime | None = None,
) -> FarmAnalysisSnapshot:
    generated_at = now or datetime.now(timezone.utc)
    latest: dict[str, SensorReading] = {}
    for reading in sorted(readings, key=lambda item: item.recorded_at, reverse=True):
        latest.setdefault(reading.metric, reading)

    inputs: list[AnalysisInput] = []
    stale_metrics: list[Metric] = []
    for metric in REQUIRED_METRICS:
        reading = latest.get(metric)
        if reading is None:
            continue
        freshness = MANUAL_FRESHNESS if reading.source == "manual" else SENSOR_FRESHNESS
        is_stale = generated_at - reading.recorded_at > freshness
        if is_stale:
            stale_metrics.append(metric)
        inputs.append(AnalysisInput(
            metric=metric,
            value=float(reading.value),
            unit=METRIC_UNITS[metric],
            source=reading.source,
            recorded_at=reading.recorded_at,
            is_stale=is_stale,
        ))

    missing_metrics = [metric for metric in REQUIRED_METRICS if metric not in latest]
    if missing_metrics:
        input_status = "incomplete"
    elif stale_metrics:
        input_status = "stale"
    else:
        input_status = "ready"

    model_missing = [metric for metric in MODEL_METRICS if metric not in latest]
    model_stale = [metric for metric in MODEL_METRICS if metric in stale_metrics]
    model_inputs = [item for item in inputs if item.metric in MODEL_METRICS]
    uses_simulated_data = any(item.source == "simulated" for item in model_inputs)
    predictions: list[CropPrediction] = []
    if model_missing:
        model_status = "not_ready"
        reason = "Missing required model inputs."
    elif model_stale:
        model_status = "not_ready"
        reason = "One or more required model inputs are stale."
    else:
        values = {item.metric: item.value for item in model_inputs}
        ranked = predictor.predict(
            nitrogen=values["nitrogen"],
            phosphorus=values["phosphorus"],
            potassium=values["potassium"],
            temperature=values["temperature"],
            humidity=values["humidity"],
            ph=values["ph"],
            rainfall=values["rainfall"],
        )
        model_status = "predicted"
        reason = None
        predictions = [
            CropPrediction(rank=rank, crop=item.crop, confidence=item.confidence)
            for rank, item in enumerate(ranked, start=1)
        ]
    return FarmAnalysisSnapshot(
        farm_id=farm_id,
        generated_at=generated_at,
        input_status=input_status,
        inputs=inputs,
        missing_metrics=missing_metrics,
        stale_metrics=stale_metrics,
        contains_simulated_data=any(item.source == "simulated" for item in inputs),
        model=ModelResult(
            status=model_status,
            model_version=predictor.version,
            scope=predictor.scope,
            reason=reason,
            required_metrics=list(MODEL_METRICS),
            missing_metrics=model_missing,
            stale_metrics=model_stale,
            uses_simulated_data=uses_simulated_data,
            predictions=predictions,
        ),
    )


@router.get("/{farm_id}/analysis", response_model=FarmAnalysisSnapshot)
async def get_farm_analysis(
    farm_id: UUID, session: DatabaseSession, user: CurrentUser
) -> FarmAnalysisSnapshot:
    await owned_farm(session, farm_id, user.id)
    readings = list((await session.scalars(
        select(SensorReading)
        .where(SensorReading.farm_id == farm_id)
        .order_by(SensorReading.recorded_at.desc())
    )).all())
    return build_analysis_snapshot(farm_id, readings)