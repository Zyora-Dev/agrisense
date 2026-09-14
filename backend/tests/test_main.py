from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from main import app


def test_health_check() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "agrisense-api"}


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


def test_database_health_check(database_session) -> None:
    database_session.scalar.return_value = "agrisense"

    with TestClient(app) as client:
        response = client.get("/health/db")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "agrisense"}
    database_session.scalar.assert_awaited_once()
    assert str(database_session.scalar.call_args.args[0]) == "SELECT current_database()"


@pytest.mark.parametrize(
    "error",
    [
        SQLAlchemyError("Private connection details"),
        OSError("Private connection details"),
        TimeoutError("Private connection details"),
    ],
)
def test_database_failure_returns_generic_error(database_session, error) -> None:
    database_session.scalar.side_effect = error

    with TestClient(app) as client:
        response = client.get("/health/db")
        health_response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}
    assert health_response.status_code == 200