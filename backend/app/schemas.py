"""Pydantic schemas used across the Punch Desk API."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class AppConfig(BaseModel):
    appName: str = "Punch Desk"
    tagline: str = "Meet people who are actually nearby."
    datingMode: str = "gay"
    logo: str = "punch-desk"
    theme: dict[str, str] = {
        "primary": "#D4AF37",
        "secondary": "#8C7124",
        "background": "#0C0D10",
        "card": "#16181D",
        "text": "#F4F4F6",
        "muted": "#8A8F9D",
        "radius": "large",
    }
    genderOptions: list[str] = ["Man", "Non-binary", "Prefer not to say"]
    orientationOptions: list[str] = ["Gay", "Bisexual", "Queer", "Prefer not to say"]
    relationshipOptions: list[str] = [
        "Something casual",
        "Something meaningful",
        "Open to see where it goes",
    ]
    interests: list[str] = ["Coffee", "Design", "Travel", "Music", "Fitness", "Food"]
    profileFields: list[dict[str, Any]] = [
        {"key": "displayName", "label": "Display name", "type": "text", "required": True},
        {"key": "bio", "label": "Bio", "type": "textarea", "required": False},
        {"key": "gender", "label": "Gender", "type": "select", "required": True},
        {"key": "orientation", "label": "Orientation", "type": "select", "required": True},
        {"key": "relationshipPreference", "label": "Looking for", "type": "select", "required": False},
    ]
    reportCategories: list[str] = [
        "Spam",
        "Harassment",
        "Fake profile",
        "Inappropriate content",
        "Scam",
        "Other",
    ]
    supportCategories: list[str] = ["Account", "Billing", "Safety", "Bug", "Feedback"]
    location: dict[str, Any] = {
        "required": True,
        "minRadius": 5,
        "defaultRadius": 25,
        "maxRadius": 50,
    }
    permissions: dict[str, bool] = {"locationRequired": True, "notificationsRequired": False}
    features: dict[str, bool] = {
        "chat": True,
        "photoRequests": True,
        "subscriptions": True,
        "location": True,
        "matching": True,
        "reports": True,
        "support": True,
    }
    presence: dict[str, bool] = {"enabled": True, "showLastActive": True}


class PhoneRequest(BaseModel):
    phone: str = Field(min_length=7, max_length=20)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        normalized = "".join(character for character in value if character.isdigit() or character == "+")
        if len(normalized.replace("+", "")) < 7:
            raise ValueError("Enter a valid mobile number")
        return normalized


class OtpVerification(PhoneRequest):
    code: str = Field(min_length=4, max_length=8)


class ProfileUpdate(BaseModel):
    displayName: str | None = Field(default=None, max_length=48)
    bio: str | None = Field(default=None, max_length=280)
    age: int | None = Field(default=None, ge=18, le=120)
    gender: str | None = None
    orientation: str | None = None
    relationshipPreference: str | None = None
    interests: list[str] | None = Field(default=None, max_length=12)
    location: dict[str, float] | None = None


class LocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PhotoUpload(BaseModel):
    dataUrl: str = Field(min_length=32, max_length=12_000_000)
    isPrivate: bool = False


class DeviceRegistration(BaseModel):
    token: str = Field(min_length=8, max_length=4096)
    platform: Literal["ios", "android", "web"]
    provider: Literal["fcm", "expo"] = "fcm"
    appVersion: str | None = None


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class PhotoRequestCreate(BaseModel):
    targetUserId: str = Field(min_length=1, max_length=64)


class PhotoRequestDecision(BaseModel):
    decision: Literal["accepted", "rejected"]


class ReportCreate(BaseModel):
    targetUserId: str = Field(min_length=1, max_length=64)
    category: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=1000)


class BlockCreate(BaseModel):
    targetUserId: str = Field(min_length=1, max_length=64)


class SupportTicketCreate(BaseModel):
    category: str = Field(min_length=1, max_length=64)
    subject: str = Field(min_length=3, max_length=140)
    description: str = Field(min_length=5, max_length=4000)


class SupportReplyCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class AdminConfigUpdate(BaseModel):
    appName: str | None = None
    tagline: str | None = None
    datingMode: str | None = None
    theme: dict[str, str] | None = None
    genderOptions: list[str] | None = None
    orientationOptions: list[str] | None = None
    relationshipOptions: list[str] | None = None
    profileFields: list[dict[str, Any]] | None = None
    reportCategories: list[str] | None = None
    supportCategories: list[str] | None = None
    location: dict[str, Any] | None = None
    permissions: dict[str, bool] | None = None
    features: dict[str, bool] | None = None


class CheckoutVerification(BaseModel):
    paymentId: str
    subscriptionId: str
    signature: str


class OrderCreate(BaseModel):
    planId: str = Field(min_length=1, max_length=64)


class OrderVerification(BaseModel):
    orderId: str
    paymentId: str
    signature: str


class SupportTicketStatusUpdate(BaseModel):
    status: Literal["open", "in_progress", "waiting_user", "resolved", "closed"]


class ReportActionUpdate(BaseModel):
    action: Literal["dismiss", "warn", "suspend", "ban"]
    note: str | None = Field(default=None, max_length=500)
