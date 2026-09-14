"""Create farms and IoT devices.

Revision ID: 0002_farms_iot
Revises: 0001_create_users
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_farms_iot"
down_revision = "0001_create_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "farms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("location", sa.String(200), nullable=False),
        sa.Column("area_hectares", sa.Numeric(10, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_farms_owner_id", "farms", ["owner_id"])
    op.create_table(
        "iot_devices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("farm_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("device_type", sa.String(50), nullable=False),
        sa.Column("serial_number", sa.String(100), nullable=False),
        sa.Column("mode", sa.String(10), nullable=False),
        sa.Column("capabilities", sa.JSON(), nullable=False),
        sa.Column("api_key_hash", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("mode IN ('virtual', 'physical')", name="ck_iot_devices_mode"),
        sa.ForeignKeyConstraint(["farm_id"], ["farms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("serial_number", name="uq_iot_devices_serial_number"),
    )
    op.create_index("ix_iot_devices_farm_id", "iot_devices", ["farm_id"])


def downgrade() -> None:
    op.drop_index("ix_iot_devices_farm_id", table_name="iot_devices")
    op.drop_table("iot_devices")
    op.drop_index("ix_farms_owner_id", table_name="farms")
    op.drop_table("farms")