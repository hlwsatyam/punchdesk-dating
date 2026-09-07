# Punch Desk Admin Web

This folder is the separate web foundation for Punch Desk’s landing page and admin panel.

- `src/App.tsx` contains the reusable landing preview and the first admin dashboard shell.
- `src/styles.css` contains the obsidian/gold responsive design system.
- The phone showcases are real React/CSS compositions, not screenshots or stock app images.

The Expo app remains in `/app/frontend` and the FastAPI engine remains in `/app/backend`.

## Next web setup

Create a Vite React TypeScript entry point around `src/main.tsx`, then wire TanStack Query to `/api/admin/overview` and role-based admin routes. The UI intentionally starts with the same configuration-driven language as the mobile app.