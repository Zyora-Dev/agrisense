from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, StringConstraints, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from database import get_db, settings
from models import AccountSession, AuditEvent, User
from security import create_access_token, dummy_password_hash, get_current_user, password_hasher, unauthorized

router = APIRouter(prefix="/auth", tags=["Authentication"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def record_event(session: AsyncSession, user_id: UUID, action: str, request: Request) -> None:
    session.add(AuditEvent(user_id=user_id, action=action, user_agent=request.headers.get("user-agent", "Unknown browser")[:300]))


async def check_attempts(session: AsyncSession, user_id: UUID) -> None:
    failures = await session.scalar(select(func.count()).select_from(AuditEvent).where(
        AuditEvent.user_id == user_id,
        AuditEvent.action.in_(["login.failed", "password.failed"]),
        AuditEvent.created_at >= datetime.now(timezone.utc) - timedelta(minutes=15),
    ))
    if failures >= 10:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in 15 minutes.", headers={"Retry-After": "900"})


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=254)
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class RegisterRequest(LoginRequest):
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    password: SecretStr = Field(min_length=12, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    full_name: str
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(payload: RegisterRequest, session: DatabaseSession) -> User:
    user = User(
        email=str(payload.email),
        full_name=payload.full_name,
        password_hash=await run_in_threadpool(password_hasher.hash, payload.password.get_secret_value()),
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing_id = await session.scalar(select(User.id).where(User.email == payload.email))
        if existing_id is not None:
            raise HTTPException(status_code=409, detail="Email already registered") from None
        raise
    await session.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: DatabaseSession, response: Response, request: Request) -> TokenResponse:
    user = await session.scalar(select(User).where(User.email == payload.email).with_for_update())
    if user is not None:
        await check_attempts(session, user.id)
    stored_hash = user.password_hash if user is not None else dummy_password_hash
    valid_password = await run_in_threadpool(password_hasher.verify, payload.password.get_secret_value(), stored_hash)
    if user is None or not valid_password or not user.is_active:
        if user is not None:
            record_event(session, user.id, "login.failed", request)
            await session.commit()
        raise unauthorized()

    session_id = uuid4()
    session.add(AccountSession(
        id=session_id, user_id=user.id,
        user_agent=request.headers.get("user-agent", "Unknown browser")[:300],
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes),
    ))
    record_event(session, user.id, "login.succeeded", request)
    await session.commit()
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return TokenResponse(
        access_token=create_access_token(user.id, session_id),
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.get("/me", response_model=UserResponse)
async def current_user(user: Annotated[User, Depends(get_current_user)], response: Response) -> User:
    response.headers["Cache-Control"] = "no-store"
    return user


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: SecretStr = Field(min_length=1, max_length=128)
    new_password: SecretStr = Field(min_length=12, max_length=128)


@router.put("/profile", response_model=UserResponse)
async def update_profile(payload: ProfileUpdate, user: CurrentUser, session: DatabaseSession, request: Request) -> User:
    user.full_name = payload.full_name
    record_event(session, user.id, "profile.updated", request)
    await session.commit()
    return user


@router.post("/password", status_code=204)
async def change_password(payload: PasswordChange, user: CurrentUser, session: DatabaseSession, request: Request) -> None:
    locked_user = await session.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
    await check_attempts(session, user.id)
    valid = await run_in_threadpool(password_hasher.verify, payload.current_password.get_secret_value(), locked_user.password_hash)
    if not valid:
        record_event(session, user.id, "password.failed", request)
        await session.commit()
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if payload.current_password.get_secret_value() == payload.new_password.get_secret_value():
        raise HTTPException(status_code=422, detail="Choose a different new password.")
    locked_user.password_hash = await run_in_threadpool(password_hasher.hash, payload.new_password.get_secret_value())
    await session.execute(update(AccountSession).where(
        AccountSession.user_id == user.id, AccountSession.revoked_at.is_(None),
    ).values(revoked_at=datetime.now(timezone.utc)))
    record_event(session, user.id, "password.changed", request)
    await session.commit()


class SessionResponse(BaseModel):
    id: UUID
    user_agent: str
    created_at: datetime
    expires_at: datetime
    is_current: bool


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(user: CurrentUser, session: DatabaseSession, request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    records = (await session.scalars(select(AccountSession).where(
        AccountSession.user_id == user.id, AccountSession.revoked_at.is_(None),
        AccountSession.expires_at > datetime.now(timezone.utc),
    ).order_by(AccountSession.created_at.desc(), AccountSession.id.desc()))).all()
    return [SessionResponse(id=record.id, user_agent=record.user_agent, created_at=record.created_at,
                            expires_at=record.expires_at, is_current=record.id == request.state.account_session_id)
            for record in records]


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_session(session_id: UUID, user: CurrentUser, session: DatabaseSession, request: Request) -> None:
    record = await session.scalar(select(AccountSession).where(
        AccountSession.id == session_id, AccountSession.user_id == user.id,
    ).with_for_update())
    if record is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    if record.revoked_at is None:
        record.revoked_at = datetime.now(timezone.utc)
        record_event(session, user.id, "session.revoked", request)
        await session.commit()


@router.post("/sessions/revoke-others", status_code=204)
async def revoke_other_sessions(user: CurrentUser, session: DatabaseSession, request: Request) -> None:
    await session.scalar(select(User).where(User.id == user.id).with_for_update())
    await session.execute(update(AccountSession).where(
        AccountSession.user_id == user.id, AccountSession.id != request.state.account_session_id,
        AccountSession.revoked_at.is_(None),
    ).values(revoked_at=datetime.now(timezone.utc)))
    record_event(session, user.id, "sessions.others_revoked", request)
    await session.commit()


@router.post("/logout", status_code=204)
async def logout(user: CurrentUser, session: DatabaseSession, request: Request) -> None:
    await session.execute(update(AccountSession).where(
        AccountSession.id == request.state.account_session_id,
        AccountSession.user_id == user.id,
    ).values(revoked_at=datetime.now(timezone.utc)))
    record_event(session, user.id, "logout.succeeded", request)
    await session.commit()


class AuditResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    action: str
    user_agent: str
    created_at: datetime


class AuditPage(BaseModel):
    items: list[AuditResponse]
    total: int
    page: int
    page_size: int


@router.get("/audit", response_model=AuditPage)
async def audit_log(
    user: CurrentUser, session: DatabaseSession, response: Response,
    page: Annotated[int, Query(ge=1, le=100000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    start_date: date | None = None, end_date: date | None = None,
    action: Annotated[str | None, Query(max_length=60)] = None,
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="Start date must not be after end date.")
    filters = [AuditEvent.user_id == user.id]
    if start_date:
        filters.append(AuditEvent.created_at >= datetime.combine(start_date, datetime.min.time(), timezone.utc))
    if end_date:
        filters.append(AuditEvent.created_at <= datetime.combine(end_date, datetime.max.time(), timezone.utc))
    if action:
        filters.append(AuditEvent.action == action)
    total = await session.scalar(select(func.count()).select_from(AuditEvent).where(*filters))
    events = (await session.scalars(select(AuditEvent).where(*filters).order_by(
        AuditEvent.created_at.desc(), AuditEvent.id.desc(),
    ).offset((page - 1) * page_size).limit(page_size))).all()
    response.headers["Cache-Control"] = "no-store"
    return AuditPage(items=events, total=total, page=page, page_size=page_size)