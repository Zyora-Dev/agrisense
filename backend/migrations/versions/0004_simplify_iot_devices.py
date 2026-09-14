"""Simplify IoT device registration.

Revision ID: 0004_simplify_iot_devices
Revises: 0003_farm_coordinates
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_simplify_iot_devices"
down_revision = "0003_farm_coordinates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_iot_devices_mode", "iot_devices", type_="check")
    op.drop_column("iot_devices", "mode")
    op.drop_column("iot_devices", "device_type")


def downgrade() -> None:
    op.add_column(
        "iot_devices",
        sa.Column("device_type", sa.String(50), nullable=False, server_default="sensor_node"),
    )
    op.add_column(
        "iot_devices",
        sa.Column("mode", sa.String(10), nullable=False, server_default="physical"),
    )
    op.create_check_constraint(
        "ck_iot_devices_mode",
        "iot_devices",
        "mode IN ('virtual', 'physical')",
    )
    op.alter_column("iot_devices", "device_type", server_default=None)
    op.alter_column("iot_devices", "mode", server_default=None)