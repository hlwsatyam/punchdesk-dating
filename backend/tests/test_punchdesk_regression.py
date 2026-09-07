"""Punch Desk backend regression suite.

Covers all features listed in review_request:
  - health/config
  - auth (OTP demo)
  - profile update, photos, location
  - discovery, like/match
  - matches
  - chat REST + WebSocket
  - photo-requests
  - blocks
  - reports
  - support tickets
  - admin authentication boundary
  - subscriptions (plans list only – live keys, do not initiate payment)
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import uuid

import pytest
import requests
import websockets


BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or ""
).rstrip("/")

assert BASE_URL, "backend URL is not configured"

WS_URL = BASE_URL.replace("http", "ws", 1) + "/api/ws/chat"

# 1x1 transparent PNG
TINY_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4"
    "2mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII="
)
TINY_DATA_URL = "data:image/png;base64," + TINY_PNG


# ---------- fixtures ----------

@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _auth(api: requests.Session, phone: str) -> dict:
    r = api.post(f"{BASE_URL}/api/auth/request-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = api.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": phone, "code": "123456"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accessToken")
    return data


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def user_a(api):
    phone = "+91999" + str(uuid.uuid4().int)[:8]
    session = _auth(api, phone)
    # Complete profile
    body = {
        "displayName": "TEST_UserA",
        "bio": "Regression A",
        "age": 28,
        "gender": "Man",
        "orientation": "Gay",
        "interests": ["Coffee", "Music"],
    }
    r = api.patch(
        f"{BASE_URL}/api/profile", headers=_headers(session["accessToken"]), json=body, timeout=15
    )
    assert r.status_code == 200, r.text
    api.post(
        f"{BASE_URL}/api/profile/location",
        headers=_headers(session["accessToken"]),
        json={"latitude": 12.97, "longitude": 77.59},
        timeout=15,
    )
    return {"token": session["accessToken"], "id": session["user"]["id"], "phone": phone}


@pytest.fixture(scope="session")
def user_b(api):
    phone = "+91888" + str(uuid.uuid4().int)[:8]
    session = _auth(api, phone)
    body = {
        "displayName": "TEST_UserB",
        "bio": "Regression B",
        "age": 30,
        "gender": "Man",
        "orientation": "Gay",
        "interests": ["Coffee", "Travel"],
    }
    r = api.patch(
        f"{BASE_URL}/api/profile", headers=_headers(session["accessToken"]), json=body, timeout=15
    )
    assert r.status_code == 200, r.text
    api.post(
        f"{BASE_URL}/api/profile/location",
        headers=_headers(session["accessToken"]),
        json={"latitude": 12.98, "longitude": 77.60},
        timeout=15,
    )
    return {"token": session["accessToken"], "id": session["user"]["id"], "phone": phone}


# ---------- health / config ----------

def test_health(api):
    r = api.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"
    assert body.get("database") in {"connected", True, "ok"} or body.get("db") in {
        "connected",
        True,
        "ok",
    }


def test_app_config(api):
    r = api.get(f"{BASE_URL}/api/config/app", timeout=15)
    assert r.status_code == 200
    cfg = r.json()
    assert isinstance(cfg.get("reportCategories"), list) and cfg["reportCategories"]
    assert isinstance(cfg.get("supportCategories"), list) and cfg["supportCategories"]


# ---------- auth ----------

def test_otp_flow_bad_code(api):
    phone = "+91777" + str(uuid.uuid4().int)[:8]
    r = api.post(f"{BASE_URL}/api/auth/request-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200
    bad = api.post(
        f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "code": "000000"}, timeout=15
    )
    assert bad.status_code == 401


def test_otp_flow_demo_success(api):
    phone = "+91777" + str(uuid.uuid4().int)[:8]
    api.post(f"{BASE_URL}/api/auth/request-otp", json={"phone": phone}, timeout=15)
    good = api.post(
        f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "code": "123456"}, timeout=15
    )
    assert good.status_code == 200
    assert good.json().get("accessToken")


# ---------- profile ----------

def test_profile_update_rejects_bad_enum(api, user_a):
    r = api.patch(
        f"{BASE_URL}/api/profile",
        headers=_headers(user_a["token"]),
        json={"gender": "NotAValue"},
        timeout=15,
    )
    assert r.status_code == 422

    r = api.patch(
        f"{BASE_URL}/api/profile",
        headers=_headers(user_a["token"]),
        json={"orientation": "InvalidOrientation"},
        timeout=15,
    )
    assert r.status_code == 422


def test_profile_photo_upload_delete(api, user_a):
    r = api.post(
        f"{BASE_URL}/api/profile/photos",
        headers=_headers(user_a["token"]),
        json={"dataUrl": TINY_DATA_URL, "isPrivate": False},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    r = api.delete(
        f"{BASE_URL}/api/profile/photos/{pid}",
        headers=_headers(user_a["token"]),
        timeout=15,
    )
    assert r.status_code == 200 and r.json().get("ok")


def test_profile_location_geojson(api, user_a):
    r = api.post(
        f"{BASE_URL}/api/profile/location",
        headers=_headers(user_a["token"]),
        json={"latitude": 13.0, "longitude": 77.5},
        timeout=15,
    )
    assert r.status_code == 200
    # verify via GET profile
    r = api.get(f"{BASE_URL}/api/profile", headers=_headers(user_a["token"]), timeout=15)
    assert r.status_code == 200
    loc = r.json().get("location")
    assert loc and loc.get("type") == "Point"
    assert loc.get("coordinates") == [77.5, 13.0]


# ---------- discovery / matching ----------

def test_discovery_hides_coordinates(api, user_a):
    r = api.get(f"{BASE_URL}/api/discovery", headers=_headers(user_a["token"]), timeout=15)
    assert r.status_code == 200
    for p in r.json()["profiles"]:
        assert "location" not in p
        assert "coordinates" not in p


def test_reciprocal_like_creates_match(api, user_a, user_b):
    r1 = api.post(
        f"{BASE_URL}/api/discovery/{user_b['id']}/like",
        headers=_headers(user_a["token"]),
        timeout=15,
    )
    assert r1.status_code == 200
    r2 = api.post(
        f"{BASE_URL}/api/discovery/{user_a['id']}/like",
        headers=_headers(user_b["token"]),
        timeout=15,
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body.get("matched") is True
    assert body.get("conversationId")
    explanation = body.get("explanation") or {}
    assert "sharedInterests" in explanation
    assert "Coffee" in explanation["sharedInterests"]
    # persist for downstream tests
    pytest.conversation_id = body["conversationId"]


def test_matches_list(api, user_a):
    r = api.get(f"{BASE_URL}/api/matches", headers=_headers(user_a["token"]), timeout=15)
    assert r.status_code == 200
    matches = r.json()["matches"]
    assert matches, "expected at least one match"
    m = matches[0]
    assert m["other"]["displayName"]
    assert "sharedInterests" in (m.get("explanation") or {})


# ---------- chat REST ----------

def test_chat_conversation_and_messages(api, user_a, user_b):
    conv_id = getattr(pytest, "conversation_id", None)
    assert conv_id, "matched conversation missing"
    # send from A
    r = api.post(
        f"{BASE_URL}/api/chat/{conv_id}/messages",
        headers=_headers(user_a["token"]),
        json={"body": "hello from A"},
        timeout=15,
    )
    assert r.status_code == 200
    msg = r.json()
    assert msg.get("id") and msg.get("body") == "hello from A"
    # list conversations for B
    r = api.get(f"{BASE_URL}/api/chat", headers=_headers(user_b["token"]), timeout=15)
    assert r.status_code == 200
    convs = r.json()["conversations"]
    assert any(c["id"] == conv_id and c["unreadCount"] >= 1 for c in convs)
    # get messages (paginated)
    r = api.get(
        f"{BASE_URL}/api/chat/{conv_id}/messages?limit=10",
        headers=_headers(user_b["token"]),
        timeout=15,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data.get("messages"), list) and len(data["messages"]) >= 1
    assert "nextCursor" in data


def test_chat_mark_read(api, user_b):
    conv_id = pytest.conversation_id
    # send another message from A? Instead just call read as B
    r = api.post(
        f"{BASE_URL}/api/chat/{conv_id}/read", headers=_headers(user_b["token"]), timeout=15
    )
    assert r.status_code == 200 and r.json().get("ok")
    r = api.get(f"{BASE_URL}/api/chat", headers=_headers(user_b["token"]), timeout=15)
    convs = r.json()["conversations"]
    for c in convs:
        if c["id"] == conv_id:
            assert c["unreadCount"] == 0


# ---------- WebSocket ----------

def test_websocket_message_delivery(user_a, user_b):
    async def run():
        conv_id = pytest.conversation_id
        url_a = f"{WS_URL}?token={user_a['token']}"
        url_b = f"{WS_URL}?token={user_b['token']}"
        async with websockets.connect(url_a) as wa, websockets.connect(url_b) as wb:
            # consume initial connected frames
            await asyncio.wait_for(wa.recv(), timeout=5)
            await asyncio.wait_for(wb.recv(), timeout=5)
            await wa.send(
                json.dumps(
                    {"type": "message", "conversationId": conv_id, "body": "ws hello", "clientId": "c1"}
                )
            )
            # B should receive a message frame
            got = None
            for _ in range(6):
                raw = await asyncio.wait_for(wb.recv(), timeout=5)
                data = json.loads(raw)
                if data.get("type") == "message":
                    got = data
                    break
            assert got and got["message"]["body"] == "ws hello"
            # typing broadcast
            await wa.send(
                json.dumps({"type": "typing", "conversationId": conv_id, "state": True})
            )
            typed = None
            for _ in range(6):
                raw = await asyncio.wait_for(wb.recv(), timeout=5)
                data = json.loads(raw)
                if data.get("type") == "typing":
                    typed = data
                    break
            assert typed and typed["state"] is True

    asyncio.run(run())


def test_websocket_bad_token_rejected():
    async def run():
        try:
            async with websockets.connect(f"{WS_URL}?token=bogus") as ws:
                await asyncio.wait_for(ws.recv(), timeout=3)
        except Exception:
            return True
        return False

    assert asyncio.run(run())


# ---------- photo requests ----------

def test_photo_requests_flow(api, user_a, user_b):
    # self-request rejected
    r = api.post(
        f"{BASE_URL}/api/photo-requests",
        headers=_headers(user_a["token"]),
        json={"targetUserId": user_a["id"]},
        timeout=15,
    )
    assert r.status_code == 400
    # create
    r = api.post(
        f"{BASE_URL}/api/photo-requests",
        headers=_headers(user_a["token"]),
        json={"targetUserId": user_b["id"]},
        timeout=15,
    )
    assert r.status_code == 200
    req_id = r.json()["id"]
    # list for B
    r = api.get(
        f"{BASE_URL}/api/photo-requests", headers=_headers(user_b["token"]), timeout=15
    )
    assert r.status_code == 200
    body = r.json()
    assert any(x["id"] == req_id for x in body["incoming"])
    # accept
    r = api.post(
        f"{BASE_URL}/api/photo-requests/{req_id}/decision",
        headers=_headers(user_b["token"]),
        json={"decision": "accepted"},
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"


# ---------- blocks ----------

def test_blocks_hide_from_discovery(api, user_a, user_b):
    # A blocks B
    r = api.post(
        f"{BASE_URL}/api/blocks",
        headers=_headers(user_a["token"]),
        json={"targetUserId": user_b["id"]},
        timeout=15,
    )
    assert r.status_code == 200
    # B should not see A in discovery
    r = api.get(f"{BASE_URL}/api/discovery", headers=_headers(user_b["token"]), timeout=15)
    ids = [p.get("id") or p.get("userId") for p in r.json()["profiles"]]
    assert user_a["id"] not in ids
    # A should not see B either
    r = api.get(f"{BASE_URL}/api/discovery", headers=_headers(user_a["token"]), timeout=15)
    ids = [p.get("id") or p.get("userId") for p in r.json()["profiles"]]
    assert user_b["id"] not in ids
    # unblock
    r = api.delete(
        f"{BASE_URL}/api/blocks/{user_b['id']}",
        headers=_headers(user_a["token"]),
        timeout=15,
    )
    assert r.status_code == 200


# ---------- reports ----------

def test_report_validations(api, user_a, user_b):
    # unsupported category
    r = api.post(
        f"{BASE_URL}/api/reports",
        headers=_headers(user_a["token"]),
        json={"targetUserId": user_b["id"], "category": "NotACategory"},
        timeout=15,
    )
    assert r.status_code == 422
    # self report
    r = api.post(
        f"{BASE_URL}/api/reports",
        headers=_headers(user_a["token"]),
        json={"targetUserId": user_a["id"], "category": "Spam"},
        timeout=15,
    )
    assert r.status_code == 400
    # valid
    r = api.post(
        f"{BASE_URL}/api/reports",
        headers=_headers(user_a["token"]),
        json={"targetUserId": user_b["id"], "category": "Spam", "description": "TEST"},
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "open"


# ---------- support tickets ----------

def test_support_ticket_lifecycle(api, user_a):
    # unsupported category
    r = api.post(
        f"{BASE_URL}/api/support/tickets",
        headers=_headers(user_a["token"]),
        json={"category": "Unknown", "subject": "Test", "description": "hello world"},
        timeout=15,
    )
    assert r.status_code == 422
    # create ok
    r = api.post(
        f"{BASE_URL}/api/support/tickets",
        headers=_headers(user_a["token"]),
        json={"category": "Bug", "subject": "TEST_ticket", "description": "Reproducing here"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    ticket_id = r.json()["id"]
    r = api.get(f"{BASE_URL}/api/support/tickets", headers=_headers(user_a["token"]), timeout=15)
    assert r.status_code == 200
    assert any(t["id"] == ticket_id for t in r.json()["tickets"])
    r = api.get(
        f"{BASE_URL}/api/support/tickets/{ticket_id}",
        headers=_headers(user_a["token"]),
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["messages"], "ticket should include initial description as a message"


# ---------- admin ----------

def test_admin_requires_key(api):
    # no header -> should be 503 (no admin key configured) or 401/403
    r = api.get(f"{BASE_URL}/api/admin/overview", timeout=15)
    assert r.status_code in (401, 403, 503), r.text


# ---------- subscriptions (do not initiate real payment) ----------

def test_subscription_plans_and_mine(api, user_a):
    # plans list is public/authorized – check both
    r = api.get(f"{BASE_URL}/api/subscriptions/plans", headers=_headers(user_a["token"]), timeout=15)
    assert r.status_code == 200
    r = api.get(f"{BASE_URL}/api/subscriptions/mine", headers=_headers(user_a["token"]), timeout=15)
    assert r.status_code in (200, 404)
