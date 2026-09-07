# Punch Desk PRD

## Problem statement

Build **Punch Desk**, a premium, reusable, configuration-driven dating engine — initially positioned for gay dating but the same codebase must switch to a general dating niche by changing backend configuration alone. The product includes an Expo React Native mobile app, FastAPI/MongoDB backend, and separate foundations for a premium admin panel and landing page.

## Architecture

- `/app/frontend` — Expo (React Native, Expo Router, TypeScript, TanStack Query). Dark luxe theme (`src/theme.ts`), safe-area layouts, secure token storage, permission flow, native push token adapter, WebSocket chat hook (`src/hooks/use-chat-socket.ts`).
- `/app/backend` — FastAPI monorepo split into modular package `backend/app/`:
  - `app/core.py` — env, Mongo client, JWT/OTP helpers, `current_user`, `admin_guard`, image validation.
  - `app/schemas.py` — Pydantic models for every endpoint.
  - `app/services/` — `config_service`, `matching`, `notifications` (Firebase), `razorpay_provider`, `realtime` (WebSocket manager).
  - `app/routers/` — `health`, `config`, `auth`, `profile`, `discovery`, `chat` (REST + WebSocket), `moderation`, `support`, `subscriptions`, `devices`, `admin`.
  - `server.py` — thin entrypoint that delegates to `app.main.create_app()`.
- `/app/admin_web` — foundation for the future premium Vite admin dashboard.

## Implemented milestones

### 2026-09-07 — Foundation (previous session)
- Premium obsidian/gold onboarding + phone/OTP/permissions/setup/discovery/likes/profile in mobile.
- Backend AppConfig, seed data, demo OTP + JWT, profile CRUD, discovery/likes/pass, matches skeleton, subscription plans, Razorpay provider stub, webhook signature boundary.
- Landing/admin preview scaffolds, environment templates, native push adapter.
- Photo upload → local `uploads/`, GPS/geospatial discovery, shared-interest match explanation.

### 2026-09-07 — Depth pass (this session)
- **Backend refactor**: monolithic `server.py` broken into `app/` package (core, schemas, services, routers) — server.py is now ~3 lines.
- **Real-time chat**: WebSocket route `/api/ws/chat?token=...` with per-user connection manager, message delivery, typing indicators, read receipts, unread counter per user, presence, ping/pong keep-alive. REST endpoints `GET /api/chat`, `GET/POST /api/chat/{id}/messages`, `POST /api/chat/{id}/read` with cursor pagination.
- **Photo requests**: `POST/GET /api/photo-requests`, `POST /api/photo-requests/{id}/decision` with rate limits and notifications.
- **Blocks & reports**: bidirectional block hide from discovery, category-validated reports, moderation service.
- **Support tickets**: create/list/get/reply for user + admin reply route.
- **Firebase provider**: `services/notifications.py` initializes only when service-account JSON is supplied; safely no-ops otherwise. Every notification is still persisted to `db.notifications` for future replay.
- **Razorpay**: split into `services/razorpay_provider.py` covering subscriptions AND one-time orders with signature verification. Verify endpoints: `/api/subscriptions/verify`, `/api/payments/verify`; webhook idempotency by `X-Razorpay-Event-Id`.
- **Admin**: `/api/admin/overview`, `/config`, `/users` (+status action), `/reports` (+action), `/support/tickets` (+status +reply), `/analytics`, `/audit-logs`.
- **Account lifecycle**: heartbeat + account deletion endpoints.
- **Mobile**: new Messages tab (matches strip + conversations list), match celebration modal, `/chat/[id]` conversation screen with WebSocket + optimistic sends + reconnect, `/support` ticket screen, more-menu on discovery card with Request photos / Report / Block, cold-start-safe "reconnecting" indicator.

## Test coverage
- Regression suite in `/app/backend/tests/test_punchdesk_regression.py`: 20/20 passing against the public backend URL.
- Frontend UI smoke walkthrough (welcome → OTP → permissions → setup → tabs → more-sheet → support) validated via testing agent.

## Reusability guarantees
- Config-driven: `datingMode`, gender/orientation/relationship options, interests, profile fields, `reportCategories`, `supportCategories`, radius bounds, feature flags, theme, permissions — all sourced from `GET /api/config/app`. Admin can PATCH any of them at `/api/admin/config`.
- Nothing in the codebase hard-codes "gay" outside the seed default in `AppConfig`.

## Known integration status
- **Demo OTP**: working (code `123456`); real SMS provider is not connected.
- **Razorpay**: subscription and order endpoints implemented with server-side signature verification and webhook idempotency. Live keys are configured in `.env`; **do not run uncontrolled real transactions**. Webhook secret and Razorpay plan id can be set via `RAZORPAY_WEBHOOK_SECRET` and `RAZORPAY_PLAN_ID` for test-mode validation.
- **Firebase**: provider is credential-gated. To enable set `FIREBASE_SERVICE_ACCOUNT` (path to JSON or inline JSON) and optionally `FIREBASE_PROJECT_ID`. Push delivery only works on a native EAS build with `google-services.json` shipped. Package name / bundle id: `com.emergent.gaydatingengine.p0n5wm`.

## Backlog (next iterations)

### P0
1. Admin panel: full Vite app connected to `/api/admin/*` (users, config editor, reports queue, support inbox, plans, analytics).
2. Premium landing page: hero + CSS phone mockups + all sections listed in the PRD.
3. Real SMS OTP provider adapter + IP/device/phone rate limiting.

### P1
1. Notification templates (`MATCH_CREATED`, `NEW_MESSAGE`, …) + admin CRUD.
2. Deep-link handling in mobile (chat/match/profile) via `expo-linking`.
3. Photo request flow in Messages tab (incoming list + decision UI).
4. Optimistic chat with local cache, offline queue, background reconnection UX.

### P2
1. Analytics dashboards, audit logs UI, content management.
2. Storage abstraction to move `uploads/` to managed object storage.
3. Performance: FlashList, image caching, skeleton loaders, background heartbeats.
