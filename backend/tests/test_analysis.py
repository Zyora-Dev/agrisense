from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from analysis import build_analysis_snapshot
from models import SensorReading


def reading(metric: str, value: str, source: str, recorded_at: datetime) -> SensorReading:
    return SensorReading(
        farm_id=uuid4(),
        metric=metric,
        value=Decimal(value),
        source=source,
        recorded_at=recorded_at,
    )


def test_analysis_snapshot_preserves_provenance_and_reports_missing_model_inputs() -> None:
    now = datetime(2026, 9, 13, 12, tzinfo=timezone.utc)
    farm_id = uuid4()
    snapshot = build_analysis_snapshot(farm_id, [
        reading("soil_moisture", "41.2", "device", now - timedelta(hours=1)),
        reading("soil_moisture", "38.0", "device", now - timedelta(hours=2)),
        reading("temperature", "30.1", "device", now - timedelta(hours=7)),
        reading("humidity", "73", "simulated", now - timedelta(hours=1)),
        reading("ph", "6.4", "manual", now - timedelta(days=2)),
        reading("nitrogen", "85", "manual", now - timedelta(days=2)),
    ], now=now)

    assert snapshot.farm_id == farm_id
    assert snapshot.input_status == "incomplete"
    assert snapshot.missing_metrics == ["rainfall", "phosphorus", "potassium"]
    assert snapshot.stale_metrics == ["temperature"]
    assert snapshot.contains_simulated_data is True
    assert snapshot.model.status == "not_ready"
    assert snapshot.model.missing_metrics == ["phosphorus", "potassium", "rainfall"]
    assert snapshot.model.predictions == []
    assert snapshot.model.model_version
    assert [(item.metric, item.value) for item in snapshot.inputs][:2] == [
        ("soil_moisture", 41.2), ("temperature", 30.1),
    ]
    assert snapshot.inputs[0].source == "device"
    assert snapshot.inputs[1].is_stale is True


def test_analysis_snapshot_predicts_ranked_crops_and_labels_simulated_dependency() -> None:
    now = datetime(2026, 9, 13, 12, tzinfo=timezone.utc)
    farm_id = uuid4()
    snapshot = build_analysis_snapshot(farm_id, [
        reading("soil_moisture", "41.2", "device", now - timedelta(hours=1)),
        reading("temperature", "20.9", "device", now - timedelta(hours=1)),
        reading("humidity", "82", "device", now - timedelta(hours=1)),
        reading("rainfall", "203", "simulated", now - timedelta(hours=1)),
        reading("ph", "6.5", "manual", now - timedelta(days=2)),
        reading("nitrogen", "90", "manual", now - timedelta(days=2)),
        reading("phosphorus", "42", "manual", now - timedelta(days=2)),
        reading("potassium", "43", "manual", now - timedelta(days=2)),
    ], now=now)

    assert snapshot.input_status == "ready"
    assert snapshot.model.status == "predicted"
    assert snapshot.model.predictions[0].crop == "rice"
    assert [item.rank for item in snapshot.model.predictions] == [1, 2, 3]
    assert snapshot.model.uses_simulated_data is True
    assert snapshot.contains_simulated_data is True