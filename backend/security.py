from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from typing import Annotated
from uuid import UUID, uuid4

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, settings
from models import AccountSession, User

password_hasher = PasswordHash.recommended()
dummy_password_hash = password_hasher.hash(token_urlsafe(32))
bearer_scheme = HTTPBearer(auto_error=False, bearerFormat="JWT")


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def create_access_token(user_id: UUID, session_id: UUID | None = None) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "nbf": now,
            "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
            "iss": "agrisense-api",
            "aud": "agrisense-app",
            "token_type": "access",
            "jti": str(session_id or uuid4()),
        },
        settings.jwt_secret_key.get_secret_value(),
        algorithm="HS256",
    )


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if credentials is None:
        raise unauthorized()

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=["HS256"],
            issuer="agrisense-api",
            audience="agrisense-app",
            options={"require": ["sub", "iat", "nbf", "exp", "iss", "aud", "token_type", "jti"]},
        )
        if payload["token_type"] != "access":
            raise jwt.InvalidTokenError()
        user_id = UUID(payload["sub"])
        session_id = UUID(payload["jti"])
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise unauthorized() from None

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized()
    account_session = await session.get(AccountSession, session_id)
    if (account_session is None or account_session.user_id != user.id
            or account_session.revoked_at is not None
            or account_session.expires_at <= datetime.now(timezone.utc)):
        raise unauthorized()
    request.state.account_session_id = session_id
    return user