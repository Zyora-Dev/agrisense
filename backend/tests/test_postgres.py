import asyncio
import os
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlalchemy.schema import CreateSchema, DropSchema

from database import get_db, settings
from main import app
from models import Base, Farm, IotDevice, SensorReading, User
from security import password_hasher

pytestmark = [
    pytest.mark.anyio,
    pytest.mark.skipif(
        os.environ.get("AGRISENSE_POSTGRES_TESTS") != "1",
        reason="Set AGRISENSE_POSTGRES_TESTS=1 to test in a temporary PostgreSQL schema",
    ),
]
TEST_PASSWORD = "postgres-test-password"


@pytest.fixture
def anyio_backend():
    return "asyncio"


def migrate(connection, target="head"):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["connection"] = connection
    if target == "base":
        command.downgrade(config, target)
    else:
        command.upgrade(config, target)


@pytest.fixture
async def postgres_engine():
    schema = f"test_auth_{uuid4().hex}"
    engine = create_async_engine(
        str(settings.database_url),
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": schema}, "timeout": 5, "command_timeout": 5},
    )
    created = False
    try:
        async with engine.begin() as connection:
            await connection.execute(CreateSchema(schema))
            await connection.run_sync(migrate)
        created = True
        yield engine
    finally:
        try:
            if created:
                async with engine.begin() as connection:
                    await connection.execute(DropSchema(schema, cascade=True))
        finally:
            await engine.dispose()


@pytest.fixture
async def client(postgres_engine, monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret_key", SecretStr("postgres-tests-only-signing-key-not-for-production-1234567890"))
    sessions = async_sessionmaker(postgres_engine, expire_on_commit=False)

    async def override_get_db():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


async def test_migration_round_trip_and_model_consistency(postgres_engine):
    async with postgres_engine.begin() as connection:
        def verify_schema(connection):
            assert set(inspect(connection).get_table_names()) == {
                "users", "farms", "iot_devices", "sensor_readings", "alembic_version",
                "vendors", "vendor_products", "marketplace_orders", "account_sessions", "audit_events",
            }
            assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []

        await connection.run_sync(verify_schema)
        await connection.run_sync(migrate)
        await connection.run_sync(migrate, "base")
        tables = await connection.run_sync(lambda connection: inspect(connection).get_table_names())
        assert tables == ["alembic_version"]
        await connection.run_sync(migrate)
        await connection.run_sync(verify_schema)


async def test_account_security_lifecycle_and_isolation(client):
    email = "security@example.com"
    await client.post("/auth/register", json={"email": email, "full_name": "Security Test", "password": TEST_PASSWORD})

    async def login(password=TEST_PASSWORD):
        result = await client.post("/auth/login", json={"email": email, "password": password}, headers={"User-Agent": "Security test browser"})
        assert result.status_code == 200
        return {"Authorization": f"Bearer {result.json()['access_token']}"}

    first = await login()
    second = await login()
    await client.post("/auth/register", json={"email": "outsider@example.com", "full_name": "Other", "password": TEST_PASSWORD})
    outsider = await client.post("/auth/login", json={"email": "outsider@example.com", "password": TEST_PASSWORD})
    other = {"Authorization": f"Bearer {outsider.json()['access_token']}"}
    sessions = (await client.get("/auth/sessions", headers=first)).json()
    assert len(sessions) == 2 and sum(item["is_current"] for item in sessions) == 1
    assert (await client.delete(f"/auth/sessions/{sessions[0]['id']}", headers=other)).status_code == 404
    assert (await client.get("/auth/audit")).status_code == 401
    assert (await client.put("/auth/profile", headers=first, json={"full_name": " Updated "})).json()["full_name"] == "Updated"
    assert (await client.put("/auth/profile", headers=first, json={"full_name": "X", "email": "other@example.com"})).status_code == 422
    assert (await client.post("/auth/sessions/revoke-others", headers=first)).status_code == 204
    assert (await client.get("/auth/me", headers=second)).status_code == 401
    assert (await client.get("/auth/me", headers=first)).status_code == 200
    second = await login()
    other_session = next(item for item in (await client.get("/auth/sessions", headers=first)).json() if not item["is_current"])
    assert (await client.delete(f"/auth/sessions/{other_session['id']}", headers=first)).status_code == 204
    assert (await client.get("/auth/me", headers=second)).status_code == 401
    password = "changed-test-password-123"
    assert (await client.post("/auth/password", headers=first, json={"current_password": "wrong", "new_password": password})).status_code == 400
    assert (await client.post("/auth/password", headers=first, json={"current_password": TEST_PASSWORD, "new_password": "short"})).status_code == 422
    assert (await client.post("/auth/password", headers=first, json={"current_password": TEST_PASSWORD, "new_password": TEST_PASSWORD})).status_code == 422
    assert (await client.post("/auth/password", headers=first, json={"current_password": TEST_PASSWORD, "new_password": password})).status_code == 204
    assert (await client.get("/auth/me", headers=first)).status_code == 401
    assert (await client.post("/auth/login", json={"email": email, "password": TEST_PASSWORD})).status_code == 401
    fresh = await login(password)
    audit = (await client.get("/auth/audit", headers=fresh)).json()
    actions = {item["action"] for item in audit["items"]}
    assert {"login.succeeded", "login.failed", "password.failed", "password.changed", "profile.updated", "sessions.others_revoked", "session.revoked"} <= actions
    assert all("password_hash" not in item and "user_id" not in item for item in audit["items"])
    assert (await client.get("/auth/audit?action=password.changed", headers=other)).json()["total"] == 0
    assert (await client.get("/auth/audit?action=password.changed", headers=fresh)).json()["total"] == 1
    assert len((await client.get("/auth/audit?page_size=2", headers=fresh)).json()["items"]) == 2
    assert (await client.get("/auth/audit?start_date=2099-01-01", headers=fresh)).json()["total"] == 0
    assert (await client.get("/auth/audit?start_date=2026-02-01&end_date=2026-01-01", headers=fresh)).status_code == 422
    assert (await client.post("/auth/logout", headers=fresh)).status_code == 204
    assert (await client.get("/auth/me", headers=fresh)).status_code == 401
    for attempt in range(8):
        assert (await client.post("/auth/login", json={"email": email, "password": "wrong"})).status_code == 401
    assert (await client.post("/auth/login", json={"email": email, "password": password})).status_code == 429


async def test_marketplace_lifecycle_and_owner_isolation(client):
    async def login(email):
        response = await client.post("/auth/register", json={"email": email, "full_name": "Vendor Test", "password": TEST_PASSWORD})
        assert response.status_code == 201
        response = await client.post("/auth/login", json={"email": email, "password": TEST_PASSWORD})
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    owner = await login("vendor@example.com")
    other = await login("buyer@example.com")
    profile = {"name": "Test Seeds", "location": "Nagercoil", "description": "Locally supplied seed samples", "contact_email": "public@example.com", "phone": "+91 9000000000"}
    assert (await client.get("/marketplace/vendors/me", headers=owner)).json() is None
    created = await client.post("/marketplace/vendors", headers=owner, json=profile)
    assert created.status_code == 201
    assert "owner_id" not in created.json()
    vendor_id = created.json()["id"]
    assert (await client.post("/marketplace/vendors", headers=owner, json=profile)).status_code == 409
    product = {"name": "Rice sample", "category": "seeds", "description": "Seed sample for suitability checks", "price_inr": "120.00", "unit": "1 kg", "crops": ["rice"], "soil_types": ["clay"]}
    assert (await client.post("/marketplace/products", headers=other, json=product)).status_code == 404
    created_product = await client.post("/marketplace/products", headers=owner, json=product)
    assert created_product.status_code == 201
    product_id = created_product.json()["id"]
    assert (await client.put(f"/marketplace/products/{product_id}", headers=other, json=product)).status_code == 404
    assert (await client.delete(f"/marketplace/products/{product_id}", headers=other)).status_code == 404
    assert (await client.put("/marketplace/products/00000000-0000-0000-0000-000000000065", headers=owner, json=product)).status_code == 404
    assert (await client.put(f"/marketplace/products/{product_id}", headers=owner, json={**product, "price_inr": "-1"})).status_code == 422
    updated = await client.put(f"/marketplace/products/{product_id}", headers=owner, json={**product, "in_stock": False})
    assert updated.status_code == 200 and updated.json()["in_stock"] is False
    results = await client.get("/marketplace/vendors?query=Test&category=seeds", headers=other)
    assert results.status_code == 200
    assert results.json()["total"] == 1
    assert results.json()["items"][0]["products"][0]["id"] == product_id
    assert (await client.get("/marketplace/vendors?category=irrigation", headers=other)).json()["total"] == 1
    assert (await client.get("/marketplace/vendors?page_size=2&page=3", headers=other)).json()["total"] == 6
    assert (await client.put("/marketplace/vendors/me", headers=owner, json={**profile, "is_active": False})).status_code == 200
    assert (await client.get(f"/marketplace/vendors/{vendor_id}", headers=other)).status_code == 404
    assert (await client.get("/marketplace/vendors?include_demo=false", headers=other)).json()["total"] == 0
    assert (await client.delete(f"/marketplace/products/{product_id}", headers=owner)).status_code == 204


async def test_marketplace_orders_cod_and_isolation(client):
    async def login(email):
        assert (await client.post("/auth/register", json={"email": email, "full_name": "Order Test", "password": TEST_PASSWORD})).status_code == 201
        response = await client.post("/auth/login", json={"email": email, "password": TEST_PASSWORD})
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    seller = await login("seller@example.com")
    buyer = await login("buyer@example.com")
    stranger = await login("stranger@example.com")
    profile = {"name": "Order Test Seeds", "location": "Nagercoil", "description": "Seed samples for order tests", "contact_email": "public@example.com", "phone": "+91 9000000000"}
    assert (await client.post("/marketplace/vendors", headers=seller, json=profile)).status_code == 201
    product = {"name": "Rice sample", "category": "seeds", "description": "Seed sample for suitability checks", "price_inr": "120.25", "unit": "1 kg"}
    product_id = (await client.post("/marketplace/products", headers=seller, json=product)).json()["id"]
    payload = {"request_id": str(uuid4()), "product_id": product_id, "quantity": 3, "expected_price_inr": "120.25", "recipient_name": "Test Farmer", "phone": "+91 9000000001", "address": "12 Test Street, Test Village", "city": "Nagercoil", "postal_code": "629001", "payment_method": "cod"}
    assert (await client.post("/marketplace/orders", json=payload)).status_code == 401
    assert (await client.get("/marketplace/orders")).status_code == 401
    assert (await client.post("/marketplace/orders", headers=seller, json=payload)).status_code == 422
    for change in ({"quantity": 0}, {"quantity": 101}, {"quantity": 1.5}, {"payment_method": "card"}, {"total_inr": "1"}, {"postal_code": "abc"}):
        assert (await client.post("/marketplace/orders", headers=buyer, json={**payload, **change})).status_code == 422
    assert (await client.post("/marketplace/orders", headers=buyer, json={**payload, "product_id": str(UUID(int=101))})).status_code == 404
    assert (await client.post("/marketplace/orders", headers=buyer, json={**payload, "expected_price_inr": "1"})).status_code == 409
    await client.put(f"/marketplace/products/{product_id}", headers=seller, json={**product, "in_stock": False})
    assert (await client.post("/marketplace/orders", headers=buyer, json=payload)).status_code == 409
    await client.put(f"/marketplace/products/{product_id}", headers=seller, json=product)
    await client.put("/marketplace/vendors/me", headers=seller, json={**profile, "is_active": False})
    assert (await client.post("/marketplace/orders", headers=buyer, json=payload)).status_code == 409
    await client.put("/marketplace/vendors/me", headers=seller, json=profile)
    responses = await asyncio.gather(*[client.post("/marketplace/orders", headers=buyer, json=payload) for attempt in range(2)])
    assert sorted(response.status_code for response in responses) == [200, 201]
    order = responses[0].json()
    order_id = order["id"]
    assert order["total_inr"] == "360.75" and order["payment_status"] == "pending"
    assert "buyer_id" not in order and "request_hash" not in order
    assert responses[1].json()["id"] == order_id
    assert (await client.post("/marketplace/orders", headers=buyer, json={**payload, "quantity": 2})).status_code == 409
    assert (await client.get("/marketplace/orders", headers=buyer)).json()["total"] == 1
    assert (await client.get("/marketplace/orders?role=vendor", headers=seller)).json()["total"] == 1
    assert (await client.get("/marketplace/orders", headers=stranger)).json()["total"] == 0
    assert (await client.get("/marketplace/orders?role=vendor", headers=stranger)).json()["total"] == 0
    assert (await client.get("/marketplace/orders?start_date=2099-01-01", headers=buyer)).json()["total"] == 0
    assert (await client.get("/marketplace/orders?start_date=2026-02-01&end_date=2026-01-01", headers=buyer)).status_code == 422
    for headers, status, expected in [(stranger, "cancelled", 404), (buyer, "confirmed", 409), (seller, "delivered", 409), (seller, "confirmed", 200), (buyer, "cancelled", 409), (seller, "shipped", 200), (seller, "cancelled", 409), (seller, "delivered", 200), (seller, "cancelled", 409)]:
        result = await client.put(f"/marketplace/orders/{order_id}", headers=headers, json={"status": status})
        assert result.status_code == expected
        if expected == 200:
            assert result.json()["payment_status"] == ("collected" if status == "delivered" else "pending")
    second = await client.post("/marketplace/orders", headers=buyer, json={**payload, "request_id": str(uuid4())})
    assert second.status_code == 201
    assert (await client.put(f"/marketplace/orders/{second.json()['id']}", headers=buyer, json={"status": "cancelled"})).status_code == 200
    assert (await client.get("/marketplace/orders?status=cancelled&page_size=1", headers=buyer)).json()["total"] == 1
    await client.put(f"/marketplace/products/{product_id}", headers=seller, json={**product, "name": "New rice", "price_inr": "999"})
    assert (await client.delete(f"/marketplace/products/{product_id}", headers=seller)).status_code == 204
    saved = (await client.get("/marketplace/orders?status=delivered", headers=buyer)).json()["items"][0]
    assert saved["product_id"] is None and saved["product_name"] == "Rice sample" and saved["total_inr"] == "360.75"
    assert (await client.post("/marketplace/orders", headers=buyer, json=payload)).json()["id"] == order_id


async def test_auth_lifecycle_on_postgresql(client, postgres_engine):
    registration = await client.post("/auth/register", json={
        "email": "FARMER@EXAMPLE.COM", "full_name": "  Test Farmer  ", "password": TEST_PASSWORD,
    })
    assert registration.status_code == 201
    assert registration.json()["email"] == "farmer@example.com"
    user_id = UUID(registration.json()["id"])
    sessions = async_sessionmaker(postgres_engine, expire_on_commit=False)
    async with sessions() as session:
        user = await session.get(User, user_id)
        assert user is not None
        assert user.is_active
        assert user.created_at.tzinfo is not None
        assert user.password_hash.startswith("$argon2id$")
        assert password_hasher.verify(TEST_PASSWORD, user.password_hash)

    duplicate = await client.post("/auth/register", json={
        "email": "farmer@example.com", "full_name": "Duplicate", "password": TEST_PASSWORD,
    })
    assert duplicate.status_code == 409
    login = await client.post("/auth/login", json={"email": "FARMER@example.com", "password": TEST_PASSWORD})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    profile = await client.get("/auth/me", headers=headers)
    assert profile.status_code == 200
    assert profile.json() == registration.json()
    assert "password" not in profile.text
    assert (await client.get("/auth/me")).status_code == 401
    wrong_password = await client.post("/auth/login", json={"email": "farmer@example.com", "password": "wrong"})
    assert wrong_password.status_code == 401

    async with sessions() as session:
        user = await session.get(User, user_id)
        user.is_active = False
        await session.commit()
    assert (await client.get("/auth/me", headers=headers)).status_code == 401
    disabled_login = await client.post("/auth/login", json={"email": "farmer@example.com", "password": TEST_PASSWORD})
    assert disabled_login.status_code == 401


async def test_concurrent_registration_keeps_one_user(client, postgres_engine):
    payload = {"email": "concurrent@example.com", "full_name": "Concurrent Farmer", "password": TEST_PASSWORD}
    responses = await asyncio.gather(
        client.post("/auth/register", json=payload),
        client.post("/auth/register", json={**payload, "email": "CONCURRENT@example.com"}),
    )
    assert sorted(response.status_code for response in responses) == [201, 409]
    sessions = async_sessionmaker(postgres_engine)
    async with sessions() as session:
        users = (await session.scalars(select(User))).all()
        assert len(users) == 1


async def test_farm_device_lifecycle_and_owner_isolation(client, postgres_engine):
    async def register_and_login(email: str) -> dict[str, str]:
        registration = await client.post("/auth/register", json={
            "email": email, "full_name": "Test Farmer", "password": TEST_PASSWORD,
        })
        assert registration.status_code == 201
        login = await client.post("/auth/login", json={"email": email, "password": TEST_PASSWORD})
        assert login.status_code == 200
        return {"Authorization": f"Bearer {login.json()['access_token']}"}

    owner_headers = await register_and_login("farm-owner@example.com")
    other_headers = await register_and_login("other-farmer@example.com")
    farm = await client.post("/farms/", headers=owner_headers, json={
        "name": "South Field Farm", "location": "Nagercoil", "latitude": "8.183300",
        "longitude": "77.411900", "area_hectares": "4.75", "soil_type": "loamy",
    })
    assert farm.status_code == 201
    farm_id = farm.json()["id"]
    assert farm.json()["area_hectares"] == "4.75"
    assert farm.json()["latitude"] == "8.183300"
    assert farm.json()["longitude"] == "77.411900"
    assert farm.json()["soil_type"] == "loamy"
    assert farm.json()["detected_soil_type"] is None
    assert farm.json()["soil_type_confidence"] is None
    assert (await client.get("/farms/", headers=owner_headers)).json() == [farm.json()]
    assert (await client.get(f"/farms/{farm_id}", headers=other_headers)).status_code == 404

    devices = []
    device_specs = (
        ("Field Sensor 1", "sensor-001", ["soil_moisture", "temperature", "humidity", "rainfall"]),
        ("Field Sensor 2", "sensor-002", ["ph", "nitrogen"]),
        ("Crop Camera", "cam-001", ["camera"]),
    )
    for name, serial_number, capabilities in device_specs:
        response = await client.post(f"/farms/{farm_id}/devices", headers=owner_headers, json={
            "name": name,
            "serial_number": serial_number,
            "capabilities": capabilities,
        })
        assert response.status_code == 201
        assert response.json()["connection_status"] == "never_connected"
        assert response.json()["serial_number"] == serial_number.upper()
        devices.append(response.json())

    assert devices[2]["capabilities"] == ["camera"]

    assert (await client.get(f"/farms/{farm_id}/devices", headers=other_headers)).status_code == 404
    first_device = devices[0]
    heartbeat_url = f"/farms/{farm_id}/devices/{first_device['id']}/heartbeat"
    assert (await client.post(heartbeat_url, headers={"X-Device-Key": "wrong-key"})).status_code == 401
    heartbeat = await client.post(heartbeat_url, headers={"X-Device-Key": first_device["device_key"]})
    assert heartbeat.status_code == 200
    assert heartbeat.json()["connection_status"] == "connected"

    readings_url = f"/farms/{farm_id}/devices/{first_device['id']}/readings"
    reading_payload = {"source": "device", "readings": [
        {"metric": "soil_moisture", "value": "46.25"},
        {"metric": "temperature", "value": "29.40"},
        {"metric": "humidity", "value": "72"},
    ]}
    assert (await client.post(readings_url, headers={"X-Device-Key": "wrong-key"}, json=reading_payload)).status_code == 401
    unsupported = await client.post(readings_url, headers={"X-Device-Key": first_device["device_key"]}, json={
        "source": "device", "readings": [{"metric": "ph", "value": "6.5"}],
    })
    assert unsupported.status_code == 422
    ingested = await client.post(
        readings_url, headers={"X-Device-Key": first_device["device_key"]}, json=reading_payload
    )
    assert ingested.status_code == 201
    assert [(item["metric"], item["source"]) for item in ingested.json()] == [
        ("soil_moisture", "device"), ("temperature", "device"), ("humidity", "device")
    ]

    simulated = await client.post(readings_url, headers={"X-Device-Key": first_device["device_key"]}, json={
        "source": "simulated", "readings": [
            {"metric": "soil_moisture", "value": "44.10"},
            {"metric": "rainfall", "value": "203"},
        ],
    })
    assert simulated.status_code == 201
    assert simulated.json()[0]["source"] == "simulated"

    manual = await client.post(f"/farms/{farm_id}/readings", headers=owner_headers, json={"readings": [
        {"metric": "ph", "value": "6.70"},
        {"metric": "nitrogen", "value": "84"},
        {"metric": "phosphorus", "value": "42"},
        {"metric": "potassium", "value": "61"},
    ]})
    assert manual.status_code == 201
    assert all(item["source"] == "manual" and item["device_id"] is None for item in manual.json())
    invalid_manual = await client.post(f"/farms/{farm_id}/readings", headers=owner_headers, json={
        "readings": [{"metric": "temperature", "value": "30"}],
    })
    assert invalid_manual.status_code == 422
    assert (await client.get(f"/farms/{farm_id}/readings", headers=other_headers)).status_code == 404
    latest = await client.get(f"/farms/{farm_id}/readings/latest", headers=owner_headers)
    assert latest.status_code == 200
    assert {item["metric"] for item in latest.json()} == {
        "soil_moisture", "temperature", "humidity", "rainfall", "ph", "nitrogen", "phosphorus", "potassium"
    }
    assert next(item for item in latest.json() if item["metric"] == "soil_moisture")["source"] == "simulated"

    assert (await client.get(f"/farms/{farm_id}/analysis", headers=other_headers)).status_code == 404
    analysis = await client.get(f"/farms/{farm_id}/analysis", headers=owner_headers)
    assert analysis.status_code == 200
    assert analysis.json()["input_status"] == "ready"
    assert analysis.json()["missing_metrics"] == []
    assert analysis.json()["contains_simulated_data"] is True
    assert analysis.json()["model"]["status"] == "predicted"
    assert analysis.json()["model"]["missing_metrics"] == []
    assert analysis.json()["model"]["uses_simulated_data"] is True
    assert len(analysis.json()["model"]["predictions"]) == 3

    listed = await client.get(f"/farms/{farm_id}/devices", headers=owner_headers)
    assert listed.status_code == 200
    assert [device["connection_status"] for device in listed.json()] == ["connected", "never_connected", "never_connected"]
    assert all("device_key" not in device for device in listed.json())

    sessions = async_sessionmaker(postgres_engine, expire_on_commit=False)
    async with sessions() as session:
        stored_farm = await session.get(Farm, UUID(farm_id))
        stored_devices = (await session.scalars(select(IotDevice).where(IotDevice.farm_id == stored_farm.id))).all()
        assert stored_farm is not None
        assert len(stored_devices) == 3
        assert all(len(device.api_key_hash) == 64 for device in stored_devices)
        assert all(device.api_key_hash != provisioned["device_key"] for device, provisioned in zip(stored_devices, devices))
        stored_readings = (await session.scalars(select(SensorReading).where(SensorReading.farm_id == stored_farm.id))).all()
        assert len(stored_readings) == 9