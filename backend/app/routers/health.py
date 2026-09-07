"""Health and root endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from ..core import db

router = APIRouter()


@router.get("/")
async def root() -> dict[str, str]:
    return {"name": "Punch Desk API", "status": "ready", "version": "1.0"}


@router.get("/health")
async def health() -> dict[str, str]:
    try:
        await db.command("ping")
        return {"status": "ok", "database": "connected"}
    except Exception:  # noqa: BLE001
        return {"status": "ok", "database": "starting"}
