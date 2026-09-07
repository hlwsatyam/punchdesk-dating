import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/src/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerNativePushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") return null;
  const token = await Notifications.getDevicePushTokenAsync();
  const value = typeof token.data === "string" ? token.data : null;
  if (value) await api.registerDevice(value, Platform.OS === "ios" ? "ios" : "android");
  return value;
}