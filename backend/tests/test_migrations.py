from io import StringIO
from pathlib import Path

from alembic import command
from alembic.config import Config

from models import Farm, IotDevice, SensorReading, User


def test_users_migration_generates_postgresql_sql() -> None:
    output = StringIO()
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"), output_buffer=output)
    command.upgrade(config, "head", sql=True)

    sql = output.getvalue()
    assert "CREATE TABLE users" in sql
    assert "id UUID NOT NULL" in sql
    assert "CONSTRAINT uq_users_email UNIQUE (email)" in sql
    assert "CONSTRAINT ck_users_email_normalized CHECK" in sql
    assert "TIMESTAMP WITH TIME ZONE" in sql
    assert "0001_create_users" in sql
    assert "CREATE TABLE farms" in sql
    assert "CREATE TABLE iot_devices" in sql
    assert "FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE CASCADE" in sql
    assert "FOREIGN KEY(farm_id) REFERENCES farms (id) ON DELETE CASCADE" in sql
    assert "0002_farms_iot" in sql
    assert "ADD COLUMN latitude NUMERIC(9, 6)" in sql
    assert "ADD COLUMN longitude NUMERIC(9, 6)" in sql
    assert "0003_farm_coordinates" in sql
    assert "DROP COLUMN mode" in sql
    assert "DROP COLUMN device_type" in sql
    assert "0004_simplify_iot_devices" in sql
    assert "ADD COLUMN soil_type VARCHAR(20)" in sql
    assert "ADD COLUMN detected_soil_type VARCHAR(20)" in sql
    assert "ADD COLUMN soil_type_confidence NUMERIC(5, 4)" in sql
    assert "0005_farm_soil_types" in sql
    assert "CREATE TABLE sensor_readings" in sql
    assert "0006_sensor_readings" in sql
    assert "0007_rainfall_metric" in sql
    assert "'rainfall'" in sql
    assert set(User.__table__.columns.keys()) == {
        "id", "email", "full_name", "password_hash", "is_active", "created_at"
    }
    assert set(Farm.__table__.columns.keys()) == {
        "id", "owner_id", "name", "location", "latitude", "longitude",
        "area_hectares", "soil_type", "detected_soil_type", "soil_type_confidence",
        "soil_type_detected_at", "created_at", "updated_at",
    }
    assert set(IotDevice.__table__.columns.keys()) == {
        "id", "farm_id", "name", "serial_number", "capabilities",
        "api_key_hash", "is_active", "last_seen_at", "created_at",
    }
    assert set(SensorReading.__table__.columns.keys()) == {
        "id", "farm_id", "device_id", "metric", "value", "source",
        "recorded_at", "created_at",
    }