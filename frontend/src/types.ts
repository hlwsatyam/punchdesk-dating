export type AppConfig = {
  appName: string;
  tagline: string;
  datingMode: string;
  theme: Record<string, string>;
  genderOptions: string[];
  orientationOptions: string[];
  relationshipOptions: string[];
  interests: string[];
  profileFields: Array<{ key: string; label: string; type: string; required: boolean }>;
  reportCategories?: string[];
  supportCategories?: string[];
  location: { required: boolean; minRadius: number; defaultRadius: number; maxRadius: number };
  permissions: { locationRequired: boolean; notificationsRequired: boolean };
  features: Record<string, boolean>;
};

export type Profile = {
  id: string;
  displayName: string;
  age: number;
  distance: number;
  verified: boolean;
  bio: string;
  interests: string[];
  photos: string[];
  online: boolean;
};

export type Session = {
  accessToken: string;
  user: { id: string; phone: string; onboardingComplete: boolean };
};

export type Photo = { id: string; dataUrl: string; isPrivate: boolean };

export type Conversation = {
  id: string;
  otherUserId: string;
  other: { id: string; displayName: string; age: number; photos: string[]; verified: boolean };
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  online: boolean;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  status: string;
  readBy: string[];
};

export type Match = {
  id: string;
  users: string[];
  matchedAt: string;
  other: { id: string; displayName: string; age: number; photos: string[] };
  conversationId?: string;
  explanation: { sharedInterests: string[]; summary: string };
};

export type PhotoRequest = {
  id: string;
  requesterId: string;
  receiverId: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  userId: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  authorId: string;
  authorRole: "user" | "admin";
  body: string;
  createdAt: string;
};

export type Plan = {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
};
