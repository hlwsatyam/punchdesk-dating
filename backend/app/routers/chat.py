"""Chat REST + WebSocket routers."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

from ..core import JWT_SECRET, current_user, db, new_id, utc_now
from ..schemas import MessageCreate
from ..services.matching import get_conversation
from ..services.notifications import send_to_user
from ..services.realtime import manager

router = APIRouter(tags=["chat"])


def _iso(value: Any) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return ""


def _serialize_message(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": message.get("id"),
        "conversationId": message.get("conversationId"),
        "senderId": message.get("senderId"),
        "body": message.get("body", ""),
        "createdAt": _iso(message.get("createdAt")),
        "status": message.get("status", "sent"),
        "readBy": message.get("readBy", []),
    }


async def _serialize_conversation(
    conversation: dict[str, Any], user_id: str
) -> dict[str, Any]:
    other_id = next((m for m in conversation.get("users", []) if m != user_id), "")
    other = await db.profiles.find_one(
        {"userId": other_id},
        {"_id": 0, "displayName": 1, "photos": 1, "age": 1, "verified": 1},
    ) or await db.demo_profiles.find_one(
        {"id": other_id}, {"_id": 0, "displayName": 1, "photos": 1, "age": 1, "verified": 1}
    )
    unread_map = conversation.get("unread") or {}
    return {
        "id": conversation.get("id"),
        "otherUserId": other_id,
        "other": {
            "id": other_id,
            "displayName": (other or {}).get("displayName", "Nearby member"),
            "age": (other or {}).get("age", 0),
            "photos": (other or {}).get("photos", []),
            "verified": bool((other or {}).get("verified", False)),
        },
        "lastMessage": conversation.get("lastMessage", ""),
        "lastMessageAt": _iso(conversation.get("lastMessageAt")),
        "unreadCount": int(unread_map.get(user_id, 0)),
        "online": manager.is_online(other_id),
    }


@router.get("/chat")
async def list_conversations(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    rows = (
        await db.conversations.find({"users": user["id"]}, {"_id": 0})
        .sort("lastMessageAt", -1)
        .to_list(100)
    )
    conversations = [await _serialize_conversation(row, user["id"]) for row in rows]
    return {"conversations": conversations}


@router.get("/chat/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    user: dict[str, Any] = Depends(current_user),
    before: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
) -> dict[str, Any]:
    conversation = await get_conversation(conversation_id, user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    query: dict[str, Any] = {"conversationId": conversation_id}
    if before:
        try:
            cursor_dt = datetime.fromisoformat(before)
            if cursor_dt.tzinfo is None:
                cursor_dt = cursor_dt.replace(tzinfo=timezone.utc)
            query["createdAt"] = {"$lt": cursor_dt}
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid cursor")
    rows = (
        await db.messages.find(query, {"_id": 0})
        .sort("createdAt", -1)
        .limit(limit)
        .to_list(limit)
    )
    messages = [_serialize_message(row) for row in reversed(rows)]
    next_cursor = _iso(rows[-1]["createdAt"]) if rows and len(rows) == limit else None
    # Mark conversation as read for this user.
    await db.conversations.update_one(
        {"id": conversation_id, "users": user["id"]},
        {"$set": {f"unread.{user['id']}": 0}},
    )
    return {"messages": messages, "nextCursor": next_cursor}


async def _create_message(
    conversation_id: str, sender_id: str, body: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    conversation = await db.conversations.find_one(
        {"id": conversation_id, "users": sender_id}, {"_id": 0}
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    receiver_id = next((m for m in conversation.get("users", []) if m != sender_id), "")
    message = {
        "id": new_id("msg"),
        "conversationId": conversation_id,
        "senderId": sender_id,
        "body": body,
        "createdAt": utc_now(),
        "status": "sent",
        "readBy": [sender_id],
    }
    await db.messages.insert_one(message.copy())
    await db.conversations.update_one(
        {"id": conversation_id},
        {
            "$set": {
                "lastMessage": body,
                "lastMessageAt": message["createdAt"],
            },
            "$inc": {f"unread.{receiver_id}": 1},
        },
    )
    payload = _serialize_message(message)
    # Deliver realtime + notification to receiver.
    delivered = await manager.send_to_user(
        receiver_id, {"type": "message", "conversationId": conversation_id, "message": payload}
    )
    if delivered == 0:
        sender_profile = await db.profiles.find_one(
            {"userId": sender_id}, {"_id": 0, "displayName": 1}
        )
        display = (sender_profile or {}).get("displayName") or "Someone"
        await send_to_user(
            receiver_id,
            title=display,
            body=body[:120],
            data={"type": "message", "conversationId": conversation_id},
        )
    # Echo to sender's other devices.
    await manager.send_to_user(
        sender_id, {"type": "message", "conversationId": conversation_id, "message": payload}
    )
    return payload, {"receiverId": receiver_id}


@router.post("/chat/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    payload, _ = await _create_message(conversation_id, user["id"], body.body)
    return payload


@router.post("/chat/{conversation_id}/read")
async def mark_read(
    conversation_id: str, user: dict[str, Any] = Depends(current_user)
) -> dict[str, bool]:
    conversation = await get_conversation(conversation_id, user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.conversations.update_one(
        {"id": conversation_id, "users": user["id"]},
        {"$set": {f"unread.{user['id']}": 0}},
    )
    other_id = next((m for m in conversation.get("users", []) if m != user["id"]), "")
    if other_id:
        await manager.send_to_user(
            other_id,
            {"type": "read", "conversationId": conversation_id, "readerId": user["id"]},
        )
    return {"ok": True}


ws_router = APIRouter()


@ws_router.websocket("/ws/chat")
async def chat_socket(websocket: WebSocket, token: str = Query(...)) -> None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        await websocket.close(code=4401)
        return
    user_id = payload.get("sub", "")
    if not user_id:
        await websocket.close(code=4401)
        return
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or user.get("status") in {"banned", "deleted"}:
        await websocket.close(code=4403)
        return
    await manager.connect(user_id, websocket)
    await db.users.update_one({"id": user_id}, {"$set": {"lastActiveAt": utc_now()}})
    try:
        await websocket.send_json({"type": "connected", "userId": user_id})
        while True:
            payload = await websocket.receive_json()
            event_type = payload.get("type")
            conversation_id = payload.get("conversationId") or ""
            if event_type == "message":
                body = (payload.get("body") or "").strip()
                if not body or not conversation_id:
                    continue
                message, _ = await _create_message(conversation_id, user_id, body[:2000])
                await websocket.send_json(
                    {"type": "ack", "clientId": payload.get("clientId"), "message": message}
                )
            elif event_type == "typing" and conversation_id:
                conversation = await get_conversation(conversation_id, user_id)
                if not conversation:
                    continue
                other_id = next(
                    (m for m in conversation.get("users", []) if m != user_id), ""
                )
                if other_id:
                    await manager.send_to_user(
                        other_id,
                        {
                            "type": "typing",
                            "conversationId": conversation_id,
                            "userId": user_id,
                            "state": bool(payload.get("state", True)),
                        },
                    )
            elif event_type == "read" and conversation_id:
                await db.conversations.update_one(
                    {"id": conversation_id, "users": user_id},
                    {"$set": {f"unread.{user_id}": 0}},
                )
                conversation = await get_conversation(conversation_id, user_id)
                if conversation:
                    other_id = next(
                        (m for m in conversation.get("users", []) if m != user_id), ""
                    )
                    if other_id:
                        await manager.send_to_user(
                            other_id,
                            {
                                "type": "read",
                                "conversationId": conversation_id,
                                "readerId": user_id,
                            },
                        )
            elif event_type == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id, websocket)
