from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from farms import owned_farm
from models import User
from security import get_current_user

router = APIRouter(prefix="/weather", tags=["Weather"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


class LocationResult(BaseModel):
    name: str
    display_name: str
    latitude: Decimal
    longitude: Decimal
    timezone: str | None = None


class CurrentWeather(BaseModel):
    observed_at: datetime
    temperature_c: float
    relative_humidity_percent: int
    precipitation_mm: float
    weather_code: int


class ForecastDay(BaseModel):
    date: date
    weather_code: int
    temperature_max_c: float
    temperature_min_c: float
    precipitation_probability_percent: int
    precipitation_mm: float
    reference_evapotranspiration_mm: float
    weather_outlook: str


class WeatherForecast(BaseModel):
    farm_id: UUID
    location: str
    latitude: Decimal
    longitude: Decimal
    timezone: str
    current: CurrentWeather
    days: list[ForecastDay]
    source: str = "Open-Meteo"
    attribution_url: str = "https://open-meteo.com/"
    retrieved_at: datetime


async def fetch_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=503, detail="Weather service unavailable") from None


def location_label(result: dict[str, Any]) -> str:
    parts = [result.get("name"), result.get("admin2"), result.get("admin1"), result.get("country")]
    return ", ".join(dict.fromkeys(part for part in parts if part))


def weather_outlook(precipitation_probability: int, precipitation_mm: float, et0_mm: float) -> str:
    if precipitation_probability >= 60 or precipitation_mm >= 5:
        return "Rain likely; reassess irrigation after rainfall"
    if et0_mm >= 5:
        return "High atmospheric water demand"
    if precipitation_probability <= 20 and precipitation_mm < 1:
        return "Dry conditions likely"
    return "Monitor rainfall and soil moisture"


@router.get("/locations", response_model=list[LocationResult])
async def search_locations(
    user: CurrentUser,
    query: Annotated[str, Query(min_length=2, max_length=100)],
) -> list[LocationResult]:
    data = await fetch_json(GEOCODING_URL, {
        "name": query,
        "count": 8,
        "language": "en",
        "format": "json",
    })
    return [
        LocationResult(
            name=result["name"],
            display_name=location_label(result),
            latitude=result["latitude"],
            longitude=result["longitude"],
            timezone=result.get("timezone"),
        )
        for result in data.get("results", [])
        if "name" in result and "latitude" in result and "longitude" in result
    ]


@router.get("/farms/{farm_id}", response_model=WeatherForecast)
async def get_farm_forecast(
    farm_id: UUID,
    session: DatabaseSession,
    user: CurrentUser,
) -> WeatherForecast:
    farm = await owned_farm(session, farm_id, user.id)
    if farm.latitude is None or farm.longitude is None:
        raise HTTPException(status_code=422, detail="Select an exact farm location before loading weather")

    data = await fetch_json(FORECAST_URL, {
        "latitude": farm.latitude,
        "longitude": farm.longitude,
        "current": "temperature_2m,relative_humidity_2m,precipitation,weather_code",
        "daily": (
            "weather_code,temperature_2m_max,temperature_2m_min,"
            "precipitation_probability_max,precipitation_sum,et0_fao_evapotranspiration"
        ),
        "forecast_days": 7,
        "timezone": "auto",
    })
    try:
        current = data["current"]
        daily = data["daily"]
        days = [
            ForecastDay(
                date=day,
                weather_code=daily["weather_code"][index],
                temperature_max_c=daily["temperature_2m_max"][index],
                temperature_min_c=daily["temperature_2m_min"][index],
                precipitation_probability_percent=daily["precipitation_probability_max"][index],
                precipitation_mm=daily["precipitation_sum"][index],
                reference_evapotranspiration_mm=daily["et0_fao_evapotranspiration"][index],
                weather_outlook=weather_outlook(
                    daily["precipitation_probability_max"][index],
                    daily["precipitation_sum"][index],
                    daily["et0_fao_evapotranspiration"][index],
                ),
            )
            for index, day in enumerate(daily["time"])
        ]
        return WeatherForecast(
            farm_id=farm.id,
            location=farm.location,
            latitude=farm.latitude,
            longitude=farm.longitude,
            timezone=data["timezone"],
            current=CurrentWeather(
                observed_at=current["time"],
                temperature_c=current["temperature_2m"],
                relative_humidity_percent=current["relative_humidity_2m"],
                precipitation_mm=current["precipitation"],
                weather_code=current["weather_code"],
            ),
            days=days,
            retrieved_at=datetime.now(timezone.utc),
        )
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=503, detail="Weather service returned incomplete data") from None