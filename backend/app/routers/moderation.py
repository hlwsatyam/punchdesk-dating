"""Photo requests, blocks and reports."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..core import current_user, db, new_id, utc_now
from ..schemas import BlockCreate, PhotoRequestCreate, PhotoRequestDecision, ReportCreate
from ..services.config_service import get_config
from ..services.notifications import send_to_user

router = APIRouter(tags=["moderation"])


@router.post("/photo-requests")
async def create_photo_request(
    body: PhotoRequestCreate, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    if body.targetUserId == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot request your own photos")
    since = utc_now() - timedelta(hours=1)
    recent = await db.photo_requests.count_documents(
        {"requesterId": user["id"], "createdAt": {"$gte": since}}
    )
    if recent >= 20:
        raise HTTPException(status_code=429, detail="Too many photo requests. Try later.")
    existing = await db.photo_requests.find_one(
        {"requesterId": user["id"], "receiverId": body.targetUserId, "status": "pending"},
        {"_id": 0},
    )
    if existing:
        return existing
    request = {
        "id": new_id("preq"),
        "requesterId": user["id"],
        "receiverId": body.targetUserId,
        "status": "pending",
        "createdAt": utc_now(),
    }
    await db.photo_requests.insert_one(request.copy())
    requester_profile = await db.profiles.find_one(
        {"userId": user["id"]}, {"_id": 0, "displayName": 1}
    )
    display = (requester_profile or {}).get("displayName") or "Someone"
    await send_to_user(
        body.targetUserId,
        title="Photo request",
        body=f"{display} wants to see your private photos.",
        data={"type": "photo_request", "requestId": request["id"]},
    )
    return request


@router.get("/photo-requests")
async def list_photo_requests(
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    incoming = (
        await db.photo_requests.find({"receiverId": user["id"]}, {"_id": 0})
        .sort("createdAt", -1)
        .to_list(100)
    )
    outgoing = (
        await db.photo_requests.find({"requesterId": user["id"]}, {"_id": 0})
        .sort("createdAt", -1)
        .to_list(100)
    )
    return {"incoming": incoming, "outgoing": outgoing}


@router.post("/photo-requests/{request_id}/decision")
async def decide_photo_request(
    request_id: str,
    body: PhotoRequestDecision,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    request = await db.photo_requests.find_one(
        {"id": request_id, "receiverId": user["id"], "status": "pending"}, {"_id": 0}
    )
    if not request:
        raise HTTPException(status_code=404, detail="Photo request not found")
    await db.photo_requests.update_one(
        {"id": request_id},
        {"$set": {"status": body.decision, "respondedAt": utc_now()}},
    )
    await send_to_user(
        request["requesterId"],
        title="Photo request update",
        body="Your photo request was " + body.decision,
        data={"type": "photo_request_update", "requestId": request_id, "status": body.decision},
    )
    return {"ok": True, "status": body.decision}


@router.get("/blocks")
async def list_blocks(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    rows = (
        await db.blocks.find({"userId": user["id"]}, {"_id": 0})
        .sort("createdAt", -1)
        .to_list(200)
    )
    return {"blocks": rows}


@router.post("/blocks")
async def block_user(
    body: BlockCreate, user: dict[str, Any] = Depends(current_user)
) -> dict[str, bool]:
    if body.targetUserId == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot block yourself")
    await db.blocks.update_one(
        {"userId": user["id"], "targetUserId": body.targetUserId},
        {
            "$set": {
                "userId": user["id"],
                "targetUserId": body.targetUserId,
                "createdAt": utc_now(),
            }
        },
        upsert=True,
    )
    # Remove any active conversation.
    await db.conversations.update_many(
        {"users": {"$all": [user["id"], body.targetUserId]}},
        {"$set": {"blocked": True}},
    )
    return {"ok": True}


@router.delete("/blocks/{target_user_id}")
async def unblock_user(
    target_user_id: str, user: dict[str, Any] = Depends(current_user)
) -> dict[str, bool]:
    result = await db.blocks.delete_one(
        {"userId": user["id"], "targetUserId": target_user_id}
    )
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Block not found")
    await db.conversations.update_many(
        {"users": {"$all": [user["id"], target_user_id]}},
        {"$set": {"blocked": False}},
    )
    return {"ok": True}


@router.post("/reports")
async def report_user(
    body: ReportCreate, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    config = await get_config()
    categories = config.get("reportCategories") or []
    if categories and body.category not in categories:
        raise HTTPException(status_code=422, detail="Unsupported category")
    if body.targetUserId == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot report yourself")
    report = {
        "id": new_id("rep"),
        "reporterId": user["id"],
        "targetUserId": body.targetUserId,
        "category": body.category,
        "description": (body.description or "")[:1000],
        "status": "open",
        "createdAt": utc_now(),
    }
    await db.reports.insert_one(report.copy())
    return report
