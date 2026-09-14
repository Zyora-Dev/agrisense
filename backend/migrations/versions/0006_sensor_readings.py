"""Add sensor readings.

Revision ID: 0006_sensor_readings
Revises: 0005_farm_soil_types
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_sensor_readings"
down_revision = "0005_farm_soil_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sensor_readings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("farm_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=True),
        sa.Column("metric", sa.String(30), nullable=False),
        sa.Column("value", sa.Numeric(12, 4), nullable=False),
        sa.Column("source", sa.String(12), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "metric IN ('soil_moisture', 'temperature', 'humidity', 'ph', 'nitrogen', 'phosphorus', 'potassium')",
            name="ck_sensor_readings_metric",
        ),
        sa.CheckConstraint("source IN ('device', 'manual', 'simulated')", name="ck_sensor_readings_source"),
        sa.CheckConstraint(
            "(source = 'manual' AND device_id IS NULL) OR (source <> 'manual' AND device_id IS NOT NULL)",
            name="ck_sensor_readings_source_device",
        ),
        sa.ForeignKeyConstraint(["farm_id"], ["farms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["device_id"], ["iot_devices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sensor_readings_farm_id", "sensor_readings", ["farm_id"])
    op.create_index("ix_sensor_readings_device_id", "sensor_readings", ["device_id"])
    op.create_index("ix_sensor_readings_metric", "sensor_readings", ["metric"])
    op.create_index("ix_sensor_readings_recorded_at", "sensor_readings", ["recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_sensor_readings_recorded_at", table_name="sensor_readings")
    op.drop_index("ix_sensor_readings_metric", table_name="sensor_readings")
    op.drop_index("ix_sensor_readings_device_id", table_name="sensor_readings")
    op.drop_index("ix_sensor_readings_farm_id", table_name="sensor_readings")
    op.drop_table("sensor_readings")