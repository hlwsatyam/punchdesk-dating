import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Profile } from "@/src/types";
import { makeStyles, useTheme } from "@/src/theme";

export function ProfileCard({ profile, index, onPass, onLike }: { profile: Profile; index: number; onPass: () => void; onLike: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const portraitColors = [colors.surfaceTertiary, colors.brandTertiary, colors.surfaceSecondary];
  return (
    <View style={styles.card} testID="profile-card">
      <View style={[styles.portrait, { backgroundColor: portraitColors[index % portraitColors.length] }]}>
        <View style={styles.portraitGlow} />
        {profile.photos[0] ? <Image source={{ uri: profile.photos[0] }} contentFit="cover" style={StyleSheet.absoluteFillObject} /> : <Text style={styles.initial}>{profile.displayName.charAt(0)}</Text>}
        <View style={styles.scrim} />
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.profileName}>{profile.displayName}, {profile.age}</Text>
            {profile.verified ? <Ionicons name="checkmark-circle" size={20} color={styles.verified.color} /> : null}
          </View>
          <View style={styles.metaRow}><Ionicons name="location-outline" size={14} color={styles.meta.color} /><Text style={styles.meta}>{profile.distance} km away · {profile.online ? "Online now" : "Recently active"}</Text></View>
          <Text style={styles.bio} numberOfLines={2}>{profile.bio}</Text>
          <View style={styles.tags}>{profile.interests.slice(0, 3).map((interest) => <View style={styles.tag} key={interest}><Text style={styles.tagText}>{interest}</Text></View>)}</View>
        </View>
      </View>
      <View style={styles.actionRow}>
        <Pressable testID={`pass-${profile.id}`} accessibilityRole="button" accessibilityLabel={`Pass on ${profile.displayName}`} onPress={onPass} style={({ pressed }) => [styles.action, styles.passAction, pressed && styles.pressed]}><Ionicons name="close" size={25} color={styles.passIcon.color} /></Pressable>
        <Pressable testID={`like-${profile.id}`} accessibilityRole="button" accessibilityLabel={`Like ${profile.displayName}`} onPress={onLike} style={({ pressed }) => [styles.action, styles.likeAction, pressed && styles.pressed]}><Ionicons name="heart" size={23} color={styles.likeIcon.color} /></Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  portrait: { flex: 1, minHeight: 440, justifyContent: "center", overflow: "hidden" },
  portraitGlow: { position: "absolute", width: 230, height: 230, borderRadius: 120, backgroundColor: colors.brandTertiary, opacity: 0.45, top: 48, right: -42 },
  initial: { color: colors.onSurfaceTertiary, opacity: 0.28, fontSize: 180, fontWeight: "800", textAlign: "center", marginTop: -50 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface, opacity: 0.12 },
  cardInfo: { position: "absolute", left: 22, right: 22, bottom: 22 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  profileName: { color: colors.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.8 },
  verified: { color: colors.brandPrimary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  meta: { color: colors.onSurfaceSecondary, fontSize: 13 },
  bio: { color: colors.onSurface, fontSize: 15, lineHeight: 21, marginTop: 14 },
  tags: { flexDirection: "row", gap: 8, marginTop: 14 },
  tag: { backgroundColor: colors.surface, opacity: 0.9, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  tagText: { color: colors.onSurface, fontSize: 11, fontWeight: "600" },
  actionRow: { flexDirection: "row", justifyContent: "center", gap: 18, paddingVertical: 16, backgroundColor: colors.surfaceSecondary },
  action: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  passAction: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceTertiary },
  likeAction: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary },
  passIcon: { color: colors.onSurfaceSecondary },
  likeIcon: { color: colors.onBrandPrimary },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
}));