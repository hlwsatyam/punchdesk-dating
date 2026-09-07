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