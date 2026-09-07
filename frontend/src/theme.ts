import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#0C0D10",
  onSurface: "#F4F4F6",
  surfaceSecondary: "#16181D",
  onSurfaceSecondary: "#E2E2E6",
  surfaceTertiary: "#20232A",
  onSurfaceTertiary: "#C5C5CC",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0C0D10",
  muted: "#8A8F9D",
  brand: "#C29B38",
  onBrand: "#0C0D10",
  brandPrimary: "#D4AF37",
  onBrandPrimary: "#0C0D10",
  brandSecondary: "#8C7124",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#2E2713",
  onBrandTertiary: "#EEDD99",
  success: "#2D6A4F",
  onSuccess: "#E8F5E9",
  warning: "#B7791F",
  onWarning: "#FFF8E1",
  error: "#9B2C2C",
  onError: "#FFEBEE",
  info: "#2B6CB0",
  onInfo: "#E3F2FD",
  border: "#2A2E39",
  borderStrong: "#4A5061",
  divider: "#1E222B",
};

export type ThemeColors = typeof dark;
export const defaultScheme: ColorScheme = "dark";
export const themes: { light: ThemeColors; dark: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme);
}

setColorScheme(null);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "light" ? "light" : "dark";
  return { scheme, colors: themes[scheme] };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}