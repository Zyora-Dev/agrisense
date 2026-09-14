"""Add vendor profiles and product catalog."""

from alembic import op
import sqlalchemy as sa

revision = "0008_vendor_marketplace"
down_revision = "0007_rainfall_metric"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vendors",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("location", sa.String(200), nullable=False),
        sa.Column("description", sa.String(1000), nullable=False),
        sa.Column("contact_email", sa.String(254), nullable=False),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("owner_id", name="uq_vendors_owner_id"),
    )
    op.create_table(
        "vendor_products",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("vendor_id", sa.Uuid(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("description", sa.String(1000), nullable=False),
        sa.Column("price_inr", sa.Numeric(10, 2), nullable=False),
        sa.Column("unit", sa.String(60), nullable=False),
        sa.Column("crops", sa.JSON(), nullable=False),
        sa.Column("soil_types", sa.JSON(), nullable=False),
        sa.Column("in_stock", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.CheckConstraint("price_inr >= 0", name="ck_vendor_products_price"),
        sa.CheckConstraint("category IN ('seeds', 'fertilizers', 'soil_care', 'irrigation', 'crop_care')", name="ck_vendor_products_category"),
    )
    op.create_index("ix_vendor_products_vendor_id", "vendor_products", ["vendor_id"])


def downgrade() -> None:
    op.drop_table("vendor_products")
    op.drop_table("vendors")