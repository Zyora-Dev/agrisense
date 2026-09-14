"""Add rainfall sensor metric.

Revision ID: 0007_rainfall_metric
Revises: 0006_sensor_readings
"""

from alembic import op

revision = "0007_rainfall_metric"
down_revision = "0006_sensor_readings"
branch_labels = None
depends_on = None

OLD_METRICS = (
    "'soil_moisture', 'temperature', 'humidity', 'ph', "
    "'nitrogen', 'phosphorus', 'potassium'"
)
NEW_METRICS = (
    "'soil_moisture', 'temperature', 'humidity', 'rainfall', 'ph', "
    "'nitrogen', 'phosphorus', 'potassium'"
)


def upgrade() -> None:
    op.drop_constraint("ck_sensor_readings_metric", "sensor_readings", type_="check")
    op.create_check_constraint(
        "ck_sensor_readings_metric", "sensor_readings", f"metric IN ({NEW_METRICS})"
    )


def downgrade() -> None:
    op.execute("DELETE FROM sensor_readings WHERE metric = 'rainfall'")
    op.drop_constraint("ck_sensor_readings_metric", "sensor_readings", type_="check")
    op.create_check_constraint(
        "ck_sensor_readings_metric", "sensor_readings", f"metric IN ({OLD_METRICS})"
    )