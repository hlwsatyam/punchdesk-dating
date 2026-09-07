"""Subscription plans + Razorpay checkout/verify + webhook."""
from __future__ import annotations

import hashlib
import hmac
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from ..core import RAZORPAY_WEBHOOK_SECRET, current_user, db, utc_now
from ..schemas import CheckoutVerification, OrderCreate, OrderVerification
from ..services import razorpay_provider as razorpay

router = APIRouter(tags=["subscriptions"])


@router.get("/subscriptions/plans")
async def subscription_plans() -> dict[str, Any]:
    plans = await db.subscription_plans.find({}, {"_id": 0}).to_list(20)
    return {"plans": plans}


@router.get("/subscriptions/me")
async def my_subscription(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    active = await db.payments.find_one(
        {"userId": user["id"], "status": "active"}, {"_id": 0}
    )
    return {"active": bool(active), "subscription": active}


@router.post("/subscriptions/checkout")
async def create_checkout(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    result = await razorpay.create_subscription(user["id"])
    subscription_id = result.get("id")
    await db.payments.update_one(
        {"userId": user["id"], "subscriptionId": subscription_id},
        {
            "$set": {
                "userId": user["id"],
                "subscriptionId": subscription_id,
                "status": "pending",
                "createdAt": utc_now(),
                "type": "subscription",
            }
        },
        upsert=True,
    )
    return result


@router.post("/subscriptions/verify")
async def verify_checkout(
    body: CheckoutVerification, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    if not razorpay.verify_subscription_signature(
        body.paymentId, body.subscriptionId, body.signature
    ):
        raise HTTPException(status_code=400, detail="Payment verification failed")
    await db.payments.update_one(
        {"userId": user["id"], "subscriptionId": body.subscriptionId},
        {"$set": {"paymentId": body.paymentId, "status": "active", "verifiedAt": utc_now()}},
    )
    return {"active": True}


@router.post("/payments/order")
async def create_order(
    body: OrderCreate, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    plan = await db.subscription_plans.find_one({"id": body.planId}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    result = await razorpay.create_order(user["id"], plan)
    await db.payments.update_one(
        {"userId": user["id"], "orderId": result.get("id")},
        {
            "$set": {
                "userId": user["id"],
                "orderId": result.get("id"),
                "planId": body.planId,
                "status": "pending",
                "type": "order",
                "amount": result.get("amount"),
                "createdAt": utc_now(),
            }
        },
        upsert=True,
    )
    return result


@router.post("/payments/verify")
async def verify_order(
    body: OrderVerification, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    if not razorpay.verify_order_signature(body.orderId, body.paymentId, body.signature):
        raise HTTPException(status_code=400, detail="Payment verification failed")
    await db.payments.update_one(
        {"userId": user["id"], "orderId": body.orderId},
        {"$set": {"paymentId": body.paymentId, "status": "active", "verifiedAt": utc_now()}},
    )
    return {"active": True}


@router.post("/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(default=None),
    x_razorpay_event_id: str | None = Header(default=None),
) -> dict[str, Any]:
    raw = await request.body()
    if not RAZORPAY_WEBHOOK_SECRET or not x_razorpay_signature:
        raise HTTPException(status_code=503, detail="Payment webhooks are not configured")
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    if not x_razorpay_event_id:
        raise HTTPException(status_code=400, detail="Missing webhook event id")
    inserted = await db.webhook_events.update_one(
        {"eventId": x_razorpay_event_id},
        {"$setOnInsert": {"eventId": x_razorpay_event_id, "receivedAt": utc_now()}},
        upsert=True,
    )
    return {"ok": True, "duplicate": not inserted.upserted_id}
