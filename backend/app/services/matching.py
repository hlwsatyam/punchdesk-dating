"""Chat, matching, and shared-interest utilities."""
from __future__ import annotations

from typing import Any

from ..core import db, new_id, utc_now


async def record_interaction(user_id: str, target_id: str, action: str) -> None:
    await db.interactions.update_one(
        {"userId": user_id, "targetId": target_id},
        {
            "$set": {
                "userId": user_id,
                "targetId": target_id,
                "action": action,
                "createdAt": utc_now(),
            }
        },
        upsert=True,
    )


async def shared_interests(first_id: str, second_id: str) -> list[str]:
    first = await db.profiles.find_one({"userId": first_id}, {"_id": 0, "interests": 1})
    second = await db.profiles.find_one(
        {"userId": second_id}, {"_id": 0, "interests": 1}
    ) or await db.demo_profiles.find_one({"id": second_id}, {"_id": 0, "interests": 1})
    first_interests = set(first.get("interests", [])) if first else set()
    second_interests = set(second.get("interests", [])) if second else set()
    return sorted(first_interests.intersection(second_interests))


def make_explanation(interests: list[str]) -> dict[str, Any]:
    if interests:
        return {
            "sharedInterests": interests,
            "summary": f"You both like {', '.join(interests[:2])}",
        }
    return {"sharedInterests": [], "summary": "You both chose to connect."}


async def ensure_match(user_a: str, user_b: str) -> tuple[dict[str, Any], str]:
    # Sort users for deterministic key ordering to avoid duplicate matches.
    members = sorted([user_a, user_b])
    match = await db.matches.find_one({"users": {"$all": members}}, {"_id": 0})
    if not match:
        match = {"id": new_id("match"), "users": members, "matchedAt": utc_now()}
        try:
            await db.matches.insert_one(match.copy())
        except Exception:  # noqa: BLE001
            match = await db.matches.find_one({"users": {"$all": members}}, {"_id": 0}) or match
    conversation = await db.conversations.find_one(
        {"users": {"$all": members}}, {"_id": 0}
    )
    if not conversation:
        conversation = {
            "id": new_id("conv"),
            "users": members,
            "createdAt": utc_now(),
            "lastMessage": "",
            "unread": {user_a: 0, user_b: 0},
        }
        try:
            await db.conversations.insert_one(conversation.copy())
        except Exception:  # noqa: BLE001
            conversation = await db.conversations.find_one(
                {"users": {"$all": members}}, {"_id": 0}
            ) or conversation
    return match, conversation["id"]


async def conversation_for_users(user_id: str, other_id: str) -> dict[str, Any] | None:
    return await db.conversations.find_one(
        {"users": {"$all": [user_id, other_id]}}, {"_id": 0}
    )


async def get_conversation(conversation_id: str, user_id: str) -> dict[str, Any] | None:
    return await db.conversations.find_one(
        {"id": conversation_id, "users": user_id}, {"_id": 0}
    )
