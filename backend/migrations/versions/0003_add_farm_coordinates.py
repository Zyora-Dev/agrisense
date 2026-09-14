"""Add farm coordinates.

Revision ID: 0003_farm_coordinates
Revises: 0002_farms_iot
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_farm_coordinates"
down_revision = "0002_farms_iot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("farms", sa.Column("latitude", sa.Numeric(9, 6), nullable=True))
    op.add_column("farms", sa.Column("longitude", sa.Numeric(9, 6), nullable=True))
    op.create_check_constraint("ck_farms_latitude", "farms", "latitude BETWEEN -90 AND 90")
    op.create_check_constraint("ck_farms_longitude", "farms", "longitude BETWEEN -180 AND 180")
    op.create_check_constraint(
        "ck_farms_coordinates_paired",
        "farms",
        "(latitude IS NULL) = (longitude IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_farms_coordinates_paired", "farms", type_="check")
    op.drop_constraint("ck_farms_longitude", "farms", type_="check")
    op.drop_constraint("ck_farms_latitude", "farms", type_="check")
    op.drop_column("farms", "longitude")
    op.drop_column("farms", "latitude")