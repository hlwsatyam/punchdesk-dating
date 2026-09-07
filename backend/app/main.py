"""Punch Desk FastAPI application factory."""
from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core import client, db, logger
from .routers import (
    admin,
    auth,
    chat,
    config,
    devices,
    discovery,
    health,
    moderation,
    profile,
    subscriptions,
    support,
)
from .services.config_service import seed_demo_data
from .services.notifications import init_firebase


def create_app() -> FastAPI:
    app = FastAPI(
        title="Punch Desk API",
        version="1.0.0",
        description="Reusable, configuration-driven dating engine API",
    )

    api_router = APIRouter(prefix="/api")
    api_router.include_router(health.router)
    api_router.include_router(config.router)
    api_router.include_router(auth.router)
    api_router.include_router(profile.router)
    api_router.include_router(discovery.router)
    api_router.include_router(chat.router)
    api_router.include_router(moderation.router)
    api_router.include_router(support.router)
    api_router.include_router(subscriptions.router)
    api_router.include_router(devices.router)
    api_router.include_router(admin.router)
    app.include_router(api_router)

    # WebSocket router mounted directly under /api.
    ws_router = APIRouter(prefix="/api")
    ws_router.include_router(chat.ws_router)
    app.include_router(ws_router)

    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    async def _startup() -> None:  # noqa: RUF029
        try:
            await db.app_config.create_index("key", unique=True)
            await db.otp_codes.create_index("expiresAt", expireAfterSeconds=0)
            await db.profiles.create_index([("location", "2dsphere")])
            await db.interactions.create_index(
                [("userId", 1), ("targetId", 1)], unique=True
            )
            await db.messages.create_index([("conversationId", 1), ("createdAt", -1)])
            await db.devices.create_index([("userId", 1), ("token", 1)], unique=True)
            await db.webhook_events.create_index("eventId", unique=True)
            await db.photo_requests.create_index([("requesterId", 1), ("receiverId", 1)])
            await db.blocks.create_index([("userId", 1), ("targetUserId", 1)], unique=True)
            await db.reports.create_index("status")
            await db.support_tickets.create_index("status")
            await db.support_messages.create_index("ticketId")
            await db.audit_logs.create_index([("createdAt", -1)])
            await seed_demo_data()
        except Exception as exc:  # noqa: BLE001
            logger.warning("MongoDB is not ready during startup: %s", exc)
        init_firebase()

    @app.on_event("shutdown")
    async def _shutdown() -> None:  # noqa: RUF029
        client.close()

    return app
