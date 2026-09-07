from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
except ImportError:  # pragma: no cover - dependency is installed in the runtime
    firebase_admin = None
    credentials = None
    messaging = None


def configured() -> bool:
    has_file = bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    has_fields = all(os.getenv(key) for key in ("FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"))
    return firebase_admin is not None and (has_file or has_fields)


def status() -> dict[str, Any]:
    return {"provider": "firebase_admin", "configured": configured(), "nativeClientRequired": True}


def _firebase_app():
    if not configured():
        return None
    if firebase_admin is None or credentials is None:
        return None
    if firebase_admin._apps:
        return firebase_admin.get_app()
    credential_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if credential_file and Path(credential_file).exists():
        credential = credentials.Certificate(credential_file)
    else:
        private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
        credential = credentials.Certificate({
            "type": "service_account",
            "project_id": os.getenv("FIREBASE_PROJECT_ID"),
            "private_key": private_key,
            "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
            "token_uri": "https://oauth2.googleapis.com/token",
        })
    return firebase_admin.initialize_app(credential)


async def send_to_user(db, user_id: str, title: str, body: str, data: dict[str, Any]) -> int:
    app = _firebase_app()
    if app is None or messaging is None:
        return 0
    devices = await db.devices.find({"userId": user_id, "enabled": True}, {"_id": 0, "token": 1}).to_list(20)
    sent = 0
    for device in devices:
        try:
            message = messaging.Message(
                token=device["token"],
                notification=messaging.Notification(title=title, body=body),
                data={key: str(value) for key, value in data.items()},
            )
            await asyncio.to_thread(messaging.send, message, app=app)
            sent += 1
        except Exception:
            await db.devices.update_one({"userId": user_id, "token": device["token"]}, {"$set": {"enabled": False, "invalidAt": data.get("timestamp")}})
    return sent