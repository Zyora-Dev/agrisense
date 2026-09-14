from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, JSON, Numeric, String, UniqueConstraint, Uuid, func, true
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        CheckConstraint("email = lower(trim(email))", name="ck_users_email_normalized"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(254))
    full_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    farms: Mapped[list["Farm"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class AccountSession(Base):
    __tablename__ = "account_sessions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    user_agent: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    user_agent: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Farm(Base):
    __tablename__ = "farms"
    __table_args__ = (
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_farms_latitude"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_farms_longitude"),
        CheckConstraint("(latitude IS NULL) = (longitude IS NULL)", name="ck_farms_coordinates_paired"),
        CheckConstraint(
            "soil_type IN ('sandy', 'clay', 'loamy', 'silty', 'peaty', 'chalky', 'mixed')",
            name="ck_farms_soil_type",
        ),
        CheckConstraint(
            "detected_soil_type IN ('sandy', 'clay', 'loamy', 'silty', 'peaty', 'chalky', 'mixed')",
            name="ck_farms_detected_soil_type",
        ),
        CheckConstraint(
            "soil_type_confidence BETWEEN 0 AND 1",
            name="ck_farms_soil_type_confidence",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    location: Mapped[str] = mapped_column(String(200))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    area_hectares: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    soil_type: Mapped[str | None] = mapped_column(String(20))
    detected_soil_type: Mapped[str | None] = mapped_column(String(20))
    soil_type_confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    soil_type_detected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped[User] = relationship(back_populates="farms")
    devices: Mapped[list["IotDevice"]] = relationship(back_populates="farm", cascade="all, delete-orphan")
    readings: Mapped[list["SensorReading"]] = relationship(back_populates="farm", cascade="all, delete-orphan")


class IotDevice(Base):
    __tablename__ = "iot_devices"
    __table_args__ = (UniqueConstraint("serial_number", name="uq_iot_devices_serial_number"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    farm_id: Mapped[UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    serial_number: Mapped[str] = mapped_column(String(100))
    capabilities: Mapped[list[str]] = mapped_column(JSON)
    api_key_hash: Mapped[str] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    farm: Mapped[Farm] = relationship(back_populates="devices")
    readings: Mapped[list["SensorReading"]] = relationship(back_populates="device")


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    __table_args__ = (
        CheckConstraint(
            "metric IN ('soil_moisture', 'temperature', 'humidity', 'rainfall', 'ph', 'nitrogen', 'phosphorus', 'potassium')",
            name="ck_sensor_readings_metric",
        ),
        CheckConstraint("source IN ('device', 'manual', 'simulated')", name="ck_sensor_readings_source"),
        CheckConstraint(
            "(source = 'manual' AND device_id IS NULL) OR (source <> 'manual' AND device_id IS NOT NULL)",
            name="ck_sensor_readings_source_device",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    farm_id: Mapped[UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    device_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("iot_devices.id", ondelete="CASCADE"), index=True
    )
    metric: Mapped[str] = mapped_column(String(30), index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    source: Mapped[str] = mapped_column(String(12))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    farm: Mapped[Farm] = relationship(back_populates="readings")
    device: Mapped[IotDevice | None] = relationship(back_populates="readings")


class Vendor(Base):
    __tablename__ = "vendors"
    __table_args__ = (UniqueConstraint("owner_id", name="uq_vendors_owner_id"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    location: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(1000))
    contact_email: Mapped[str] = mapped_column(String(254))
    phone: Mapped[str] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    products: Mapped[list["VendorProduct"]] = relationship(back_populates="vendor", cascade="all, delete-orphan")


class VendorProduct(Base):
    __tablename__ = "vendor_products"
    __table_args__ = (
        CheckConstraint("price_inr >= 0", name="ck_vendor_products_price"),
        CheckConstraint("category IN ('seeds', 'fertilizers', 'soil_care', 'irrigation', 'crop_care')", name="ck_vendor_products_category"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    vendor_id: Mapped[UUID] = mapped_column(ForeignKey("vendors.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(20))
    description: Mapped[str] = mapped_column(String(1000))
    price_inr: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    unit: Mapped[str] = mapped_column(String(60))
    crops: Mapped[list[str]] = mapped_column(JSON)
    soil_types: Mapped[list[str]] = mapped_column(JSON)
    in_stock: Mapped[bool] = mapped_column(Boolean, server_default=true())
    vendor: Mapped[Vendor] = relationship(back_populates="products")


class MarketplaceOrder(Base):
    __tablename__ = "marketplace_orders"
    __table_args__ = (
        UniqueConstraint("buyer_id", "request_id", name="uq_marketplace_orders_request"),
        CheckConstraint("quantity BETWEEN 1 AND 100", name="ck_marketplace_orders_quantity"),
        CheckConstraint("unit_price_inr >= 0 AND total_inr = unit_price_inr * quantity", name="ck_marketplace_orders_total"),
        CheckConstraint("status IN ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled')", name="ck_marketplace_orders_status"),
        CheckConstraint("payment_method = 'cod'", name="ck_marketplace_orders_method"),
        CheckConstraint("(status = 'delivered' AND payment_status = 'collected') OR (status <> 'delivered' AND payment_status = 'pending')", name="ck_marketplace_orders_payment"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    buyer_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    vendor_id: Mapped[UUID] = mapped_column(ForeignKey("vendors.id", ondelete="RESTRICT"), index=True)
    product_id: Mapped[UUID | None] = mapped_column(ForeignKey("vendor_products.id", ondelete="SET NULL"))
    request_id: Mapped[UUID] = mapped_column(Uuid)
    request_hash: Mapped[str] = mapped_column(String(64))
    vendor_name: Mapped[str] = mapped_column(String(100))
    vendor_phone: Mapped[str] = mapped_column(String(30))
    vendor_email: Mapped[str] = mapped_column(String(254))
    product_name: Mapped[str] = mapped_column(String(100))
    unit: Mapped[str] = mapped_column(String(60))
    unit_price_inr: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    quantity: Mapped[int] = mapped_column(Integer)
    total_inr: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    recipient_name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(30))
    address: Mapped[str] = mapped_column(String(500))
    city: Mapped[str] = mapped_column(String(100))
    postal_code: Mapped[str] = mapped_column(String(6))
    status: Mapped[str] = mapped_column(String(20), server_default="placed")
    payment_method: Mapped[str] = mapped_column(String(10), server_default="cod")
    payment_status: Mapped[str] = mapped_column(String(20), server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())