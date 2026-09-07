"""Device registration for FCM/Expo push tokens."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..core import current_user, db, utc_now
from ..schemas import DeviceRegistration

router = APIRouter(tags=["devices"])


@router.post("/devices")
async def register_device(
    body: DeviceRegistration, user: dict[str, Any] = Depends(current_user)
) -> dict[str, bool]:
    await db.devices.update_one(
        {"userId": user["id"], "token": body.token},
        {
            "$set": {
                "userId": user["id"],
                **body.model_dump(),
                "enabled": True,
                "lastActiveAt": utc_now(),
            }
        },
        upsert=True,
    )
    return {"ok": True}


@router.delete("/devices/{token}")
async def unregister_device(
    token: str, user: dict[str, Any] = Depends(current_user)
) -> dict[str, bool]:
    await db.devices.update_one(
        {"userId": user["id"], "token": token}, {"$set": {"enabled": False}}
    )
    return {"ok": True}
