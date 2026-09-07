"""Admin router: user management, config, reports, support, analytics."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from ..core import admin_guard, db, new_id, utc_now
from ..schemas import (
    AdminConfigUpdate,
    ReportActionUpdate,
    SupportReplyCreate,
    SupportTicketStatusUpdate,
)
from ..services.config_service import get_config, update_config

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(admin_guard)])


@router.get("/overview")
async def overview() -> dict[str, Any]:
    now = utc_now()
    week_ago = now - timedelta(days=7)
    day_ago = now - timedelta(days=1)
    return {
        "metrics": {
            "users": await db.users.count_documents({"status": {"$ne": "deleted"}}),
            "activeUsers7d": await db.users.count_documents({"lastActiveAt": {"$gte": week_ago}}),
            "activeUsers24h": await db.users.count_documents({"lastActiveAt": {"$gte": day_ago}}),
            "matches": await db.matches.count_documents({}),
            "messages": await db.messages.count_documents({}),
            "activeSubscriptions": await db.payments.count_documents({"status": "active"}),
            "openReports": await db.reports.count_documents(
                {"status": {"$in": ["open", "in_review"]}}
            ),
            "openTickets": await db.support_tickets.count_documents(
                {"status": {"$in": ["open", "in_progress", "waiting_user"]}}
            ),
        },
        "config": await get_config(),
    }


@router.patch("/config")
async def patch_config(body: AdminConfigUpdate) -> dict[str, Any]:
    return await update_config(body.model_dump(exclude_none=True))


@router.get("/users")
async def list_users(
    query: str | None = Query(default=None, max_length=64),
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if status_filter:
        filters["status"] = status_filter
    if query:
        filters["phone"] = {"$regex": query, "$options": "i"}
    rows = (
        await db.users.find(filters, {"_id": 0}).sort("createdAt", -1).limit(limit).to_list(limit)
    )
    ids = [row["id"] for row in rows]
    profiles = {
        item["userId"]: item
        for item in await db.profiles.find(
            {"userId": {"$in": ids}}, {"_id": 0, "userId": 1, "displayName": 1, "age": 1}
        ).to_list(limit)
    }
    for row in rows:
        row["profile"] = profiles.get(row["id"], {})
    return {"users": rows}


@router.post("/users/{user_id}/status")
async def update_user_status(
    user_id: str, status_filter: str = Query(..., alias="status", max_length=32)
) -> dict[str, Any]:
    allowed = {"active", "suspended", "banned", "deleted"}
    if status_filter not in allowed:
        raise HTTPException(status_code=422, detail="Unsupported status")
    await db.users.update_one({"id": user_id}, {"$set": {"status": status_filter}})
    if status_filter in {"banned", "deleted"}:
        await db.profiles.update_one(
            {"userId": user_id}, {"$set": {"status": status_filter}}
        )
        await db.devices.update_many({"userId": user_id}, {"$set": {"enabled": False}})
    await db.audit_logs.insert_one(
        {
            "id": new_id("aud"),
            "action": "user.status",
            "target": user_id,
            "value": status_filter,
            "createdAt": utc_now(),
        }
    )
    return {"ok": True, "status": status_filter}


@router.get("/reports")
async def admin_reports(
    status_filter: str | None = Query(default=None, alias="status")
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if status_filter:
        filters["status"] = status_filter
    rows = (
        await db.reports.find(filters, {"_id": 0}).sort("createdAt", -1).limit(200).to_list(200)
    )
    return {"reports": rows}


@router.post("/reports/{report_id}/action")
async def act_on_report(report_id: str, body: ReportActionUpdate) -> dict[str, Any]:
    report = await db.reports.find_one({"id": report_id}, {"_id": 0})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    target_status = {
        "dismiss": "dismissed",
        "warn": "closed",
        "suspend": "closed",
        "ban": "closed",
    }[body.action]
    await db.reports.update_one(
        {"id": report_id},
        {
            "$set": {
                "status": target_status,
                "action": body.action,
                "note": body.note,
                "resolvedAt": utc_now(),
            }
        },
    )
    if body.action == "suspend":
        await db.users.update_one(
            {"id": report["targetUserId"]}, {"$set": {"status": "suspended"}}
        )
    elif body.action == "ban":
        await db.users.update_one(
            {"id": report["targetUserId"]}, {"$set": {"status": "banned"}}
        )
        await db.devices.update_many(
            {"userId": report["targetUserId"]}, {"$set": {"enabled": False}}
        )
    await db.audit_logs.insert_one(
        {
            "id": new_id("aud"),
            "action": "report." + body.action,
            "target": report_id,
            "note": body.note,
            "createdAt": utc_now(),
        }
    )
    return {"ok": True, "status": target_status}


@router.get("/support/tickets")
async def admin_tickets(
    status_filter: str | None = Query(default=None, alias="status")
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if status_filter:
        filters["status"] = status_filter
    rows = (
        await db.support_tickets.find(filters, {"_id": 0})
        .sort("updatedAt", -1)
        .limit(200)
        .to_list(200)
    )
    return {"tickets": rows}


@router.get("/support/tickets/{ticket_id}")
async def admin_ticket(ticket_id: str) -> dict[str, Any]:
    ticket = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    messages = (
        await db.support_messages.find({"ticketId": ticket_id}, {"_id": 0})
        .sort("createdAt", 1)
        .to_list(500)
    )
    return {"ticket": ticket, "messages": messages}


@router.post("/support/tickets/{ticket_id}/reply")
async def admin_reply(ticket_id: str, body: SupportReplyCreate) -> dict[str, Any]:
    ticket = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    message = {
        "id": new_id("smsg"),
        "ticketId": ticket_id,
        "authorId": "admin",
        "authorRole": "admin",
        "body": body.body,
        "createdAt": utc_now(),
    }
    await db.support_messages.insert_one(message.copy())
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$set": {"status": "waiting_user", "updatedAt": utc_now()}},
    )
    return message


@router.patch("/support/tickets/{ticket_id}")
async def admin_ticket_status(
    ticket_id: str, body: SupportTicketStatusUpdate
) -> dict[str, Any]:
    result = await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$set": {"status": body.status, "updatedAt": utc_now()}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"ok": True, "status": body.status}


@router.get("/analytics")
async def analytics(range_days: int = Query(default=30, ge=1, le=365)) -> dict[str, Any]:
    since = utc_now() - timedelta(days=range_days)
    users_by_day = await db.users.aggregate(
        [
            {"$match": {"createdAt": {"$gte": since}}},
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt"}},
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ]
    ).to_list(365)
    matches_by_day = await db.matches.aggregate(
        [
            {"$match": {"matchedAt": {"$gte": since}}},
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$matchedAt"}},
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ]
    ).to_list(365)
    revenue_by_day = await db.payments.aggregate(
        [
            {"$match": {"verifiedAt": {"$gte": since}, "status": "active"}},
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$verifiedAt"}},
                    "amount": {"$sum": {"$ifNull": ["$amount", 0]}},
                }
            },
            {"$sort": {"_id": 1}},
        ]
    ).to_list(365)
    return {
        "usersByDay": [{"date": row["_id"], "count": row["count"]} for row in users_by_day],
        "matchesByDay": [{"date": row["_id"], "count": row["count"]} for row in matches_by_day],
        "revenueByDay": [
            {"date": row["_id"], "amount": row["amount"] / 100 if row["amount"] else 0}
            for row in revenue_by_day
        ],
    }


@router.get("/audit-logs")
async def audit_logs(limit: int = Query(default=100, ge=1, le=500)) -> dict[str, Any]:
    rows = (
        await db.audit_logs.find({}, {"_id": 0})
        .sort("createdAt", -1)
        .limit(limit)
        .to_list(limit)
    )
    return {"logs": rows}
