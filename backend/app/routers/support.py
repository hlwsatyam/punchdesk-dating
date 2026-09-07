"""Support tickets: user side + admin side (admin routes are in admin router)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..core import current_user, db, new_id, utc_now
from ..schemas import SupportReplyCreate, SupportTicketCreate
from ..services.config_service import get_config
from ..services.notifications import send_to_user

router = APIRouter(prefix="/support", tags=["support"])


@router.post("/tickets")
async def create_ticket(
    body: SupportTicketCreate, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    config = await get_config()
    categories = config.get("supportCategories") or []
    if categories and body.category not in categories:
        raise HTTPException(status_code=422, detail="Unsupported category")
    ticket = {
        "id": new_id("tkt"),
        "userId": user["id"],
        "category": body.category,
        "subject": body.subject,
        "description": body.description,
        "status": "open",
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
    }
    await db.support_tickets.insert_one(ticket.copy())
    await db.support_messages.insert_one(
        {
            "id": new_id("smsg"),
            "ticketId": ticket["id"],
            "authorId": user["id"],
            "authorRole": "user",
            "body": body.description,
            "createdAt": utc_now(),
        }
    )
    return ticket


@router.get("/tickets")
async def list_tickets(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    rows = (
        await db.support_tickets.find({"userId": user["id"]}, {"_id": 0})
        .sort("updatedAt", -1)
        .to_list(100)
    )
    return {"tickets": rows}


@router.get("/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: str, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    ticket = await db.support_tickets.find_one(
        {"id": ticket_id, "userId": user["id"]}, {"_id": 0}
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    messages = (
        await db.support_messages.find({"ticketId": ticket_id}, {"_id": 0})
        .sort("createdAt", 1)
        .to_list(500)
    )
    return {"ticket": ticket, "messages": messages}


@router.post("/tickets/{ticket_id}/reply")
async def reply_ticket(
    ticket_id: str,
    body: SupportReplyCreate,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    ticket = await db.support_tickets.find_one(
        {"id": ticket_id, "userId": user["id"]}, {"_id": 0}
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    message = {
        "id": new_id("smsg"),
        "ticketId": ticket_id,
        "authorId": user["id"],
        "authorRole": "user",
        "body": body.body,
        "createdAt": utc_now(),
    }
    await db.support_messages.insert_one(message.copy())
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$set": {"status": "open", "updatedAt": utc_now()}},
    )
    return message
