from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from analysis import router as analysis_router
from auth import router as auth_router
from database import engine, get_db
from farms import router as farms_router
from gemini import router as gemini_router
from marketplace import router as marketplace_router
from readings import router as readings_router
from weather import router as weather_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(
    title="AgriSense API",
    description="Backend API for AgriSense smart farming.",
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(auth_router)
app.include_router(farms_router)
app.include_router(readings_router)
app.include_router(analysis_router)
app.include_router(gemini_router)
app.include_router(marketplace_router)
app.include_router(weather_router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exception: RequestValidationError) -> JSONResponse:
    errors = [{key: error[key] for key in ("type", "loc", "msg")} for error in exception.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "agrisense-api"}


@app.get(
    "/health/db",
    tags=["Health"],
    responses={503: {"description": "Database unavailable"}},
)
async def database_health_check(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    try:
        database_name = await session.scalar(text("SELECT current_database()"))
    except (SQLAlchemyError, OSError, TimeoutError):
        raise HTTPException(status_code=503, detail="Database unavailable") from None

    return {"status": "ok", "database": database_name}