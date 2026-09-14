"""Add cash-on-delivery marketplace orders."""

from alembic import op
import sqlalchemy as sa

revision = "0009_marketplace_orders"
down_revision = "0008_vendor_marketplace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "marketplace_orders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("buyer_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("vendor_id", sa.Uuid(), sa.ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("product_id", sa.Uuid(), sa.ForeignKey("vendor_products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("vendor_name", sa.String(100), nullable=False),
        sa.Column("vendor_phone", sa.String(30), nullable=False),
        sa.Column("vendor_email", sa.String(254), nullable=False),
        sa.Column("product_name", sa.String(100), nullable=False),
        sa.Column("unit", sa.String(60), nullable=False),
        sa.Column("unit_price_inr", sa.Numeric(10, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("total_inr", sa.Numeric(12, 2), nullable=False),
        sa.Column("recipient_name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(30), nullable=False),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("postal_code", sa.String(6), nullable=False),
        sa.Column("status", sa.String(20), server_default="placed", nullable=False),
        sa.Column("payment_method", sa.String(10), server_default="cod", nullable=False),
        sa.Column("payment_status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("buyer_id", "request_id", name="uq_marketplace_orders_request"),
        sa.CheckConstraint("quantity BETWEEN 1 AND 100", name="ck_marketplace_orders_quantity"),
        sa.CheckConstraint("unit_price_inr >= 0 AND total_inr = unit_price_inr * quantity", name="ck_marketplace_orders_total"),
        sa.CheckConstraint("status IN ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled')", name="ck_marketplace_orders_status"),
        sa.CheckConstraint("payment_method = 'cod'", name="ck_marketplace_orders_method"),
        sa.CheckConstraint("(status = 'delivered' AND payment_status = 'collected') OR (status <> 'delivered' AND payment_status = 'pending')", name="ck_marketplace_orders_payment"),
    )
    for column in ("buyer_id", "vendor_id", "created_at"):
        op.create_index(f"ix_marketplace_orders_{column}", "marketplace_orders", [column])


def downgrade() -> None:
    op.drop_table("marketplace_orders")