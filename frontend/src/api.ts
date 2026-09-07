import Constants from "expo-constants";
import { storage } from "@/src/utils/storage";
import type {
  AppConfig,
  Conversation,
  Match,
  Message,
  Photo,
  PhotoRequest,
  Plan,
  Profile,
  Session,
  SupportMessage,
  SupportTicket,
} from "@/src/types";

const rawUrl =
  Constants.expoConfig?.extra?.backendUrl ??
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  process.env.EXPO_BACKEND_URL ??
  "";
export const baseUrl = String(rawUrl).replace(/\/$/, "");
export const API_ROOT = `${baseUrl}/api`;
const TOKEN_KEY = "punch-desk-access-token";

export async function getAccessToken(): Promise<string | null> {
  return storage.secureGet<string | null>(TOKEN_KEY, null);
}

export async function setAccessToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { detail?: string }).detail ?? "Something went wrong. Please try again.");
  return payload as T;
}

export const api = {
  config: () => request<AppConfig>("/config/app"),
  requestOtp: (phone: string) =>
    request<{ ok: boolean; demoCode?: string; expiresIn: number }>("/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  verifyOtp: async (phone: string, code: string) => {
    const session = await request<Session>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    });
    await setAccessToken(session.accessToken);
    return session;
  },
  heartbeat: () => request<{ ok: boolean }>("/auth/heartbeat", { method: "POST" }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  deleteAccount: () => request<{ ok: boolean }>("/auth/account", { method: "DELETE" }),
  profile: () => request<Record<string, unknown>>("/profile"),
  discovery: (radius?: number) =>
    request<{
      profiles: Profile[];
      radius: number;
      maxRadius: number;
      hasLocation: boolean;
      requiresLocation: boolean;
    }>(`/discovery${radius ? `?radius=${radius}` : ""}`),
  like: (id: string) =>
    request<{
      liked: boolean;
      matched: boolean;
      conversationId?: string;
      explanation?: { summary: string; sharedInterests: string[] };
    }>(`/discovery/${id}/like`, { method: "POST" }),
  pass: (id: string) => request<{ passed: boolean }>(`/discovery/${id}/pass`, { method: "POST" }),
  matches: () => request<{ matches: Match[] }>("/matches"),
  conversations: () => request<{ conversations: Conversation[] }>("/chat"),
  messages: (conversationId: string, before?: string) =>
    request<{ messages: Message[]; nextCursor: string | null }>(
      `/chat/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`
    ),
  sendMessage: (conversationId: string, body: string) =>
    request<Message>(`/chat/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  markRead: (conversationId: string) =>
    request<{ ok: boolean }>(`/chat/${conversationId}/read`, { method: "POST" }),
  updateProfile: (profile: Record<string, unknown>) =>
    request<Record<string, unknown>>("/profile", { method: "PATCH", body: JSON.stringify(profile) }),
  updateLocation: (latitude: number, longitude: number) =>
    request<{ ok: boolean }>("/profile/location", {
      method: "POST",
      body: JSON.stringify({ latitude, longitude }),
    }),
  uploadPhoto: (dataUrl: string, isPrivate = false) =>
    request<Photo>("/profile/photos", {
      method: "POST",
      body: JSON.stringify({ dataUrl, isPrivate }),
    }),
  deletePhoto: (id: string) => request<{ ok: boolean }>(`/profile/photos/${id}`, { method: "DELETE" }),
  requestPhoto: (targetUserId: string) =>
    request<PhotoRequest>("/photo-requests", {
      method: "POST",
      body: JSON.stringify({ targetUserId }),
    }),
  photoRequests: () =>
    request<{ incoming: PhotoRequest[]; outgoing: PhotoRequest[] }>("/photo-requests"),
  decidePhotoRequest: (id: string, decision: "accepted" | "rejected") =>
    request<{ ok: boolean; status: string }>(`/photo-requests/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  block: (targetUserId: string) =>
    request<{ ok: boolean }>("/blocks", { method: "POST", body: JSON.stringify({ targetUserId }) }),
  report: (targetUserId: string, category: string, description?: string) =>
    request<{ id: string }>("/reports", {
      method: "POST",
      body: JSON.stringify({ targetUserId, category, description }),
    }),
  supportCreate: (category: string, subject: string, description: string) =>
    request<SupportTicket>("/support/tickets", {
      method: "POST",
      body: JSON.stringify({ category, subject, description }),
    }),
  supportList: () => request<{ tickets: SupportTicket[] }>("/support/tickets"),
  supportDetail: (id: string) =>
    request<{ ticket: SupportTicket; messages: SupportMessage[] }>(`/support/tickets/${id}`),
  supportReply: (id: string, body: string) =>
    request<SupportMessage>(`/support/tickets/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  plans: () => request<{ plans: Plan[] }>("/subscriptions/plans"),
  registerDevice: (token: string, platform: "ios" | "android" | "web") =>
    request<{ ok: boolean }>("/devices", {
      method: "POST",
      body: JSON.stringify({ token, platform, provider: "fcm" }),
    }),
};

export async function clearSession() {
  await storage.secureRemove(TOKEN_KEY);
}
