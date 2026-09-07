from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

import jwt
import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

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
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")

if ENVIRONMENT == "production" and len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET must be at least 32 characters in production")

client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=1500)
db = client[DB_NAME]
api_router = APIRouter(prefix="/api")
logger = logging.getLogger("punch_desk")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def is_expired(value: Any) -> bool:
    if not isinstance(value, datetime):
        return True
    normalized = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return normalized < utc_now()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class AppConfig(BaseModel):
    appName: str = "Punch Desk"
    tagline: str = "Meet people who are actually nearby."
    datingMode: str = "gay"
    logo: str = "punch-desk"
    theme: dict[str, str] = {
        "primary": "#D4AF37",
        "secondary": "#8C7124",
        "background": "#0C0D10",
        "card": "#16181D",
        "text": "#F4F4F6",
        "muted": "#8A8F9D",
        "radius": "large",
    }
    genderOptions: list[str] = ["Man", "Non-binary", "Prefer not to say"]
    orientationOptions: list[str] = ["Gay", "Bisexual", "Queer", "Prefer not to say"]
    relationshipOptions: list[str] = ["Something casual", "Something meaningful", "Open to see where it goes"]
    interests: list[str] = ["Coffee", "Design", "Travel", "Music", "Fitness", "Food"]
    profileFields: list[dict[str, Any]] = [
        {"key": "displayName", "label": "Display name", "type": "text", "required": True},
        {"key": "bio", "label": "Bio", "type": "textarea", "required": False},
        {"key": "gender", "label": "Gender", "type": "select", "required": True},
        {"key": "orientation", "label": "Orientation", "type": "select", "required": True},
        {"key": "relationshipPreference", "label": "Looking for", "type": "select", "required": False},
    ]
    location: dict[str, Any] = {"required": True, "minRadius": 5, "defaultRadius": 25, "maxRadius": 50}
    permissions: dict[str, bool] = {"locationRequired": True, "notificationsRequired": False}
    features: dict[str, bool] = {
        "chat": True,
        "photoRequests": True,
        "subscriptions": True,
        "location": True,
        "matching": True,
        "reports": True,
        "support": True,
    }
    presence: dict[str, bool] = {"enabled": True, "showLastActive": True}


class PhoneRequest(BaseModel):
    phone: str = Field(min_length=7, max_length=20)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        normalized = "".join(character for character in value if character.isdigit() or character == "+")
        if len(normalized.replace("+", "")) < 7:
            raise ValueError("Enter a valid mobile number")
        return normalized


class OtpVerification(PhoneRequest):
    code: str = Field(min_length=4, max_length=8)


class ProfileUpdate(BaseModel):
    displayName: str | None = Field(default=None, max_length=48)
    bio: str | None = Field(default=None, max_length=280)
    gender: str | None = None
    orientation: str | None = None
    relationshipPreference: str | None = None
    interests: list[str] | None = Field(default=None, max_length=12)
    photos: list[str] | None = Field(default=None, max_length=6)
    location: dict[str, float] | None = None


class DeviceRegistration(BaseModel):
    token: str = Field(min_length=8, max_length=4096)
    platform: Literal["ios", "android", "web"]
    provider: Literal["fcm", "expo"] = "fcm"
    appVersion: str | None = None


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class AdminConfigUpdate(BaseModel):
    appName: str | None = None
    tagline: str | None = None
    datingMode: str | None = None
    theme: dict[str, str] | None = None
    genderOptions: list[str] | None = None
    orientationOptions: list[str] | None = None
    relationshipOptions: list[str] | None = None
    profileFields: list[dict[str, Any]] | None = None
    location: dict[str, Any] | None = None
    permissions: dict[str, bool] | None = None
    features: dict[str, bool] | None = None


def otp_digest(phone: str, code: str) -> str:
    return hmac.new(OTP_SECRET.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": utc_now() + timedelta(days=30), "iat": utc_now()}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue")
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session has expired") from exc
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not user or user.get("status") in {"banned", "deleted"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    return user


async def admin_guard(x_admin_key: str | None = Header(default=None)) -> None:
    if not ADMIN_API_KEY:
        raise HTTPException(status_code=503, detail="Admin access is not configured")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, ADMIN_API_KEY):
        raise HTTPException(status_code=403, detail="Admin access denied")


async def ensure_config() -> None:
    if await db.app_config.find_one({"key": "app"}, {"_id": 0}):
        return
    config = AppConfig().model_dump()
    await db.app_config.insert_one({"key": "app", **config, "updatedAt": utc_now()})


async def get_config() -> dict[str, Any]:
    await ensure_config()
    config = await db.app_config.find_one({"key": "app"}, {"_id": 0, "key": 0})
    return config or AppConfig().model_dump()


async def seed_demo_data() -> None:
    await ensure_config()
    if await db.subscription_plans.count_documents({}) == 0:
        await db.subscription_plans.insert_many([
            {"id": "plan_free", "name": "Free", "price": 0, "period": "forever", "description": "A simple way to start meeting nearby people.", "features": ["Nearby discovery", "Unlimited chat"]},
            {"id": "plan_premium", "name": "Premium", "price": 799, "period": "month", "description": "More visibility, more control, more possibility.", "features": ["Priority discovery", "Unlimited likes", "Private photo requests"]},
        ])
    if await db.demo_profiles.count_documents({}) == 0:
        await db.demo_profiles.insert_many([
            {"id": "profile_aaron", "displayName": "Aaron", "age": 29, "distance": 2.4, "verified": True, "bio": "Weekend coffee walks and finding the best hidden rooms in the city.", "interests": ["Coffee", "Design", "Travel"], "photos": [], "online": True},
            {"id": "profile_miles", "displayName": "Miles", "age": 31, "distance": 4.8, "verified": True, "bio": "Music, good food, and conversations that run a little too late.", "interests": ["Music", "Food", "Travel"], "photos": [], "online": False},
            {"id": "profile_jules", "displayName": "Jules", "age": 27, "distance": 7.1, "verified": False, "bio": "Creative by day, always looking for the next gallery or great meal.", "interests": ["Design", "Food", "Fitness"], "photos": [], "online": True},
        ])


class RazorpayProvider:
    def configured(self) -> bool:
        return bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET and RAZORPAY_PLAN_ID)

    async def create_subscription(self, user_id: str) -> dict[str, Any]:
        if not self.configured():
            raise HTTPException(status_code=503, detail="Subscription payments are being configured")
        payload = {"plan_id": RAZORPAY_PLAN_ID, "total_count": 12, "quantity": 1, "customer_notify": True, "notes": {"user_id": user_id}}
        response = await __import__("asyncio").to_thread(
            requests.post,
            "https://api.razorpay.com/v1/subscriptions",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json=payload,
            timeout=15,
        )
        if response.status_code >= 400:
            logger.error("Razorpay create subscription failed: %s", response.text[:200])
            raise HTTPException(status_code=502, detail="We could not start the subscription")
        return {**response.json(), "key_id": RAZORPAY_KEY_ID}

    def verify_checkout(self, payment_id: str, subscription_id: str, signature: str) -> bool:
        if not RAZORPAY_KEY_SECRET:
            return False
        digest = hmac.new(RAZORPAY_KEY_SECRET.encode(), f"{payment_id}|{subscription_id}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(digest, signature)


@api_router.get("/")
async def root() -> dict[str, str]:
    return {"name": "Punch Desk API", "status": "ready", "version": "1.0"}


@api_router.get("/health")
async def health() -> dict[str, str]:
    try:
        await db.command("ping")
        return {"status": "ok", "database": "connected"}
    except Exception:
        return {"status": "ok", "database": "starting"}


@api_router.get("/config/app", response_model=AppConfig)
async def app_config() -> dict[str, Any]:
    return await get_config()


@api_router.post("/auth/request-otp")
async def request_otp(body: PhoneRequest) -> dict[str, Any]:
    now = utc_now()
    recent = await db.otp_codes.find_one({"phone": body.phone, "createdAt": {"$gte": now - timedelta(minutes=1)}}, {"_id": 0})
    if recent:
        raise HTTPException(status_code=429, detail="Please wait before requesting another code")
    code = "123456" if DEMO_OTP_ENABLED else f"{secrets.randbelow(1000000):06d}"
    await db.otp_codes.update_one(
        {"phone": body.phone},
        {"$set": {"phone": body.phone, "digest": otp_digest(body.phone, code), "attempts": 0, "createdAt": now, "expiresAt": now + timedelta(minutes=5)}},
        upsert=True,
    )
    response: dict[str, Any] = {"ok": True, "expiresIn": 300}
    if DEMO_OTP_ENABLED:
        response["demoCode"] = code
    return response


@api_router.post("/auth/verify-otp")
async def verify_otp(body: OtpVerification) -> dict[str, Any]:
    record = await db.otp_codes.find_one({"phone": body.phone}, {"_id": 0})
    if not record or is_expired(record.get("expiresAt")):
        raise HTTPException(status_code=401, detail="That code has expired")
    if record.get("attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts")
    if not hmac.compare_digest(record["digest"], otp_digest(body.phone, body.code)):
        await db.otp_codes.update_one({"phone": body.phone}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=401, detail="The code is not correct")
    user = await db.users.find_one({"phone": body.phone}, {"_id": 0})
    if not user:
        user = {"id": new_id("user"), "phone": body.phone, "status": "active", "createdAt": utc_now(), "lastActiveAt": utc_now(), "onboardingComplete": False}
        await db.users.insert_one(user.copy())
    else:
        await db.users.update_one({"id": user["id"]}, {"$set": {"lastActiveAt": utc_now(), "status": "active"}})
    profile = await db.profiles.find_one({"userId": user["id"]}, {"_id": 0})
    return {"accessToken": create_access_token(user["id"]), "user": {"id": user["id"], "phone": user["phone"], "onboardingComplete": bool(profile and profile.get("displayName"))}}


@api_router.post("/auth/logout")
async def logout(user: dict[str, Any] = Depends(current_user)) -> dict[str, bool]:
    await db.users.update_one({"id": user["id"]}, {"$set": {"lastActiveAt": utc_now()}})
    return {"ok": True}


@api_router.get("/profile")
async def get_profile(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    profile = await db.profiles.find_one({"userId": user["id"]}, {"_id": 0})
    return profile or {"userId": user["id"], "displayName": "", "bio": "", "interests": [], "photos": []}


@api_router.patch("/profile")
async def update_profile(body: ProfileUpdate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    config = await get_config()
    updates = body.model_dump(exclude_none=True)
    existing = await db.profiles.find_one({"userId": user["id"]}, {"_id": 0, "displayName": 1})
    for key in ("gender", "orientation", "relationshipPreference"):
        options_key = {"gender": "genderOptions", "orientation": "orientationOptions", "relationshipPreference": "relationshipOptions"}[key]
        if updates.get(key) and updates[key] not in config[options_key]:
            raise HTTPException(status_code=422, detail=f"Unsupported {key}")
    if updates.get("location"):
        updates["location"] = {"type": "Point", "coordinates": [updates["location"].get("longitude", 0), updates["location"].get("latitude", 0)]}
    updates["updatedAt"] = utc_now()
    await db.profiles.update_one({"userId": user["id"]}, {"$set": {"userId": user["id"], **updates}}, upsert=True)
    is_complete = bool(updates.get("displayName") or (existing and existing.get("displayName")))
    await db.users.update_one({"id": user["id"]}, {"$set": {"onboardingComplete": is_complete, "lastActiveAt": utc_now()}})
    return await get_profile(user)


@api_router.get("/discovery")
async def discovery(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    config = await get_config()
    seen = {item["targetId"] for item in await db.interactions.find({"userId": user["id"]}, {"_id": 0, "targetId": 1}).to_list(500)}
    profiles = await db.demo_profiles.find({"id": {"$nin": list(seen)}} if seen else {}, {"_id": 0}).to_list(30)
    return {"profiles": profiles, "radius": config["location"]["defaultRadius"], "maxRadius": config["location"]["maxRadius"], "hasLocation": True}


async def record_interaction(user_id: str, target_id: str, action: str) -> None:
    await db.interactions.update_one({"userId": user_id, "targetId": target_id}, {"$set": {"userId": user_id, "targetId": target_id, "action": action, "createdAt": utc_now()}}, upsert=True)


@api_router.post("/discovery/{target_id}/like")
async def like_profile(target_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    await record_interaction(user["id"], target_id, "like")
    reciprocal = await db.interactions.find_one({"userId": target_id, "targetId": user["id"], "action": "like"}, {"_id": 0})
    if not reciprocal:
        return {"liked": True, "matched": False}
    match_id = new_id("match")
    await db.matches.update_one({"users": {"$all": [user["id"], target_id]}}, {"$setOnInsert": {"id": match_id, "users": [user["id"], target_id], "matchedAt": utc_now()}}, upsert=True)
    match = await db.matches.find_one({"users": {"$all": [user["id"], target_id]}}, {"_id": 0})
    return {"liked": True, "matched": True, "match": match}


@api_router.post("/discovery/{target_id}/pass")
async def pass_profile(target_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, bool]:
    await record_interaction(user["id"], target_id, "pass")
    return {"passed": True}


@api_router.get("/matches")
async def matches(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    rows = await db.matches.find({"users": user["id"]}, {"_id": 0}).sort("matchedAt", -1).to_list(100)
    return {"matches": rows}


@api_router.get("/chat/{conversation_id}/messages")
async def get_messages(conversation_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    conversation = await db.conversations.find_one({"id": conversation_id, "users": user["id"]}, {"_id": 0})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = await db.messages.find({"conversationId": conversation_id}, {"_id": 0}).sort("createdAt", -1).limit(50).to_list(50)
    return {"messages": list(reversed(messages))}


@api_router.post("/chat/{conversation_id}/messages")
async def send_message(conversation_id: str, body: MessageCreate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    conversation = await db.conversations.find_one({"id": conversation_id, "users": user["id"]}, {"_id": 0})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    message = {"id": new_id("msg"), "conversationId": conversation_id, "senderId": user["id"], "body": body.body, "createdAt": utc_now(), "status": "sent"}
    await db.messages.insert_one(message.copy())
    await db.conversations.update_one({"id": conversation_id}, {"$set": {"lastMessage": body.body, "lastMessageAt": message["createdAt"]}})
    return message


@api_router.post("/devices")
async def register_device(body: DeviceRegistration, user: dict[str, Any] = Depends(current_user)) -> dict[str, bool]:
    await db.devices.update_one({"userId": user["id"], "token": body.token}, {"$set": {"userId": user["id"], **body.model_dump(), "enabled": True, "lastActiveAt": utc_now()}}, upsert=True)
    return {"ok": True}


@api_router.get("/subscriptions/plans")
async def subscription_plans() -> dict[str, Any]:
    plans = await db.subscription_plans.find({}, {"_id": 0}).to_list(20)
    return {"plans": plans}


@api_router.post("/subscriptions/checkout")
async def create_checkout(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    result = await RazorpayProvider().create_subscription(user["id"])
    subscription_id = result.get("id")
    await db.payments.update_one({"userId": user["id"], "subscriptionId": subscription_id}, {"$set": {"userId": user["id"], "subscriptionId": subscription_id, "status": "pending", "createdAt": utc_now()}}, upsert=True)
    return result


class CheckoutVerification(BaseModel):
    paymentId: str
    subscriptionId: str
    signature: str


@api_router.post("/subscriptions/verify")
async def verify_checkout(body: CheckoutVerification, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if not RazorpayProvider().verify_checkout(body.paymentId, body.subscriptionId, body.signature):
        raise HTTPException(status_code=400, detail="Payment verification failed")
    await db.payments.update_one({"userId": user["id"], "subscriptionId": body.subscriptionId}, {"$set": {"paymentId": body.paymentId, "status": "active", "verifiedAt": utc_now()}})
    return {"active": True}


@api_router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request, x_razorpay_signature: str | None = Header(default=None), x_razorpay_event_id: str | None = Header(default=None)) -> dict[str, Any]:
    raw = await request.body()
    if not RAZORPAY_WEBHOOK_SECRET or not x_razorpay_signature:
        raise HTTPException(status_code=503, detail="Payment webhooks are not configured")
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    if not x_razorpay_event_id:
        raise HTTPException(status_code=400, detail="Missing webhook event id")
    inserted = await db.webhook_events.update_one({"eventId": x_razorpay_event_id}, {"$setOnInsert": {"eventId": x_razorpay_event_id, "receivedAt": utc_now()}}, upsert=True)
    return {"ok": True, "duplicate": not inserted.upserted_id}


@api_router.get("/admin/overview")
async def admin_overview(_: None = Depends(admin_guard)) -> dict[str, Any]:
    return {
        "metrics": {
            "users": await db.users.count_documents({"status": {"$ne": "deleted"}}),
            "activeUsers": await db.users.count_documents({"lastActiveAt": {"$gte": utc_now() - timedelta(days=7)}}),
            "matches": await db.matches.count_documents({}),
            "messages": await db.messages.count_documents({}),
            "activeSubscriptions": await db.payments.count_documents({"status": "active"}),
            "reports": await db.reports.count_documents({"status": {"$in": ["open", "in_review"]}}),
        },
        "config": await get_config(),
    }


@api_router.patch("/admin/config")
async def update_admin_config(body: AdminConfigUpdate, _: None = Depends(admin_guard)) -> dict[str, Any]:
    updates = body.model_dump(exclude_none=True)
    if updates:
        await db.app_config.update_one({"key": "app"}, {"$set": {**updates, "updatedAt": utc_now()}}, upsert=True)
    return await get_config()


app = FastAPI(title="Punch Desk API", version="1.0.0", description="Reusable, configuration-driven dating engine API")
app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup() -> None:
    try:
        await db.app_config.create_index("key", unique=True)
        await db.otp_codes.create_index("expiresAt", expireAfterSeconds=0)
        await db.profiles.create_index([("location", "2dsphere")])
        await db.interactions.create_index([("userId", 1), ("targetId", 1)], unique=True)
        await db.messages.create_index([("conversationId", 1), ("createdAt", -1)])
        await db.devices.create_index([("userId", 1), ("token", 1)], unique=True)
        await db.webhook_events.create_index("eventId", unique=True)
        await seed_demo_data()
    except Exception as exc:
        logger.warning("MongoDB is not ready during startup: %s", exc)


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()