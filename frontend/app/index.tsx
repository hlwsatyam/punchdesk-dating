import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BrandMark } from "@/src/components/brand-mark";
import { ProfileCard } from "@/src/components/profile-card";
import { api } from "@/src/api";
import { registerNativePushToken } from "@/src/notifications";
import { makeStyles, useTheme } from "@/src/theme";
import type { AppConfig, Profile } from "@/src/types";

type Screen = "welcome" | "phone" | "otp" | "permissions" | "setup" | "app";
type Tab = "discover" | "likes" | "profile";

const fallbackConfig: AppConfig = {
  appName: "Punch Desk",
  tagline: "Meet people who are actually nearby.",
  datingMode: "gay",
  theme: {},
  genderOptions: [],
  orientationOptions: [],
  relationshipOptions: [],
  interests: ["Coffee", "Design", "Travel", "Music", "Fitness", "Food"],
  profileFields: [],
  location: { required: true, minRadius: 5, defaultRadius: 25, maxRadius: 50 },
  permissions: { locationRequired: true, notificationsRequired: false },
  features: { chat: true, subscriptions: true, matching: true },
};

export default function Index() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [tab, setTab] = useState<Tab>("discover");
  const [config, setConfig] = useState<AppConfig>(fallbackConfig);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | undefined>();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [permissionState, setPermissionState] = useState({ location: false, notifications: false });

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(fallbackConfig));
  }, []);

  const showMessage = (value: string) => {
    setMessage(value);
    setTimeout(() => setMessage(""), 2600);
  };

  const loadDiscover = async () => {
    try {
      const result = await api.discovery();
      setProfiles(result.profiles);
      setCardIndex(0);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Discovery is taking a moment.");
    }
  };

  const handleRequestOtp = async () => {
    if (!phone.trim()) return showMessage("Enter your mobile number first.");
    setBusy(true);
    try {
      const result = await api.requestOtp(phone);
      setDemoCode(result.demoCode);
      setScreen("otp");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "We could not send that code.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!code.trim()) return showMessage("Enter the six-digit code.");
    setBusy(true);
    try {
      const session = await api.verifyOtp(phone, code);
      registerNativePushToken().catch(() => undefined);
      setDisplayName(session.user.onboardingComplete ? "" : "");
      setScreen("permissions");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "That code did not work.");
    } finally {
      setBusy(false);
    }
  };

  const handlePermissions = async () => {
    setBusy(true);
    try {
      if (Platform.OS !== "web" && config.permissions.locationRequired) {
        const location = await Location.requestForegroundPermissionsAsync();
        setPermissionState((current) => ({ ...current, location: location.status === "granted" }));
      }
      if (Platform.OS !== "web") {
        const notifications = await Notifications.requestPermissionsAsync();
        setPermissionState((current) => ({ ...current, notifications: notifications.status === "granted" }));
      }
      setScreen("setup");
    } catch {
      setScreen("setup");
      showMessage("You can manage permissions later in Settings.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) return showMessage("Add a display name to continue.");
    setBusy(true);
    try {
      await api.updateProfile({ displayName: displayName.trim(), bio: bio.trim(), interests });
      await loadDiscover();
      setScreen("app");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "We could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  const advanceCard = async (action: "like" | "pass") => {
    const profile = profiles[cardIndex];
    if (!profile) return;
    try {
      const result = action === "like" ? await api.like(profile.id) : await api.pass(profile.id);
      if (action === "like" && result.matched) showMessage("It’s a match. Say hello when you’re ready.");
    } catch {
      showMessage("Your choice will retry when you’re back online.");
    }
    setCardIndex((current) => current + 1);
  };

  if (screen === "welcome") return <Welcome config={config} onStart={() => setScreen("phone")} styles={styles} insets={insets} />;
  if (screen === "phone") return <PhoneEntry phone={phone} setPhone={setPhone} onBack={() => setScreen("welcome")} onContinue={handleRequestOtp} busy={busy} styles={styles} insets={insets} />;
  if (screen === "otp") return <OtpEntry phone={phone} code={code} setCode={setCode} demoCode={demoCode} onBack={() => setScreen("phone")} onContinue={handleVerify} busy={busy} styles={styles} insets={insets} />;
  if (screen === "permissions") return <Permissions onContinue={handlePermissions} busy={busy} config={config} styles={styles} insets={insets} />;
  if (screen === "setup") return <ProfileSetup config={config} displayName={displayName} setDisplayName={setDisplayName} bio={bio} setBio={setBio} interests={interests} setInterests={setInterests} onContinue={handleSaveProfile} busy={busy} styles={styles} insets={insets} />;

  return (
    <View style={styles.root}>
      <View style={[styles.appContent, { paddingTop: insets.top + 18 }]}>
        <View style={styles.topBar}><BrandMark compact /><Pressable style={styles.iconButton} accessibilityLabel="Open settings"><Ionicons name="options-outline" size={22} color={colors.onSurface} /></Pressable></View>
        {message ? <View style={styles.toast}><Ionicons name="sparkles-outline" size={16} color={colors.brandPrimary} /><Text style={styles.toastText}>{message}</Text></View> : null}
        {tab === "discover" ? <Discover profiles={profiles} cardIndex={cardIndex} radius={config.location.defaultRadius} onPass={() => advanceCard("pass")} onLike={() => advanceCard("like")} onReload={loadDiscover} styles={styles} /> : null}
        {tab === "likes" ? <Likes styles={styles} /> : null}
        {tab === "profile" ? <ProfileHome displayName={displayName || "Your profile"} locationGranted={permissionState.location} styles={styles} /> : null}
      </View>
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TabButton label="Discover" icon="compass-outline" active={tab === "discover"} onPress={() => setTab("discover")} styles={styles} />
        <TabButton label="Likes" icon="heart-outline" active={tab === "likes"} onPress={() => setTab("likes")} styles={styles} />
        <TabButton label="Profile" icon="person-outline" active={tab === "profile"} onPress={() => setTab("profile")} styles={styles} />
      </View>
    </View>
  );
}

function Welcome({ config, onStart, styles, insets }: { config: AppConfig; onStart: () => void; styles: ReturnType<typeof useStyles>; insets: ReturnType<typeof useSafeAreaInsets> }) {
  return <View style={styles.root}><View style={[styles.welcome, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 20 }]}><View><BrandMark /><View style={styles.heroOrb}><Ionicons name="heart" size={72} color={styles.heroHeart.color} /></View><Text style={styles.eyebrow}>A MORE INTENTIONAL WAY TO MEET</Text><Text style={styles.heroTitle}>Closer feels{`\n`}better.</Text><Text style={styles.heroCopy}>{config.tagline}</Text></View><View><View style={styles.trustRow}><Ionicons name="shield-checkmark-outline" size={18} color={styles.trustText.color} /><Text style={styles.trustText}>Private by design · Built for real connection</Text></View><PrimaryButton title="Get started" onPress={onStart} styles={styles} /></View></View></View>;
}

function PhoneEntry({ phone, setPhone, onBack, onContinue, busy, styles, insets }: any) {
  return <FormShell title="Start with your number" subtitle="We’ll send a one-time code. No passwords, no noise." onBack={onBack} styles={styles} insets={insets}><Text style={styles.inputLabel}>Mobile number</Text><TextInput testID="phone-input" autoFocus keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" placeholderTextColor={styles.placeholder.color} style={styles.input} /><PrimaryButton testID="send-otp" title={busy ? "Sending…" : "Send code"} onPress={onContinue} disabled={busy} styles={styles} /></FormShell>;
}

function OtpEntry({ phone, code, setCode, demoCode, onBack, onContinue, busy, styles, insets }: any) {
  return <FormShell title="Check your messages" subtitle={`Enter the code sent to ${phone || "your number"}.`} onBack={onBack} styles={styles} insets={insets}><Text style={styles.inputLabel}>Verification code</Text><TextInput testID="otp-input" autoFocus keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} placeholder="123456" placeholderTextColor={styles.placeholder.color} style={[styles.input, styles.codeInput]} /><Text style={styles.helper}>{demoCode ? `Demo code: ${demoCode}` : "The code expires in 5 minutes."}</Text><PrimaryButton testID="verify-otp" title={busy ? "Checking…" : "Continue"} onPress={onContinue} disabled={busy} styles={styles} /></FormShell>;
}

function Permissions({ onContinue, busy, config, styles, insets }: any) {
  return <FormShell title="Set your comfort level" subtitle="A few permissions help us keep discovery relevant and conversations timely." onBack={undefined} styles={styles} insets={insets}><PermissionRow icon="location-outline" title="Your location" detail={config.permissions.locationRequired ? "Required to show people nearby" : "Used only when you choose nearby discovery"} styles={styles} /><PermissionRow icon="notifications-outline" title="Notifications" detail="Know when someone likes you or sends a message" styles={styles} /><View style={styles.permissionNote}><Ionicons name="lock-closed-outline" size={16} color={styles.noteText.color} /><Text style={styles.noteText}>You stay in control. Change these anytime in Settings.</Text></View><PrimaryButton title={busy ? "Setting up…" : "Allow and continue"} onPress={onContinue} disabled={busy} styles={styles} /></FormShell>;
}

function ProfileSetup({ config, displayName, setDisplayName, bio, setBio, interests, setInterests, onContinue, busy, styles, insets }: any) {
  return <FormShell title="Make it feel like you" subtitle="A thoughtful profile gets better conversations." onBack={undefined} styles={styles} insets={insets}><Text style={styles.inputLabel}>Display name</Text><TextInput testID="display-name-input" value={displayName} onChangeText={setDisplayName} placeholder="What should people call you?" placeholderTextColor={styles.placeholder.color} style={styles.input} /><Text style={styles.inputLabel}>A little about you</Text><TextInput testID="bio-input" value={bio} onChangeText={setBio} placeholder="Coffee, music, a great Sunday…" placeholderTextColor={styles.placeholder.color} style={[styles.input, styles.bioInput]} multiline /><Text style={styles.inputLabel}>Your energy</Text><View style={styles.choiceWrap}>{config.interests.map((interest: string) => <Pressable testID={`interest-${interest.toLowerCase()}`} key={interest} onPress={() => setInterests((current: string[]) => current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest])} style={[styles.choice, interests.includes(interest) && styles.choiceSelected]}><Text style={[styles.choiceText, interests.includes(interest) && styles.choiceTextSelected]}>{interest}</Text></Pressable>)}</View><PrimaryButton testID="save-profile" title={busy ? "Saving…" : "Enter Punch Desk"} onPress={onContinue} disabled={busy} styles={styles} /></FormShell>;
}

function FormShell({ title, subtitle, onBack, children, styles, insets }: any) {
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}><ScrollView contentContainerStyle={[styles.form, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled"><View style={styles.formHeader}><Pressable onPress={onBack} disabled={!onBack} style={[styles.backButton, !onBack && styles.hidden]}><Ionicons name="arrow-back" size={22} color={styles.backIcon.color} /></Pressable><BrandMark compact /></View><Text style={styles.formTitle}>{title}</Text><Text style={styles.formSubtitle}>{subtitle}</Text><View style={styles.formFields}>{children}</View></ScrollView></KeyboardAvoidingView>;
}

function Discover({ profiles, cardIndex, radius, onPass, onLike, onReload, styles }: any) {
  const profile = profiles[cardIndex];
  return <View style={styles.flex}><View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>NEARBY, FOR REAL</Text><Text style={styles.sectionTitle}>Discover your next hello.</Text></View><View testID="radius-pill" style={styles.radiusPill}><Ionicons name="navigate-outline" size={14} color={styles.radiusText.color} /><Text style={styles.radiusText}>{radius} km</Text></View></View>{profile ? <ProfileCard profile={profile} index={cardIndex} onPass={onPass} onLike={onLike} /> : <EmptyState onReload={onReload} styles={styles} />}</View>;
}

function Likes({ styles }: any) {
  return <View style={styles.emptyPage}><View style={styles.emptyIcon}><Ionicons name="heart-outline" size={30} color={styles.emptyIconColor.color} /></View><Text style={styles.sectionTitle}>Your likes live here.</Text><Text style={styles.emptyCopy}>When a connection feels right, you’ll find it here. Take your time.</Text></View>;
}

function ProfileHome({ displayName, locationGranted, styles }: any) {
  return <ScrollView contentContainerStyle={styles.profilePage}><Text style={styles.eyebrow}>YOUR SPACE</Text><Text style={styles.sectionTitle}>{displayName}</Text><View style={styles.profileHero}><View style={styles.avatar}><Ionicons name="person" size={34} color={styles.avatarIcon.color} /></View><View><Text style={styles.profileHeroTitle}>Your profile is live</Text><Text style={styles.profileHeroCopy}>{locationGranted ? "Nearby discovery is ready." : "Add location to improve nearby discovery."}</Text></View></View><SettingsRow icon="shield-checkmark-outline" title="Privacy & safety" detail="Control what you share" styles={styles} /><SettingsRow icon="diamond-outline" title="Premium membership" detail="Unlock more intentional discovery" styles={styles} /><SettingsRow icon="help-circle-outline" title="Support" detail="We’re here when you need us" styles={styles} /></ScrollView>;
}

function EmptyState({ onReload, styles }: any) { return <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="sparkles-outline" size={30} color={styles.emptyIconColor.color} /></View><Text style={styles.emptyTitle}>That’s everyone for now.</Text><Text style={styles.emptyCopy}>Try widening your radius later. We’ll keep the best nearby people at the top.</Text><Pressable onPress={onReload} style={styles.secondaryButton}><Text style={styles.secondaryText}>Refresh discovery</Text></Pressable></View>; }
function PermissionRow({ icon, title, detail, styles }: any) { return <View style={styles.permissionRow}><View style={styles.permissionIcon}><Ionicons name={icon} size={22} color={styles.permissionIconColor.color} /></View><View style={styles.permissionCopy}><Text style={styles.permissionTitle}>{title}</Text><Text style={styles.permissionDetail}>{detail}</Text></View><Ionicons name="chevron-forward" size={18} color={styles.chevron.color} /></View>; }
function SettingsRow({ icon, title, detail, styles }: any) { return <View style={styles.settingsRow}><Ionicons name={icon} size={22} color={styles.settingsIcon.color} /><View style={styles.settingsCopy}><Text style={styles.settingsTitle}>{title}</Text><Text style={styles.settingsDetail}>{detail}</Text></View><Ionicons name="chevron-forward" size={18} color={styles.chevron.color} /></View>; }
function TabButton({ label, icon, active, onPress, styles }: any) { return <Pressable testID={`tab-${label.toLowerCase()}`} onPress={onPress} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}><Ionicons name={icon} size={22} color={active ? styles.tabActive.color : styles.tabInactive.color} /><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text></Pressable>; }
function PrimaryButton({ title, onPress, disabled, styles, testID }: any) { return <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, (pressed || disabled) && styles.buttonPressed]}><Text style={styles.primaryText}>{title}</Text>{disabled ? <ActivityIndicator size="small" color={styles.primaryText.color} /> : null}</Pressable>; }

const useStyles = makeStyles((colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface }, flex: { flex: 1 }, welcome: { flex: 1, justifyContent: "space-between", paddingHorizontal: 24 }, heroOrb: { width: 176, height: 176, borderRadius: 88, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 62, marginBottom: 42, borderWidth: 1, borderColor: colors.brandSecondary }, heroHeart: { color: colors.brandPrimary }, eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 2.2 }, heroTitle: { color: colors.onSurface, fontSize: 52, lineHeight: 52, fontWeight: "800", letterSpacing: -2.5, marginTop: 14 }, heroCopy: { color: colors.onSurfaceTertiary, fontSize: 17, lineHeight: 25, marginTop: 16, maxWidth: 310 }, trustRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }, trustText: { color: colors.muted, fontSize: 12 }, form: { flexGrow: 1, paddingHorizontal: 24 }, formHeader: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 12 }, backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }, backIcon: { color: colors.onSurface }, hidden: { opacity: 0 }, formTitle: { color: colors.onSurface, fontSize: 34, lineHeight: 39, fontWeight: "800", letterSpacing: -1.2, marginTop: 42 }, formSubtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 12, maxWidth: 330 }, formFields: { marginTop: 42 }, inputLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700", marginBottom: 9, marginTop: 18 }, input: { height: 56, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, paddingHorizontal: 16, fontSize: 16 }, codeInput: { letterSpacing: 8, fontSize: 22, fontWeight: "700" }, bioInput: { height: 110, paddingTop: 16, textAlignVertical: "top" }, placeholder: { color: colors.muted }, helper: { color: colors.brandPrimary, fontSize: 13, marginTop: 12 }, primaryButton: { minHeight: 56, borderRadius: 18, backgroundColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 28 }, primaryText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "800" }, buttonPressed: { opacity: 0.72 }, permissionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 14 }, permissionIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary }, permissionIconColor: { color: colors.brandPrimary }, permissionCopy: { flex: 1 }, permissionTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" }, permissionDetail: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 }, chevron: { color: colors.muted }, permissionNote: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 24 }, noteText: { color: colors.muted, fontSize: 12, flex: 1 }, choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surfaceSecondary }, choiceSelected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }, choiceText: { color: colors.onSurfaceSecondary, fontSize: 13 }, choiceTextSelected: { color: colors.onBrandTertiary, fontWeight: "700" }, appContent: { flex: 1, paddingHorizontal: 18 }, topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }, iconButton: { minWidth: 44, minHeight: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }, toast: { position: "absolute", zIndex: 10, top: 78, left: 18, right: 18, padding: 13, borderRadius: 14, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.borderStrong, flexDirection: "row", alignItems: "center", gap: 8 }, toastText: { flex: 1, color: colors.onSurface, fontSize: 13 }, sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }, sectionTitle: { color: colors.onSurface, fontSize: 27, fontWeight: "800", letterSpacing: -0.9, marginTop: 6 }, radiusPill: { flexDirection: "row", gap: 5, alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border }, radiusText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700" }, emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 26 }, emptyPage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }, emptyIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 20 }, emptyIconColor: { color: colors.brandPrimary }, emptyTitle: { color: colors.onSurface, fontSize: 23, fontWeight: "800", textAlign: "center" }, emptyCopy: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 10 }, secondaryButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center", marginTop: 22 }, secondaryText: { color: colors.onSurface, fontWeight: "700" }, tabBar: { flexDirection: "row", justifyContent: "space-around", borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary, paddingTop: 10 }, tabButton: { minWidth: 76, minHeight: 50, alignItems: "center", gap: 4 }, tabActive: { color: colors.brandPrimary }, tabInactive: { color: colors.muted }, tabLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" }, tabLabelActive: { color: colors.brandPrimary }, pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] }, profilePage: { paddingBottom: 28 }, profileHero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: 22, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginTop: 24, marginBottom: 18 }, avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }, avatarIcon: { color: colors.brandPrimary }, profileHeroTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" }, profileHeroCopy: { color: colors.muted, fontSize: 13, marginTop: 5 }, settingsRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: colors.divider }, settingsIcon: { color: colors.brandPrimary }, settingsCopy: { flex: 1 }, settingsTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700" }, settingsDetail: { color: colors.muted, fontSize: 12, marginTop: 4 },
}));