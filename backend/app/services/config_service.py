"""Application configuration + seed."""
from __future__ import annotations

from typing import Any

from ..core import db, utc_now
from ..schemas import AppConfig


async def ensure_config() -> None:
    if await db.app_config.find_one({"key": "app"}, {"_id": 0}):
        return
    config = AppConfig().model_dump()
    await db.app_config.insert_one({"key": "app", **config, "updatedAt": utc_now()})


async def get_config() -> dict[str, Any]:
    await ensure_config()
    stored = await db.app_config.find_one({"key": "app"}, {"_id": 0, "key": 0}) or {}
    defaults = AppConfig().model_dump()
    # Merge: stored values win, but any missing field falls back to defaults.
    merged = {**defaults, **{k: v for k, v in stored.items() if v is not None}}
    return merged


async def update_config(updates: dict[str, Any]) -> dict[str, Any]:
    if updates:
        await db.app_config.update_one(
            {"key": "app"}, {"$set": {**updates, "updatedAt": utc_now()}}, upsert=True
        )
    return await get_config()


async def seed_demo_data() -> None:
    await ensure_config()
    if await db.subscription_plans.count_documents({}) == 0:
        await db.subscription_plans.insert_many(
            [
                {
                    "id": "plan_free",
                    "name": "Free",
                    "price": 0,
                    "period": "forever",
                    "description": "A simple way to start meeting nearby people.",
                    "features": ["Nearby discovery", "Unlimited chat"],
                },
                {
                    "id": "plan_premium",
                    "name": "Premium",
                    "price": 799,
                    "period": "month",
                    "description": "More visibility, more control, more possibility.",
                    "features": [
                        "Priority discovery",
                        "Unlimited likes",
                        "Private photo requests",
                    ],
                },
            ]
        )
    demo_profiles = [
        {
            "id": "profile_aaron",
            "displayName": "Aaron",
            "age": 29,
            "distance": 2.4,
            "verified": True,
            "bio": "Weekend coffee walks and finding the best hidden rooms in the city.",
            "interests": ["Coffee", "Design", "Travel"],
            "photos": [],
            "online": True,
            "location": {"type": "Point", "coordinates": [77.5946, 12.9716]},
        },
        {
            "id": "profile_miles",
            "displayName": "Miles",
            "age": 31,
            "distance": 4.8,
            "verified": True,
            "bio": "Music, good food, and conversations that run a little too late.",
            "interests": ["Music", "Food", "Travel"],
            "photos": [],
            "online": False,
            "location": {"type": "Point", "coordinates": [77.6150, 12.9860]},
        },
        {
            "id": "profile_jules",
            "displayName": "Jules",
            "age": 27,
            "distance": 7.1,
            "verified": False,
            "bio": "Creative by day, always looking for the next gallery or great meal.",
            "interests": ["Design", "Food", "Fitness"],
            "photos": [],
            "online": True,
            "location": {"type": "Point", "coordinates": [77.5650, 12.9500]},
        },
    ]
    if await db.demo_profiles.count_documents({}) == 0:
        await db.demo_profiles.insert_many([profile.copy() for profile in demo_profiles])
    for profile in demo_profiles:
        await db.profiles.update_one(
            {"userId": profile["id"]},
            {"$setOnInsert": {"userId": profile["id"], "status": "active", **profile}},
            upsert=True,
        )
