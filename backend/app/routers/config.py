"""Public configuration endpoint."""
from __future__ import annotations

from fastapi import APIRouter

from ..schemas import AppConfig
from ..services.config_service import get_config

router = APIRouter()


@router.get("/config/app", response_model=AppConfig)
async def app_config() -> dict:
    return await get_config()
