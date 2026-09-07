"""Firebase Cloud Messaging provider - credential gated."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from ..core import FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT, ROOT_DIR, db, logger, utc_now

_firebase_ready = False
_firebase_module = None  # type: ignore[assignment]


def _load_credentials() -> Any | None:
    if not FIREBASE_SERVICE_ACCOUNT:
        return None
    candidate = FIREBASE_SERVICE_ACCOUNT.strip()
    # Support both a JSON blob and a file path.
    if candidate.startswith("{"):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            logger.warning("FIREBASE_SERVICE_ACCOUNT JSON is invalid")
            return None
    path = Path(candidate)
    if not path.is_absolute():
        path = ROOT_DIR / candidate
    if not path.exists():
        logger.info("Firebase service account file not found at %s", path)
        return None
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Cannot read Firebase service account: %s", exc)
        return None


def init_firebase() -> None:
    global _firebase_ready, _firebase_module
    if _firebase_ready:
        return
    credentials_data = _load_credentials()
    if not credentials_data:
        return
    try:
        import firebase_admin  # type: ignore
        from firebase_admin import credentials, messaging  # type: ignore

        if not firebase_admin._apps:  # noqa: SLF001
            cred = credentials.Certificate(credentials_data)
            options = {"projectId": FIREBASE_PROJECT_ID} if FIREBASE_PROJECT_ID else None
            firebase_admin.initialize_app(cred, options)
        _firebase_module = messaging
        _firebase_ready = True
        logger.info("Firebase Admin SDK initialized")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Firebase Admin failed to initialize: %s", exc)
        _firebase_ready = False


def is_ready() -> bool:
    return _firebase_ready


async def send_to_user(
    user_id: str, title: str, body: str, data: dict[str, str] | None = None
) -> dict[str, Any]:
    """Attempt to send a push to every active device of the user."""
    await db.notifications.insert_one(
        {
            "userId": user_id,
            "title": title,
            "body": body,
            "data": data or {},
            "createdAt": utc_now(),
            "delivered": False,
        }
    )
    if not _firebase_ready or _firebase_module is None:
        return {"delivered": 0, "reason": "firebase_not_configured"}
    devices = await db.devices.find(
        {"userId": user_id, "enabled": True, "provider": "fcm"}, {"_id": 0}
    ).to_list(20)
    delivered = 0
    invalid: list[str] = []
    for device in devices:
        token = device.get("token")
        if not token:
            continue
        try:
            message = _firebase_module.Message(
                notification=_firebase_module.Notification(title=title, body=body),
                data={key: str(value) for key, value in (data or {}).items()},
                token=token,
            )
            _firebase_module.send(message)
            delivered += 1
        except Exception as exc:  # noqa: BLE001
            logger.info("FCM send failed for %s: %s", token[:16], exc)
            invalid.append(token)
    if invalid:
        await db.devices.update_many(
            {"token": {"$in": invalid}}, {"$set": {"enabled": False, "lastError": "invalid_token"}}
        )
    if delivered:
        await db.notifications.update_one(
            {"userId": user_id, "delivered": False},
            {"$set": {"delivered": True, "deliveredAt": utc_now()}},
        )
    return {"delivered": delivered, "invalid": len(invalid)}


# Attempt lazy init at import time if credentials are already present.
try:
    if os.getenv("FIREBASE_SERVICE_ACCOUNT"):
        init_firebase()
except Exception:  # noqa: BLE001
    pass
