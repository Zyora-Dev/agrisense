"""Add manual and detected farm soil types.

Revision ID: 0005_farm_soil_types
Revises: 0004_simplify_iot_devices
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_farm_soil_types"
down_revision = "0004_simplify_iot_devices"
branch_labels = None
depends_on = None

SOIL_TYPES = "'sandy', 'clay', 'loamy', 'silty', 'peaty', 'chalky', 'mixed'"


def upgrade() -> None:
    op.add_column("farms", sa.Column("soil_type", sa.String(20), nullable=True))
    op.add_column("farms", sa.Column("detected_soil_type", sa.String(20), nullable=True))
    op.add_column("farms", sa.Column("soil_type_confidence", sa.Numeric(5, 4), nullable=True))
    op.add_column("farms", sa.Column("soil_type_detected_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint("ck_farms_soil_type", "farms", f"soil_type IN ({SOIL_TYPES})")
    op.create_check_constraint(
        "ck_farms_detected_soil_type",
        "farms",
        f"detected_soil_type IN ({SOIL_TYPES})",
    )
    op.create_check_constraint(
        "ck_farms_soil_type_confidence",
        "farms",
        "soil_type_confidence BETWEEN 0 AND 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_farms_soil_type_confidence", "farms", type_="check")
    op.drop_constraint("ck_farms_detected_soil_type", "farms", type_="check")
    op.drop_constraint("ck_farms_soil_type", "farms", type_="check")
    op.drop_column("farms", "soil_type_detected_at")
    op.drop_column("farms", "soil_type_confidence")
    op.drop_column("farms", "detected_soil_type")
    op.drop_column("farms", "soil_type")