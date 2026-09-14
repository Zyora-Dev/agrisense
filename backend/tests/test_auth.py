from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import Settings, get_db, settings
from main import app
from models import AccountSession, User
from security import create_access_token, password_hasher

TEST_PASSWORD = "test-password-for-farmer"


@pytest.fixture(autouse=True)
def test_signing_key(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret_key", SecretStr("test-only-signing-key-not-for-production-1234567890123456789012345"))


@pytest.fixture
def user():
    return User(
        id=uuid4(),
        email="farmer@example.com",
        full_name="Test Farmer",
        password_hash=password_hasher.hash(TEST_PASSWORD),
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def database_session():
    session = AsyncMock(spec=AsyncSession)

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def client(database_session):
    with TestClient(app) as client:
        yield client


def test_register_hashes_password_and_normalizes_fields(client, database_session):
    async def refresh(user):
        user.id = uuid4()
        user.created_at = datetime.now(timezone.utc)
        user.is_active = True

    database_session.refresh.side_effect = refresh
    response = client.post("/auth/register", json={
        "email": "FARMER@EXAMPLE.COM", "full_name": "  Test Farmer  ", "password": TEST_PASSWORD,
    })

    assert response.status_code == 201
    assert response.json()["email"] == "farmer@example.com"
    assert response.json()["full_name"] == "Test Farmer"
    assert set(response.json()) == {"id", "email", "full_name", "is_active", "created_at"}
    stored_user = database_session.add.call_args.args[0]
    assert stored_user.password_hash.startswith("$argon2id$")
    assert password_hasher.verify(TEST_PASSWORD, stored_user.password_hash)
    assert TEST_PASSWORD not in response.text
    database_session.commit.assert_awaited_once()


def test_duplicate_registration_rolls_back(client, database_session):
    database_session.commit.side_effect = IntegrityError("insert", {}, Exception("duplicate"))
    database_session.scalar.return_value = uuid4()
    response = client.post("/auth/register", json={
        "email": "farmer@example.com", "full_name": "Test Farmer", "password": TEST_PASSWORD,
    })

    assert response.status_code == 409
    assert response.json() == {"detail": "Email already registered"}
    database_session.rollback.assert_awaited_once()


@pytest.mark.parametrize("override", [
    {"email": "invalid"}, {"full_name": "   "}, {"full_name": "Name" * 26},
    {"password": "weak-123"}, {"password": "x" * 129}, {"is_active": True},
])
def test_register_rejects_invalid_input(client, database_session, override):
    payload = {"email": "farmer@example.com", "full_name": "Test Farmer", "password": TEST_PASSWORD}
    payload.update(override)
    response = client.post("/auth/register", json=payload)

    assert response.status_code == 422
    assert all(set(error) == {"type", "loc", "msg"} for error in response.json()["detail"])
    assert payload["password"] not in response.text
    database_session.add.assert_not_called()


def test_login_and_protected_profile(client, database_session, user, monkeypatch):
    monkeypatch.setattr(settings, "access_token_expire_minutes", 21600)
    started_at = datetime.now(timezone.utc)
    database_session.scalar.side_effect = [user, 0]
    response = client.post("/auth/login", json={"email": "FARMER@EXAMPLE.COM", "password": TEST_PASSWORD})

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["token_type"] == "bearer"
    assert response.json()["expires_in"] == settings.access_token_expire_minutes * 60
    query = database_session.scalar.call_args_list[0].args[0]
    assert list(query.compile().params.values()) == ["farmer@example.com"]
    issued_session = database_session.add.call_args_list[0].args[0]
    assert isinstance(issued_session, AccountSession)
    claims = jwt.decode(
        response.json()["access_token"], settings.jwt_secret_key.get_secret_value(),
        algorithms=["HS256"], audience="agrisense-app",
    )
    assert response.json()["expires_in"] == 15 * 24 * 60 * 60
    assert claims["exp"] - claims["iat"] == response.json()["expires_in"]
    assert started_at + timedelta(days=15) <= issued_session.expires_at <= datetime.now(timezone.utc) + timedelta(days=15)
    assert abs(issued_session.expires_at.timestamp() - claims["exp"]) < 2
    database_session.get.side_effect = [user, issued_session]
    profile = client.get("/auth/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"})
    assert profile.status_code == 200
    assert profile.headers["cache-control"] == "no-store"
    assert profile.json()["id"] == str(user.id)
    assert "password" not in profile.text
    assert database_session.get.await_count == 2


@pytest.mark.parametrize("case", ["unknown", "wrong_password", "inactive"])
def test_login_failures_are_indistinguishable(client, database_session, user, case):
    user.is_active = case != "inactive"
    database_session.scalar.side_effect = [None] if case == "unknown" else [user, 0]
    password = "wrong-password" if case == "wrong_password" else TEST_PASSWORD
    response = client.post("/auth/login", json={"email": user.email, "password": password})

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid authentication credentials"}
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("authorization", [None, "Basic abc", "Bearer", "Bearer invalid.token.value"])
def test_profile_requires_bearer_token(client, database_session, authorization):
    headers = {"Authorization": authorization} if authorization is not None else {}
    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    database_session.get.assert_not_awaited()


@pytest.mark.parametrize("case", [
    "expired", "future", "wrong_key", "wrong_algorithm", "wrong_issuer", "wrong_audience",
    "wrong_type", "invalid_subject", "missing_expiry",
])
def test_profile_rejects_invalid_claims(client, database_session, user, case):
    key = settings.jwt_secret_key.get_secret_value()
    claims = jwt.decode(create_access_token(user.id), key, algorithms=["HS256"], audience="agrisense-app")
    algorithm = "HS256"
    if case == "expired":
        claims["exp"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    elif case == "future":
        claims["nbf"] = datetime.now(timezone.utc) + timedelta(minutes=1)
    elif case == "wrong_key":
        key = "different-key-that-is-not-the-signing-key-12345"
    elif case == "wrong_algorithm":
        algorithm = "HS384"
    elif case == "wrong_issuer":
        claims["iss"] = "other-service"
    elif case == "wrong_audience":
        claims["aud"] = "other-app"
    elif case == "wrong_type":
        claims["token_type"] = "refresh"
    elif case == "invalid_subject":
        claims["sub"] = "not-a-uuid"
    elif case == "missing_expiry":
        del claims["exp"]
    token = jwt.encode(claims, key, algorithm=algorithm)
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    database_session.get.assert_not_awaited()


@pytest.mark.parametrize("exists", [True, False])
def test_profile_rejects_disabled_or_deleted_user(client, database_session, user, exists):
    user.is_active = False
    database_session.get.return_value = user if exists else None
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {create_access_token(user.id)}"})
    assert response.status_code == 401


@pytest.mark.parametrize("case", ["missing", "revoked", "expired", "other_owner"])
def test_profile_rejects_invalid_server_session(client, database_session, user, case):
    session_id = uuid4()
    account_session = AccountSession(
        id=session_id, user_id=uuid4() if case == "other_owner" else user.id,
        user_agent="test", expires_at=datetime.now(timezone.utc) + timedelta(minutes=-1 if case == "expired" else 30),
        revoked_at=datetime.now(timezone.utc) if case == "revoked" else None,
    )
    database_session.get.side_effect = [user, None if case == "missing" else account_session]
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {create_access_token(user.id, session_id)}"})
    assert response.status_code == 401


def test_signing_key_must_be_at_least_32_characters():
    with pytest.raises(ValidationError):
        Settings(jwt_secret_key="too-short")