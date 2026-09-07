"""Profile router: read/update, photos, location."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..core import (
    UPLOADS_DIR,
    current_user,
    db,
    decode_photo,
    new_id,
    utc_now,
)
from ..schemas import LocationUpdate, PhotoUpload, ProfileUpdate
from ..services.config_service import get_config

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("")
async def get_profile(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    profile = await db.profiles.find_one({"userId": user["id"]}, {"_id": 0})
    photos = (
        await db.photos.find(
            {"userId": user["id"]},
            {"_id": 0, "dataUrl": 1, "id": 1, "isPrivate": 1, "sortOrder": 1},
        )
        .sort("sortOrder", 1)
        .to_list(6)
    )
    if not profile:
        return {
            "userId": user["id"],
            "displayName": "",
            "bio": "",
            "interests": [],
            "photos": [],
        }
    profile["photos"] = [
        {"id": photo["id"], "dataUrl": photo["dataUrl"], "isPrivate": bool(photo.get("isPrivate"))}
        for photo in photos
    ]
    return profile


@router.patch("")
async def update_profile(
    body: ProfileUpdate, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    config = await get_config()
    updates = body.model_dump(exclude_none=True)
    existing = await db.profiles.find_one({"userId": user["id"]}, {"_id": 0, "displayName": 1})
    for key in ("gender", "orientation", "relationshipPreference"):
        options_key = {
            "gender": "genderOptions",
            "orientation": "orientationOptions",
            "relationshipPreference": "relationshipOptions",
        }[key]
        if updates.get(key) and updates[key] not in config[options_key]:
            raise HTTPException(status_code=422, detail=f"Unsupported {key}")
    if updates.get("location"):
        updates["location"] = {
            "type": "Point",
            "coordinates": [
                updates["location"].get("longitude", 0),
                updates["location"].get("latitude", 0),
            ],
        }
    updates["updatedAt"] = utc_now()
    await db.profiles.update_one(
        {"userId": user["id"]},
        {"$set": {"userId": user["id"], "status": "active", **updates}},
        upsert=True,
    )
    is_complete = bool(updates.get("displayName") or (existing and existing.get("displayName")))
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"onboardingComplete": is_complete, "lastActiveAt": utc_now()}},
    )
    return await get_profile(user)


@router.post("/photos")
async def upload_profile_photo(
    body: PhotoUpload, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    extension, content = decode_photo(body.dataUrl)
    count = await db.photos.count_documents({"userId": user["id"]})
    if count >= 6:
        raise HTTPException(status_code=409, detail="You can add up to six photos")
    photo_id = new_id("photo")
    user_dir = UPLOADS_DIR / user["id"]
    user_dir.mkdir(parents=True, exist_ok=True)
    file_path = user_dir / f"{photo_id}.{extension}"
    await asyncio.to_thread(file_path.write_bytes, content)
    photo = {
        "id": photo_id,
        "userId": user["id"],
        "dataUrl": body.dataUrl,
        "path": str(file_path),
        "isPrivate": body.isPrivate,
        "sortOrder": count,
        "createdAt": utc_now(),
    }
    await db.photos.insert_one(photo.copy())
    return {"id": photo_id, "dataUrl": body.dataUrl, "isPrivate": body.isPrivate}


@router.delete("/photos/{photo_id}")
async def delete_profile_photo(
    photo_id: str, user: dict[str, Any] = Depends(current_user)
) -> dict[str, bool]:
    photo = await db.photos.find_one({"id": photo_id, "userId": user["id"]}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    await db.photos.delete_one({"id": photo_id, "userId": user["id"]})
    try:
        await asyncio.to_thread(Path(photo["path"]).unlink, True)
    except OSError:
        pass
    return {"ok": True}


@router.post("/location")
async def update_profile_location(
    body: LocationUpdate, user: dict[str, Any] = Depends(current_user)
) -> dict[str, bool]:
    point = {"type": "Point", "coordinates": [body.longitude, body.latitude]}
    await db.profiles.update_one(
        {"userId": user["id"]},
        {
            "$set": {
                "userId": user["id"],
                "status": "active",
                "location": point,
                "locationPermissionStatus": "granted",
                "lastLocationUpdate": utc_now(),
                "updatedAt": utc_now(),
            }
        },
        upsert=True,
    )
    return {"ok": True}
