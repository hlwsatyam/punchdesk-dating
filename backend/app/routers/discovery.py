"""Discovery + like/pass + matches."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from ..core import DEMO_OTP_ENABLED, current_user, db, logger, public_profile
from ..services.config_service import get_config
from ..services.matching import (
    ensure_match,
    make_explanation,
    record_interaction,
    shared_interests,
)
from ..services.notifications import send_to_user

router = APIRouter(tags=["discovery"])


async def _blocked_ids(user_id: str) -> set[str]:
    blocks = await db.blocks.find(
        {"$or": [{"userId": user_id}, {"targetUserId": user_id}]}, {"_id": 0}
    ).to_list(500)
    ids: set[str] = set()
    for block in blocks:
        ids.add(block.get("userId"))
        ids.add(block.get("targetUserId"))
    ids.discard(user_id)
    return ids


@router.get("/discovery")
async def discovery(
    user: dict[str, Any] = Depends(current_user),
    radius: float | None = Query(default=None, ge=1, le=500),
) -> dict[str, Any]:
    config = await get_config()
    location_config = config["location"]
    selected_radius = min(
        max(radius or location_config["defaultRadius"], location_config["minRadius"]),
        location_config["maxRadius"],
    )
    seen = {
        item["targetId"]
        for item in await db.interactions.find(
            {"userId": user["id"]}, {"_id": 0, "targetId": 1}
        ).to_list(500)
    }
    blocked = await _blocked_ids(user["id"])
    exclude = list(seen | blocked | {user["id"]})
    user_profile = await db.profiles.find_one({"userId": user["id"]}, {"_id": 0, "location": 1})
    location = user_profile.get("location") if user_profile else None
    results: list[dict[str, Any]] = []
    if location:
        try:
            rows = await db.profiles.aggregate(
                [
                    {
                        "$geoNear": {
                            "near": location,
                            "distanceField": "distanceMeters",
                            "spherical": True,
                            "key": "location",
                            "maxDistance": selected_radius * 1000,
                            "query": {"userId": {"$nin": exclude}, "status": "active"},
                        }
                    },
                    {"$limit": 30},
                ]
            ).to_list(30)
            results = [
                public_profile(row, float(row.get("distanceMeters", 0)) / 1000) for row in rows
            ]
        except Exception as exc:  # noqa: BLE001
            logger.warning("Geospatial discovery unavailable: %s", exc)
    if not results and DEMO_OTP_ENABLED:
        demo_rows = await db.demo_profiles.find(
            {"id": {"$nin": exclude}} if exclude else {}, {"_id": 0}
        ).to_list(30)
        results = [public_profile(row) for row in demo_rows]
    return {
        "profiles": results,
        "radius": selected_radius,
        "maxRadius": location_config["maxRadius"],
        "hasLocation": bool(location),
        "requiresLocation": bool(config["permissions"]["locationRequired"]),
    }


@router.post("/discovery/{target_id}/like")
async def like_profile(
    target_id: str, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    if target_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot like yourself")
    if await db.blocks.find_one(
        {
            "$or": [
                {"userId": user["id"], "targetUserId": target_id},
                {"userId": target_id, "targetUserId": user["id"]},
            ]
        },
        {"_id": 0},
    ):
        raise HTTPException(status_code=403, detail="Interaction not allowed")
    await record_interaction(user["id"], target_id, "like")
    reciprocal = await db.interactions.find_one(
        {"userId": target_id, "targetId": user["id"], "action": "like"}, {"_id": 0}
    )
    if not reciprocal:
        return {"liked": True, "matched": False}
    match, conversation_id = await ensure_match(user["id"], target_id)
    interests = await shared_interests(user["id"], target_id)
    explanation = make_explanation(interests)
    # Fire notifications to both users.
    profile = await db.profiles.find_one({"userId": user["id"]}, {"_id": 0, "displayName": 1})
    target_profile = await db.profiles.find_one(
        {"userId": target_id}, {"_id": 0, "displayName": 1}
    )
    display_a = (profile or {}).get("displayName") or "Someone"
    display_b = (target_profile or {}).get("displayName") or "Someone"
    await send_to_user(
        target_id,
        title="New match on Punch Desk",
        body=f"You and {display_a} matched.",
        data={"type": "match", "conversationId": conversation_id, "matchId": match.get("id", "")},
    )
    await send_to_user(
        user["id"],
        title="New match on Punch Desk",
        body=f"You and {display_b} matched.",
        data={"type": "match", "conversationId": conversation_id, "matchId": match.get("id", "")},
    )
    return {
        "liked": True,
        "matched": True,
        "match": match,
        "conversationId": conversation_id,
        "explanation": explanation,
    }


@router.post("/discovery/{target_id}/pass")
async def pass_profile(
    target_id: str, user: dict[str, Any] = Depends(current_user)
) -> dict[str, bool]:
    await record_interaction(user["id"], target_id, "pass")
    return {"passed": True}


@router.get("/matches")
async def matches(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    rows = await db.matches.find({"users": user["id"]}, {"_id": 0}).sort("matchedAt", -1).to_list(100)
    matches_out: list[dict[str, Any]] = []
    for row in rows:
        other_id = next((member for member in row.get("users", []) if member != user["id"]), "")
        other_profile = await db.profiles.find_one(
            {"userId": other_id}, {"_id": 0, "displayName": 1, "age": 1, "photos": 1}
        ) or await db.demo_profiles.find_one(
            {"id": other_id}, {"_id": 0, "displayName": 1, "age": 1, "photos": 1}
        )
        interests = await shared_interests(user["id"], other_id)
        conversation = await db.conversations.find_one(
            {"users": {"$all": [user["id"], other_id]}}, {"_id": 0, "id": 1}
        )
        matches_out.append(
            {
                **row,
                "other": {
                    "id": other_id,
                    "displayName": (other_profile or {}).get("displayName", "Nearby member"),
                    "age": (other_profile or {}).get("age", 0),
                    "photos": (other_profile or {}).get("photos", []),
                },
                "conversationId": (conversation or {}).get("id"),
                "explanation": make_explanation(interests),
            }
        )
    return {"matches": matches_out}
