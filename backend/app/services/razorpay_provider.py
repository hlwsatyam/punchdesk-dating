"""Razorpay provider - subscription and one-time order flows."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
from typing import Any

import requests
from fastapi import HTTPException

from ..core import (
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_PLAN_ID,
    db,
    logger,
)


def configured() -> bool:
    return bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)


async def _request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    if not configured():
        raise HTTPException(status_code=503, detail="Payments are being configured")
    url = f"https://api.razorpay.com/v1{path}"
    response = await asyncio.to_thread(
        requests.request,
        method,
        url,
        auth=(RAZORPAY_KEY_ID or "", RAZORPAY_KEY_SECRET or ""),
        json=payload,
        timeout=15,
    )
    if response.status_code >= 400:
        logger.error("Razorpay %s %s failed: %s", method, path, response.text[:200])
        raise HTTPException(status_code=502, detail="Payment provider is unreachable right now")
    return response.json()


async def ensure_plan() -> str:
    if RAZORPAY_PLAN_ID:
        return RAZORPAY_PLAN_ID
    local_plan = await db.subscription_plans.find_one({"id": "plan_premium"}, {"_id": 0})
    if not local_plan:
        raise HTTPException(status_code=503, detail="Premium plan is not configured")
    if local_plan.get("razorpayPlanId"):
        return local_plan["razorpayPlanId"]
    payload = {
        "period": "monthly" if local_plan.get("period") == "month" else "yearly",
        "interval": 1,
        "item": {
            "name": local_plan.get("name", "Punch Desk Premium"),
            "amount": int(float(local_plan.get("price", 0)) * 100),
            "currency": "INR",
            "description": local_plan.get("description", "Punch Desk premium membership"),
        },
    }
    body = await _request("POST", "/plans", payload)
    plan_id = body.get("id")
    if not plan_id:
        raise HTTPException(status_code=502, detail="Payment plan could not be created")
    await db.subscription_plans.update_one(
        {"id": "plan_premium"}, {"$set": {"razorpayPlanId": plan_id}}
    )
    return plan_id


async def create_subscription(user_id: str) -> dict[str, Any]:
    plan_id = await ensure_plan()
    body = await _request(
        "POST",
        "/subscriptions",
        {
            "plan_id": plan_id,
            "total_count": 12,
            "quantity": 1,
            "customer_notify": True,
            "notes": {"user_id": user_id},
        },
    )
    return {**body, "key_id": RAZORPAY_KEY_ID}


async def create_order(user_id: str, plan: dict[str, Any]) -> dict[str, Any]:
    amount = int(float(plan.get("price", 0)) * 100)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Selected plan is free")
    body = await _request(
        "POST",
        "/orders",
        {
            "amount": amount,
            "currency": "INR",
            "receipt": f"pd_{user_id[:8]}",
            "notes": {"user_id": user_id, "plan_id": plan.get("id", "")},
        },
    )
    return {**body, "key_id": RAZORPAY_KEY_ID}


def verify_subscription_signature(payment_id: str, subscription_id: str, signature: str) -> bool:
    if not RAZORPAY_KEY_SECRET:
        return False
    digest = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{payment_id}|{subscription_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(digest, signature)


def verify_order_signature(order_id: str, payment_id: str, signature: str) -> bool:
    if not RAZORPAY_KEY_SECRET:
        return False
    digest = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(digest, signature)
