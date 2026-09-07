import os
import uuid

import requests


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")


def test_core_authenticated_flow():
    assert BASE_URL, "backend URL is not configured"
    base = BASE_URL.rstrip("/")
    phone = "+919" + str(uuid.uuid4().int)[:9]
    request = requests.post(f"{base}/api/auth/request-otp", json={"phone": phone}, timeout=15)
    assert request.status_code == 200
    bad = requests.post(f"{base}/api/auth/verify-otp", json={"phone": phone, "code": "000000"}, timeout=15)
    assert bad.status_code == 401
    good = requests.post(f"{base}/api/auth/verify-otp", json={"phone": phone, "code": "123456"}, timeout=15)
    assert good.status_code == 200 and good.json().get("accessToken")
    headers = {"Authorization": f"Bearer {good.json()['accessToken']}"}
    profile = requests.patch(f"{base}/api/profile", headers=headers, json={"displayName": "TEST_Punch", "bio": "Regression"}, timeout=15)
    assert profile.status_code == 200 and profile.json()["displayName"] == "TEST_Punch"
    discovery = requests.get(f"{base}/api/discovery", headers=headers, timeout=15)
    assert discovery.status_code == 200
    for item in discovery.json()["profiles"]:
        assert "location" not in item and "coordinates" not in item
    assert requests.get(f"{base}/api/admin/overview", timeout=15).status_code in (403, 503)
