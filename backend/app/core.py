"""Core primitives: env, database, security, utilities, dependencies."""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import jwt
from dotenv import load_dotenv
from fastapi import Depends, Header, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "punch_desk")
JWT_SECRET = os.getenv("JWT_SECRET", "development-only-change-me")
OTP_SECRET = os.getenv("OTP_SECRET", "development-otp-secret")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DEMO_OTP_ENABLED = os.getenv("DEMO_OTP_ENABLED", "true").lower() == "true"

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
RAZORPAY_PLAN_ID = os.getenv("RAZORPAY_PLAN_ID")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET")

FIREBASE_SERVICE_ACCOUNT = os.getenv("FIREBASE_SERVICE_ACCOUNT")  # path to JSON or inline JSON
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")
INACTIVITY_DAYS = int(os.getenv("INACTIVITY_DAYS", "30"))

if ENVIRONMENT == "production" and len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET must be at least 32 characters in production")

logger = logging.getLogger("punch_desk")
logging.basicConfig(level=logging.INFO)

client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=1500)
db = client[DB_NAME]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def is_expired(value: Any) -> bool:
    if not isinstance(value, datetime):
        return True
    normalized = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return normalized < utc_now()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def otp_digest(phone: str, code: str) -> str:
    return hmac.new(OTP_SECRET.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": utc_now() + timedelta(days=30), "iat": utc_now()}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_access_token(token: str) -> str:
    payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    return payload.get("sub", "")


def decode_photo(data_url: str) -> tuple[str, bytes]:
    header, separator, encoded = data_url.partition(",")
    if not separator or not header.startswith("data:image/"):
        raise HTTPException(status_code=422, detail="Upload a valid image")
    extension = header.split("/", 1)[1].split(";", 1)[0].lower()
    extension = "jpg" if extension == "jpeg" else extension
    if extension not in {"jpg", "png", "webp"} or ";base64" not in header:
        raise HTTPException(status_code=422, detail="Only JPG, PNG, and WebP images are supported")
    try:
        content = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=422, detail="That image could not be read") from exc
    if not content or len(content) > 6 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Images must be smaller than 6 MB")
    return extension, content


def public_profile(document: dict[str, Any], distance: float | None = None) -> dict[str, Any]:
    return {
        "id": document.get("userId") or document.get("id"),
        "displayName": document.get("displayName", "Nearby member"),
        "age": document.get("age", 0),
        "distance": round(distance, 1) if distance is not None else document.get("distance", 0),
        "verified": bool(document.get("verified", False)),
        "bio": document.get("bio", ""),
        "interests": document.get("interests", []),
        "photos": [photo for photo in document.get("photos", []) if isinstance(photo, str)],
        "online": bool(document.get("online", False)),
    }


async def current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue")
    try:
        user_id = decode_access_token(authorization.split(" ", 1)[1])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session has expired") from exc
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("status") in {"banned", "deleted"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    return user


async def admin_guard(x_admin_key: str | None = Header(default=None)) -> None:
    if not ADMIN_API_KEY:
        raise HTTPException(status_code=503, detail="Admin access is not configured")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, ADMIN_API_KEY):
        raise HTTPException(status_code=403, detail="Admin access denied")


def generate_otp_code() -> str:
    return "123456" if DEMO_OTP_ENABLED else f"{secrets.randbelow(1000000):06d}"


__all__ = [
    "ROOT_DIR",
    "UPLOADS_DIR",
    "MONGO_URL",
    "DB_NAME",
    "JWT_SECRET",
    "ENVIRONMENT",
    "DEMO_OTP_ENABLED",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_PLAN_ID",
    "RAZORPAY_WEBHOOK_SECRET",
    "FIREBASE_SERVICE_ACCOUNT",
    "FIREBASE_PROJECT_ID",
    "ADMIN_API_KEY",
    "INACTIVITY_DAYS",
    "logger",
    "client",
    "db",
    "utc_now",
    "is_expired",
    "new_id",
    "otp_digest",
    "create_access_token",
    "decode_access_token",
    "decode_photo",
    "public_profile",
    "current_user",
    "admin_guard",
    "generate_otp_code",
    "Depends",
]
