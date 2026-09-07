"""Authentication router: OTP + session."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..core import (
    create_access_token,
    current_user,
    db,
    generate_otp_code,
    is_expired,
    new_id,
    otp_digest,
    utc_now,
    DEMO_OTP_ENABLED,
)
from ..schemas import OtpVerification, PhoneRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp")
async def request_otp(body: PhoneRequest) -> dict[str, Any]:
    now = utc_now()
    recent = await db.otp_codes.find_one(
        {"phone": body.phone, "createdAt": {"$gte": now - timedelta(minutes=1)}}, {"_id": 0}
    )
    if recent:
        raise HTTPException(status_code=429, detail="Please wait before requesting another code")
    code = generate_otp_code()
    await db.otp_codes.update_one(
        {"phone": body.phone},
        {
            "$set": {
                "phone": body.phone,
                "digest": otp_digest(body.phone, code),
                "attempts": 0,
                "createdAt": now,
                "expiresAt": now + timedelta(minutes=5),
            }
        },
        upsert=True,
    )
    response: dict[str, Any] = {"ok": True, "expiresIn": 300}
    if DEMO_OTP_ENABLED:
        response["demoCode"] = code
    return response


@router.post("/verify-otp")
async def verify_otp(body: OtpVerification) -> dict[str, Any]:
    record = await db.otp_codes.find_one({"phone": body.phone}, {"_id": 0})
    if not record or is_expired(record.get("expiresAt")):
        raise HTTPException(status_code=401, detail="That code has expired")
    if record.get("attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts")
    if record["digest"] != otp_digest(body.phone, body.code):
        await db.otp_codes.update_one({"phone": body.phone}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=401, detail="The code is not correct")
    user = await db.users.find_one({"phone": body.phone}, {"_id": 0})
    if not user:
        user = {
            "id": new_id("user"),
            "phone": body.phone,
            "status": "active",
            "createdAt": utc_now(),
            "lastActiveAt": utc_now(),
            "onboardingComplete": False,
        }
        await db.users.insert_one(user.copy())
    else:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"lastActiveAt": utc_now(), "status": "active"}},
        )
    profile = await db.profiles.find_one({"userId": user["id"]}, {"_id": 0})
    return {
        "accessToken": create_access_token(user["id"]),
        "user": {
            "id": user["id"],
            "phone": user["phone"],
            "onboardingComplete": bool(profile and profile.get("displayName")),
        },
    }


@router.post("/logout")
async def logout(user: dict[str, Any] = Depends(current_user)) -> dict[str, bool]:
    await db.users.update_one({"id": user["id"]}, {"$set": {"lastActiveAt": utc_now()}})
    return {"ok": True}


@router.post("/heartbeat")
async def heartbeat(user: dict[str, Any] = Depends(current_user)) -> dict[str, bool]:
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"lastActiveAt": utc_now(), "lastHeartbeatAt": utc_now()}},
    )
    return {"ok": True}


@router.delete("/account")
async def delete_account(user: dict[str, Any] = Depends(current_user)) -> dict[str, bool]:
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"status": "deleted", "deletedAt": utc_now()}},
    )
    await db.profiles.update_one(
        {"userId": user["id"]},
        {"$set": {"status": "deleted", "displayName": "", "bio": "", "photos": []}},
    )
    await db.devices.update_many({"userId": user["id"]}, {"$set": {"enabled": False}})
    return {"ok": True}
