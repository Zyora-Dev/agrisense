from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from fastapi.testclient import TestClient

import weather
from database import get_db
from main import app
from security import get_current_user


def test_location_search_formats_results(monkeypatch) -> None:
    monkeypatch.setattr(weather, "fetch_json", AsyncMock(return_value={"results": [{
        "name": "Nagercoil", "admin2": "Kanniyakumari", "admin1": "Tamil Nadu",
        "country": "India", "latitude": 8.17899, "longitude": 77.43227,
        "timezone": "Asia/Kolkata",
    }]}))
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4())
    try:
        with TestClient(app) as client:
            response = client.get("/weather/locations", params={"query": "Nagercoil"})
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert response.json()[0] == {
        "name": "Nagercoil",
        "display_name": "Nagercoil, Kanniyakumari, Tamil Nadu, India",
        "latitude": "8.17899",
        "longitude": "77.43227",
        "timezone": "Asia/Kolkata",
    }


def test_farm_forecast_maps_seven_days(monkeypatch) -> None:
    farm_id = uuid4()
    farm = SimpleNamespace(
        id=farm_id, owner_id=uuid4(), location="Nagercoil, Tamil Nadu",
        latitude=Decimal("8.178990"), longitude=Decimal("77.432270"),
    )
    session = AsyncMock()
    session.scalar.return_value = farm
    days = [f"2026-09-{day:02d}" for day in range(13, 20)]
    monkeypatch.setattr(weather, "fetch_json", AsyncMock(return_value={
        "timezone": "Asia/Kolkata",
        "current": {
            "time": "2026-09-13T12:00", "temperature_2m": 30.2,
            "relative_humidity_2m": 74, "precipitation": 0.0, "weather_code": 2,
        },
        "daily": {
            "time": days, "weather_code": [2, 61, 3, 3, 1, 2, 61],
            "temperature_2m_max": [31.0] * 7, "temperature_2m_min": [24.0] * 7,
            "precipitation_probability_max": [20, 80, 30, 10, 10, 20, 70],
            "precipitation_sum": [0.0, 8.2, 0.5, 0.0, 0.0, 0.0, 5.0],
            "et0_fao_evapotranspiration": [5.2, 2.1, 4.0, 5.5, 5.8, 4.8, 2.0],
        },
    }))

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=farm.owner_id)
    try:
        with TestClient(app) as client:
            response = client.get(f"/weather/farms/{farm_id}")
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert len(response.json()["days"]) == 7
    assert response.json()["days"][0]["weather_outlook"] == "High atmospheric water demand"
    assert response.json()["days"][1]["weather_outlook"] == "Rain likely; reassess irrigation after rainfall"
    assert response.json()["source"] == "Open-Meteo"