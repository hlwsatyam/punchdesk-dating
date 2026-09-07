import Constants from "expo-constants";
import { storage } from "@/src/utils/storage";
import type { AppConfig, Profile, Session } from "@/src/types";

const baseUrl = (Constants.expoConfig?.extra?.backendUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? process.env.EXPO_BACKEND_URL ?? "").replace(/\/$/, "");
const API_ROOT = `${baseUrl}/api`;
const TOKEN_KEY = "punch-desk-access-token";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail ?? "Something went wrong. Please try again.");
  return payload as T;
}

export const api = {
  config: () => request<AppConfig>("/config/app"),
  requestOtp: (phone: string) => request<{ ok: boolean; demoCode?: string; expiresIn: number }>("/auth/request-otp", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyOtp: async (phone: string, code: string) => {
    const session = await request<Session>("/auth/verify-otp", { method: "POST", body: JSON.stringify({ phone, code }) });
    await storage.secureSet(TOKEN_KEY, session.accessToken);
    return session;
  },
  discovery: () => request<{ profiles: Profile[]; radius: number; maxRadius: number }>("/discovery"),
  like: (id: string) => request<{ liked: boolean; matched: boolean }>(`/discovery/${id}/like`, { method: "POST" }),
  pass: (id: string) => request<{ passed: boolean }>(`/discovery/${id}/pass`, { method: "POST" }),
  matches: () => request<{ matches: Array<{ id: string; matchedAt: string }> }>("/matches"),
  updateProfile: (profile: Record<string, unknown>) => request<Record<string, unknown>>("/profile", { method: "PATCH", body: JSON.stringify(profile) }),
  registerDevice: (token: string, platform: "ios" | "android" | "web") => request<{ ok: boolean }>("/devices", { method: "POST", body: JSON.stringify({ token, platform, provider: "fcm" }) }),
};

export async function clearSession() {
  await storage.secureRemove(TOKEN_KEY);
}