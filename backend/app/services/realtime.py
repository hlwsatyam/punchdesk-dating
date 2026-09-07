"""WebSocket connection manager for realtime chat and presence."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """Per-user WebSocket registry with basic presence/typing broadcast."""

    def __init__(self) -> None:
        self._users: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._users.setdefault(user_id, set()).add(websocket)

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._users.get(user_id)
            if sockets:
                sockets.discard(websocket)
                if not sockets:
                    self._users.pop(user_id, None)

    def is_online(self, user_id: str) -> bool:
        return bool(self._users.get(user_id))

    async def send_to_user(self, user_id: str, payload: dict[str, Any]) -> int:
        sockets = list(self._users.get(user_id, set()))
        delivered = 0
        for socket in sockets:
            try:
                await socket.send_json(payload)
                delivered += 1
            except Exception:  # noqa: BLE001
                await self.disconnect(user_id, socket)
        return delivered


manager = ConnectionManager()
