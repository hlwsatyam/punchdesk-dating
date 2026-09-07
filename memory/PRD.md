# Punch Desk PRD

## Problem statement

Build Punch Desk, a premium dating product initially configured for gay dating while remaining a reusable, backend-driven dating engine. The product includes a native Expo mobile experience, FastAPI/MongoDB engine, and separate web foundations for landing and admin operations.

## Architecture

- `/app/frontend`: Expo React Native mobile application with Expo Router, TanStack Query, safe-area layouts, centralized dark luxe theme, secure token storage, permission flow, and native notification-token adapter.
- `/app/backend`: FastAPI API with MongoDB, configuration engine, demo OTP/JWT auth, profile/discovery/matching foundations, device registration, chat persistence endpoints, subscription plans, Razorpay provider boundary, and webhook verification boundary.
- `/app/admin_web`: separate React/Vite-ready landing page and admin preview foundation with CSS-built phone previews and a premium dashboard shell.

## Personas

- Member: an adult looking for nearby, intentional connections with privacy controls.
- Moderator/support agent: reviews reports and helps members.
- Admin: configures the dating niche, branding, profile fields, feature flags, plans, and metrics.

## Core requirements (static)

- Configuration-driven app identity, theme, dating mode, options, profile fields, radius, permissions, feature flags, and plans.
- Mobile-number OTP authentication with adult validation before production SMS integration.
- Permission-first onboarding for location and notifications.
- Profile setup, nearby discovery, like/pass actions, matching, chat persistence, photo requests, subscriptions, support, block/report, account deletion, and admin operations.
- Approximate distance only; never expose exact user coordinates.
- Server-side payment verification and idempotent Razorpay webhook handling.
- FCM device token management and deep links for messages and matches.

## Implemented 2026-09-07

- Replaced the starter screen with a premium obsidian/gold Punch Desk mobile flow: welcome, phone, OTP, permissions, profile setup, discovery, likes, profile, empty/error states, press feedback, and safe-area-aware bottom navigation.
- Added backend app configuration endpoint, seeded plans/interests/demo profiles, demo OTP hashing/expiry/attempt limits, JWT sessions, profile CRUD, discovery interactions, matches, paginated chat reads, device registration, subscription plan reads, Razorpay provider/verifier boundary, and webhook signature/idempotency boundary.
- Added separate `/app/admin_web` landing/admin preview with real CSS/React phone UI compositions, responsive feature sections, and dashboard metrics/chart shell.
- Added environment templates, app permissions, native push token registration adapter, branded app metadata, and development test credentials documentation.

## Prioritized backlog

### P0 — next

1. Add real SMS OTP provider adapter and production rate limiting by IP/device/phone.
2. Add full profile photo upload/storage, geospatial discovery query, adult age validation, and privacy controls.
3. Add WebSocket conversation events, optimistic mobile chat UI, read receipts, typing presence, and deep-link routing.
4. Provide Razorpay plan/webhook configuration and Firebase service-account/native app files, then run test-mode checkout and physical-device FCM verification.

### P1

1. Photo request accept/reject flow, moderation reports, blocks, support tickets, and notification templates.
2. Role-based admin authentication and connected users/reports/support/configuration screens.
3. Analytics aggregation, audit logs, subscription lifecycle sync, and inactive-profile heartbeat processing.

### P2

1. Landing SEO metadata, testimonials/FAQ CMS, content management, and richer profile compatibility.
2. FlashList/image caching, offline queues, background notification handling, accessibility audit, and performance instrumentation.

## Known integration status

- Demo OTP is working. Real SMS is not connected.
- Razorpay provider and verification code are implemented, but live checkout is not active until a Razorpay plan ID and webhook secret are configured; never trust client payment success.
- Native push token registration is implemented. FCM delivery is not active until Firebase Admin credentials and Android/iOS native Firebase configuration are supplied.