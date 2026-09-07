import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { useChatSocket } from "@/src/hooks/use-chat-socket";
import { makeStyles, useTheme } from "@/src/theme";
import type { AppConfig, Conversation, Match, Profile } from "@/src/types";

type Screen = "welcome" | "phone" | "otp" | "permissions" | "setup" | "app";
type Tab = "discover" | "messages" | "profile";

type ModerationTarget = { id: string; name: string } | null;

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
  reportCategories: ["Spam", "Harassment", "Fake profile", "Inappropriate content", "Scam"],
  supportCategories: ["Account", "Billing", "Safety", "Bug"],
  location: { required: true, minRadius: 5, defaultRadius: 25, maxRadius: 50 },
  permissions: { locationRequired: true, notificationsRequired: false },
  features: { chat: true, subscriptions: true, matching: true, photoRequests: true, support: true },
};

export default function Index() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
  const [profilePhotos, setProfilePhotos] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [permissionState, setPermissionState] = useState({ location: false, notifications: false });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [moreOpen, setMoreOpen] = useState<ModerationTarget>(null);
  const [reportOpen, setReportOpen] = useState<ModerationTarget>(null);
  const [reportCategory, setReportCategory] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [matchCelebration, setMatchCelebration] = useState<{
    conversationId: string;
    name: string;
    summary: string;
  } | null>(null);

  const socket = useChatSocket({
    onEvent: (event) => {
      if (event.type === "message") {
        setConversations((current) => {
          const target = current.find((c) => c.id === event.conversationId);
          if (!target) {
            api.conversations().then((data) => setConversations(data.conversations)).catch(() => undefined);
            return current;
          }
          const isFromMe = event.message.senderId === target.otherUserId ? false : true;
          return current
            .map((c) =>
              c.id === event.conversationId
                ? {
                    ...c,
                    lastMessage: event.message.body,
                    lastMessageAt: event.message.createdAt,
                    unreadCount: isFromMe ? c.unreadCount : c.unreadCount + 1,
                  }
                : c
            )
            .sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""));
        });
      }
    },
  });

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(fallbackConfig));
  }, []);

  const showMessage = (value: string) => {
    setMessage(value);
    setTimeout(() => setMessage(""), 2600);
  };

  const loadDiscover = useCallback(async () => {
    try {
      const result = await api.discovery();
      setProfiles(result.profiles);
      setCardIndex(0);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Discovery is taking a moment.");
    }
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      const [conv, match] = await Promise.all([api.conversations(), api.matches()]);
      setConversations(conv.conversations);
      setMatches(match.matches);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (screen === "app" && tab === "messages") loadMessages();
  }, [screen, tab, loadMessages]);

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
      await api.verifyOtp(phone, code);
      registerNativePushToken().catch(() => undefined);
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
      let locationGranted = false;
      if (Platform.OS !== "web" && config.permissions.locationRequired) {
        const location = await Location.requestForegroundPermissionsAsync();
        locationGranted = location.status === "granted";
        setPermissionState((current) => ({ ...current, location: locationGranted }));
        if (locationGranted) {
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          await api.updateLocation(current.coords.latitude, current.coords.longitude);
        }
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
      const saved = (await api.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        interests,
      })) as { photos?: ({ dataUrl: string } | string)[] };
      if (Array.isArray(saved.photos)) {
        const list = saved.photos
          .map((entry) => (typeof entry === "string" ? entry : entry.dataUrl))
          .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
        setProfilePhotos(list);
      }
      await loadDiscover();
      setScreen("app");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "We could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddPhoto = async () => {
    if (busy || profilePhotos.length >= 6) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return showMessage("Photo access is needed to add a profile photo.");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset?.base64) return;
    setBusy(true);
    try {
      const mime = asset.mimeType ?? "image/jpeg";
      const uploaded = await api.uploadPhoto(`data:${mime};base64,${asset.base64}`);
      setProfilePhotos((current) => [...current, uploaded.dataUrl]);
      showMessage("Photo added to your profile.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "We could not upload that photo.");
    } finally {
      setBusy(false);
    }
  };

  const advanceCard = async (action: "like" | "pass") => {
    const profile = profiles[cardIndex];
    if (!profile) return;
    try {
      const result =
        action === "like" ? await api.like(profile.id) : await api.pass(profile.id);
      if (action === "like" && result.matched && result.conversationId) {
        setMatchCelebration({
          conversationId: result.conversationId,
          name: profile.displayName,
          summary: result.explanation?.summary ?? "You both chose to connect.",
        });
      }
    } catch {
      showMessage("Your choice will retry when you’re back online.");
    }
    setCardIndex((current) => current + 1);
  };

  const openChat = useCallback(
    (conversationId: string, name: string) => {
      router.push({ pathname: "/chat/[id]", params: { id: conversationId, name } });
    },
    [router]
  );

  const requestPhotos = async (targetId: string, name: string) => {
    try {
      await api.requestPhoto(targetId);
      showMessage(`Photo request sent to ${name}.`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not send request.");
    }
  };

  const blockUser = async (targetId: string, name: string) => {
    try {
      await api.block(targetId);
      setProfiles((current) => current.filter((p) => p.id !== targetId));
      showMessage(`${name} blocked.`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not block user.");
    }
  };

  const submitReport = async () => {
    if (!reportOpen || !reportCategory) return;
    try {
      await api.report(reportOpen.id, reportCategory, reportDescription.trim() || undefined);
      showMessage("Report submitted. Our team will review it.");
      setReportOpen(null);
      setReportCategory("");
      setReportDescription("");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not submit report.");
    }
  };

  const currentProfile = profiles[cardIndex];

  if (screen === "welcome")
    return <Welcome config={config} onStart={() => setScreen("phone")} styles={styles} insets={insets} />;
  if (screen === "phone")
    return (
      <PhoneEntry
        phone={phone}
        setPhone={setPhone}
        onBack={() => setScreen("welcome")}
        onContinue={handleRequestOtp}
        busy={busy}
        styles={styles}
        insets={insets}
      />
    );
  if (screen === "otp")
    return (
      <OtpEntry
        phone={phone}
        code={code}
        setCode={setCode}
        demoCode={demoCode}
        onBack={() => setScreen("phone")}
        onContinue={handleVerify}
        busy={busy}
        styles={styles}
        insets={insets}
      />
    );
  if (screen === "permissions")
    return (
      <Permissions
        onContinue={handlePermissions}
        busy={busy}
        config={config}
        styles={styles}
        insets={insets}
      />
    );
  if (screen === "setup")
    return (
      <ProfileSetup
        config={config}
        displayName={displayName}
        setDisplayName={setDisplayName}
        bio={bio}
        setBio={setBio}
        interests={interests}
        setInterests={setInterests}
        onContinue={handleSaveProfile}
        busy={busy}
        styles={styles}
        insets={insets}
      />
    );

  return (
    <View style={styles.root}>
      <View style={[styles.appContent, { paddingTop: insets.top + 18 }]}>
        <View style={styles.topBar}>
          <BrandMark compact />
          <View style={styles.topBarRight}>
            {socket.reconnecting ? <Text style={styles.reconnecting}>Reconnecting…</Text> : null}
            <Pressable
              testID="btn-settings"
              onPress={() => router.push("/support")}
              style={styles.iconButton}
              accessibilityLabel="Open support"
            >
              <Ionicons name="help-circle-outline" size={22} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>
        {message ? (
          <View style={styles.toast}>
            <Ionicons name="sparkles-outline" size={16} color={colors.brandPrimary} />
            <Text style={styles.toastText}>{message}</Text>
          </View>
        ) : null}
        {tab === "discover" ? (
          <Discover
            profile={currentProfile}
            radius={config.location.defaultRadius}
            onPass={() => advanceCard("pass")}
            onLike={() => advanceCard("like")}
            onReload={loadDiscover}
            onMore={() =>
              currentProfile &&
              setMoreOpen({ id: currentProfile.id, name: currentProfile.displayName })
            }
            styles={styles}
          />
        ) : null}
        {tab === "messages" ? (
          <Messages
            matches={matches}
            conversations={conversations}
            onOpenChat={openChat}
            styles={styles}
          />
        ) : null}
        {tab === "profile" ? (
          <ProfileHome
            displayName={displayName || "Your profile"}
            locationGranted={permissionState.location}
            photos={profilePhotos}
            onAddPhoto={handleAddPhoto}
            busy={busy}
            onSupport={() => router.push("/support")}
            styles={styles}
          />
        ) : null}
      </View>
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TabButton label="Discover" icon="compass-outline" active={tab === "discover"} onPress={() => setTab("discover")} styles={styles} />
        <TabButton label="Messages" icon="chatbubbles-outline" active={tab === "messages"} onPress={() => setTab("messages")} styles={styles} />
        <TabButton label="Profile" icon="person-outline" active={tab === "profile"} onPress={() => setTab("profile")} styles={styles} />
      </View>

      {/* More menu bottom sheet */}
      <Modal visible={!!moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMoreOpen(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{moreOpen?.name}</Text>
            {config.features?.photoRequests ? (
              <SheetAction
                testID="action-request-photos"
                icon="images-outline"
                title="Request photos"
                subtitle="Ask to see private photos"
                onPress={() => {
                  if (moreOpen) requestPhotos(moreOpen.id, moreOpen.name);
                  setMoreOpen(null);
                }}
                styles={styles}
              />
            ) : null}
            {config.features?.reports ? (
              <SheetAction
                testID="action-report"
                icon="flag-outline"
                title="Report"
                subtitle="Tell us what went wrong"
                onPress={() => {
                  setReportOpen(moreOpen);
                  setMoreOpen(null);
                }}
                styles={styles}
              />
            ) : null}
            <SheetAction
              testID="action-block"
              icon="ban-outline"
              title="Block"
              subtitle="You will no longer see each other"
              onPress={() => {
                if (moreOpen) blockUser(moreOpen.id, moreOpen.name);
                setMoreOpen(null);
              }}
              styles={styles}
              danger
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report modal */}
      <Modal visible={!!reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetBackdrop}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Report {reportOpen?.name}</Text>
            <Text style={styles.sheetSubtitle}>Choose a reason.</Text>
            <View style={styles.choiceWrap}>
              {(config.reportCategories ?? []).map((cat) => (
                <Pressable
                  key={cat}
                  testID={`report-cat-${cat.toLowerCase().replace(/\s/g, "-")}`}
                  onPress={() => setReportCategory(cat)}
                  style={[styles.choice, reportCategory === cat && styles.choiceSelected]}
                >
                  <Text style={[styles.choiceText, reportCategory === cat && styles.choiceTextSelected]}>{cat}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              testID="report-description"
              value={reportDescription}
              onChangeText={setReportDescription}
              placeholder="Anything else we should know? (optional)"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.bioInput]}
              multiline
            />
            <View style={styles.sheetActionRow}>
              <Pressable
                testID="report-cancel"
                onPress={() => setReportOpen(null)}
                style={[styles.secondaryButton, styles.sheetActionButton]}
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="report-submit"
                onPress={submitReport}
                disabled={!reportCategory}
                style={[styles.primaryButton, styles.sheetActionButton, !reportCategory && styles.buttonPressed]}
              >
                <Text style={styles.primaryText}>Submit</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Match celebration */}
      <Modal visible={!!matchCelebration} transparent animationType="fade" onRequestClose={() => setMatchCelebration(null)}>
        <View style={styles.matchBackdrop}>
          <View style={styles.matchCard}>
            <View style={styles.heroOrb}>
              <Ionicons name="heart" size={64} color={colors.brandPrimary} />
            </View>
            <Text style={styles.eyebrow}>IT&apos;S A MATCH</Text>
            <Text style={styles.matchTitle}>You and {matchCelebration?.name}</Text>
            <Text style={styles.matchSummary}>{matchCelebration?.summary}</Text>
            <Pressable
              testID="match-open-chat"
              style={styles.primaryButton}
              onPress={() => {
                const target = matchCelebration;
                setMatchCelebration(null);
                if (target) openChat(target.conversationId, target.name);
              }}
            >
              <Text style={styles.primaryText}>Say hello</Text>
            </Pressable>
            <Pressable testID="match-close" onPress={() => setMatchCelebration(null)}>
              <Text style={styles.matchLater}>Later</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Welcome({ config, onStart, styles, insets }: any) {
  return (
    <View style={styles.root}>
      <View style={[styles.welcome, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 20 }]}>
        <View>
          <BrandMark />
          <View style={styles.heroOrb}>
            <Ionicons name="heart" size={72} color={styles.heroHeart.color} />
          </View>
          <Text style={styles.eyebrow}>A MORE INTENTIONAL WAY TO MEET</Text>
          <Text style={styles.heroTitle}>Closer feels{`\n`}better.</Text>
          <Text style={styles.heroCopy}>{config.tagline}</Text>
        </View>
        <View>
          <View style={styles.trustRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={styles.trustText.color} />
            <Text style={styles.trustText}>Private by design · Built for real connection</Text>
          </View>
          <PrimaryButton testID="btn-get-started" title="Get started" onPress={onStart} styles={styles} />
        </View>
      </View>
    </View>
  );
}

function PhoneEntry({ phone, setPhone, onBack, onContinue, busy, styles, insets }: any) {
  return (
    <FormShell title="Start with your number" subtitle="We’ll send a one-time code. No passwords, no noise." onBack={onBack} styles={styles} insets={insets}>
      <Text style={styles.inputLabel}>Mobile number</Text>
      <TextInput
        testID="phone-input"
        autoFocus
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 98765 43210"
        placeholderTextColor={styles.placeholder.color}
        style={styles.input}
      />
      <PrimaryButton testID="send-otp" title={busy ? "Sending…" : "Send code"} onPress={onContinue} disabled={busy} styles={styles} />
    </FormShell>
  );
}

function OtpEntry({ phone, code, setCode, demoCode, onBack, onContinue, busy, styles, insets }: any) {
  return (
    <FormShell title="Check your messages" subtitle={`Enter the code sent to ${phone || "your number"}.`} onBack={onBack} styles={styles} insets={insets}>
      <Text style={styles.inputLabel}>Verification code</Text>
      <TextInput
        testID="otp-input"
        autoFocus
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        placeholderTextColor={styles.placeholder.color}
        style={[styles.input, styles.codeInput]}
      />
      <Text style={styles.helper}>{demoCode ? `Demo code: ${demoCode}` : "The code expires in 5 minutes."}</Text>
      <PrimaryButton testID="verify-otp" title={busy ? "Checking…" : "Continue"} onPress={onContinue} disabled={busy} styles={styles} />
    </FormShell>
  );
}

function Permissions({ onContinue, busy, config, styles, insets }: any) {
  return (
    <FormShell title="Set your comfort level" subtitle="A few permissions help us keep discovery relevant and conversations timely." onBack={undefined} styles={styles} insets={insets}>
      <PermissionRow icon="location-outline" title="Your location" detail={config.permissions.locationRequired ? "Required to show people nearby" : "Used only when you choose nearby discovery"} styles={styles} />
      <PermissionRow icon="notifications-outline" title="Notifications" detail="Know when someone likes you or sends a message" styles={styles} />
      <View style={styles.permissionNote}>
        <Ionicons name="lock-closed-outline" size={16} color={styles.noteText.color} />
        <Text style={styles.noteText}>You stay in control. Change these anytime in Settings.</Text>
      </View>
      <PrimaryButton testID="btn-permissions-continue" title={busy ? "Setting up…" : "Allow and continue"} onPress={onContinue} disabled={busy} styles={styles} />
    </FormShell>
  );
}

function ProfileSetup({ config, displayName, setDisplayName, bio, setBio, interests, setInterests, onContinue, busy, styles, insets }: any) {
  return (
    <FormShell title="Make it feel like you" subtitle="A thoughtful profile gets better conversations." onBack={undefined} styles={styles} insets={insets}>
      <Text style={styles.inputLabel}>Display name</Text>
      <TextInput
        testID="display-name-input"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="What should people call you?"
        placeholderTextColor={styles.placeholder.color}
        style={styles.input}
      />
      <Text style={styles.inputLabel}>A little about you</Text>
      <TextInput
        testID="bio-input"
        value={bio}
        onChangeText={setBio}
        placeholder="Coffee, music, a great Sunday…"
        placeholderTextColor={styles.placeholder.color}
        style={[styles.input, styles.bioInput]}
        multiline
      />
      <Text style={styles.inputLabel}>Your energy</Text>
      <View style={styles.choiceWrap}>
        {config.interests.map((interest: string) => (
          <Pressable
            testID={`interest-${interest.toLowerCase()}`}
            key={interest}
            onPress={() =>
              setInterests((current: string[]) =>
                current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest]
              )
            }
            style={[styles.choice, interests.includes(interest) && styles.choiceSelected]}
          >
            <Text style={[styles.choiceText, interests.includes(interest) && styles.choiceTextSelected]}>{interest}</Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton testID="save-profile" title={busy ? "Saving…" : "Enter Punch Desk"} onPress={onContinue} disabled={busy} styles={styles} />
    </FormShell>
  );
}

function FormShell({ title, subtitle, onBack, children, styles, insets }: any) {
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        contentContainerStyle={[styles.form, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formHeader}>
          <Pressable onPress={onBack} disabled={!onBack} style={[styles.backButton, !onBack && styles.hidden]}>
            <Ionicons name="arrow-back" size={22} color={styles.backIcon.color} />
          </Pressable>
          <BrandMark compact />
        </View>
        <Text style={styles.formTitle}>{title}</Text>
        <Text style={styles.formSubtitle}>{subtitle}</Text>
        <View style={styles.formFields}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Discover({ profile, radius, onPass, onLike, onReload, onMore, styles }: any) {
  return (
    <View style={styles.flex}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.eyebrow}>NEARBY, FOR REAL</Text>
          <Text style={styles.sectionTitle}>Discover your next hello.</Text>
        </View>
        <View style={styles.headerActions}>
          <View testID="radius-pill" style={styles.radiusPill}>
            <Ionicons name="navigate-outline" size={14} color={styles.radiusText.color} />
            <Text style={styles.radiusText}>{radius} km</Text>
          </View>
          {profile ? (
            <Pressable testID="btn-more" onPress={onMore} style={styles.iconButtonSmall} accessibilityLabel="More actions">
              <Ionicons name="ellipsis-horizontal" size={18} color={styles.radiusText.color} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {profile ? (
        <ProfileCard profile={profile} index={0} onPass={onPass} onLike={onLike} />
      ) : (
        <EmptyState onReload={onReload} styles={styles} />
      )}
    </View>
  );
}

function Messages({ matches, conversations, onOpenChat, styles }: any) {
  const active = matches.filter((match: Match) => !conversations.some((c: Conversation) => c.id === match.conversationId));
  return (
    <ScrollView contentContainerStyle={styles.messagesContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>YOUR MATCHES</Text>
      <Text style={styles.sectionTitle}>Say hello.</Text>
      {matches.length === 0 ? (
        <Text style={styles.emptyCopy}>Matches will appear here when someone likes you back.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.matchStrip}>
          {matches.map((match: Match) => (
            <Pressable
              key={match.id}
              testID={`match-${match.id}`}
              onPress={() => match.conversationId && onOpenChat(match.conversationId, match.other.displayName)}
              style={styles.matchTile}
            >
              <View style={styles.matchAvatar}>
                {match.other.photos?.[0] ? (
                  <Image source={{ uri: match.other.photos[0] }} contentFit="cover" style={StyleSheet.absoluteFillObject} />
                ) : (
                  <Text style={styles.matchInitial}>{match.other.displayName.charAt(0)}</Text>
                )}
              </View>
              <Text style={styles.matchName} numberOfLines={1}>{match.other.displayName}</Text>
              {active.some((m: Match) => m.id === match.id) ? <View style={styles.matchDot} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Text style={[styles.eyebrow, { marginTop: 24 }]}>CONVERSATIONS</Text>
      {conversations.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Ionicons name="chatbubbles-outline" size={26} color={styles.emptyIconColor.color} />
          <Text style={styles.emptyBlockTitle}>No messages yet</Text>
          <Text style={styles.emptyCopy}>When you match, start the conversation from here.</Text>
        </View>
      ) : (
        conversations.map((conversation: Conversation) => (
          <Pressable
            key={conversation.id}
            testID={`conversation-${conversation.id}`}
            onPress={() => onOpenChat(conversation.id, conversation.other.displayName)}
            style={styles.conversationRow}
          >
            <View style={styles.matchAvatarSmall}>
              {conversation.other.photos?.[0] ? (
                <Image source={{ uri: conversation.other.photos[0] }} contentFit="cover" style={StyleSheet.absoluteFillObject} />
              ) : (
                <Text style={styles.matchInitialSmall}>{conversation.other.displayName.charAt(0)}</Text>
              )}
            </View>
            <View style={styles.conversationBody}>
              <Text style={styles.conversationName}>{conversation.other.displayName}</Text>
              <Text style={styles.conversationPreview} numberOfLines={1}>
                {conversation.lastMessage || "Say hello"}
              </Text>
            </View>
            {conversation.unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{conversation.unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function ProfileHome({ displayName, locationGranted, photos, onAddPhoto, busy, onSupport, styles }: any) {
  return (
    <ScrollView contentContainerStyle={styles.profilePage}>
      <Text style={styles.eyebrow}>YOUR SPACE</Text>
      <Text style={styles.sectionTitle}>{displayName}</Text>
      <View style={styles.profileHero}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={34} color={styles.avatarIcon.color} />
        </View>
        <View>
          <Text style={styles.profileHeroTitle}>Your profile is live</Text>
          <Text style={styles.profileHeroCopy}>
            {locationGranted ? "Nearby discovery is ready." : "Add location to improve nearby discovery."}
          </Text>
        </View>
      </View>
      <View style={styles.photoSection}>
        <View style={styles.photoHeader}>
          <View>
            <Text style={styles.settingsTitle}>Profile photos</Text>
            <Text style={styles.settingsDetail}>Private by default until you choose to share.</Text>
          </View>
          <Pressable testID="add-photo" accessibilityRole="button" onPress={onAddPhoto} disabled={busy} style={styles.photoAdd}>
            <Ionicons name="add" size={18} color={styles.photoAddText.color} />
            <Text style={styles.photoAddText}>{busy ? "…" : "Add"}</Text>
          </Pressable>
        </View>
        <View style={styles.photoRow}>
          {photos.map((photo: string, index: number) => (
            <Image key={`${photo.slice(0, 12)}-${index}`} source={{ uri: photo }} contentFit="cover" style={styles.photoTile} />
          ))}
          {photos.length === 0 ? (
            <Pressable testID="empty-photo" onPress={onAddPhoto} style={styles.photoEmpty}>
              <Ionicons name="images-outline" size={24} color={styles.photoEmptyIcon.color} />
              <Text style={styles.photoEmptyText}>Add your first photo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <SettingsRow icon="shield-checkmark-outline" title="Privacy & safety" detail="Control what you share" styles={styles} />
      <SettingsRow icon="diamond-outline" title="Premium membership" detail="Unlock more intentional discovery" styles={styles} />
      <Pressable testID="settings-support" onPress={onSupport}>
        <SettingsRow icon="help-circle-outline" title="Support" detail="We&apos;re here when you need us" styles={styles} />
      </Pressable>
    </ScrollView>
  );
}

function EmptyState({ onReload, styles }: any) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="sparkles-outline" size={30} color={styles.emptyIconColor.color} />
      </View>
      <Text style={styles.emptyTitle}>That&apos;s everyone for now.</Text>
      <Text style={styles.emptyCopy}>Try widening your radius later. We&apos;ll keep the best nearby people at the top.</Text>
      <Pressable onPress={onReload} style={styles.secondaryButton}>
        <Text style={styles.secondaryText}>Refresh discovery</Text>
      </Pressable>
    </View>
  );
}
function PermissionRow({ icon, title, detail, styles }: any) {
  return (
    <View style={styles.permissionRow}>
      <View style={styles.permissionIcon}><Ionicons name={icon} size={22} color={styles.permissionIconColor.color} /></View>
      <View style={styles.permissionCopy}>
        <Text style={styles.permissionTitle}>{title}</Text>
        <Text style={styles.permissionDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={styles.chevron.color} />
    </View>
  );
}
function SettingsRow({ icon, title, detail, styles }: any) {
  return (
    <View style={styles.settingsRow}>
      <Ionicons name={icon} size={22} color={styles.settingsIcon.color} />
      <View style={styles.settingsCopy}>
        <Text style={styles.settingsTitle}>{title}</Text>
        <Text style={styles.settingsDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={styles.chevron.color} />
    </View>
  );
}
function TabButton({ label, icon, active, onPress, styles }: any) {
  return (
    <Pressable testID={`tab-${label.toLowerCase()}`} onPress={onPress} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={active ? styles.tabActive.color : styles.tabInactive.color} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}
function PrimaryButton({ title, onPress, disabled, styles, testID }: any) {
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, (pressed || disabled) && styles.buttonPressed]}>
      <Text style={styles.primaryText}>{title}</Text>
      {disabled ? <ActivityIndicator size="small" color={styles.primaryText.color} /> : null}
    </Pressable>
  );
}

function SheetAction({ icon, title, subtitle, onPress, styles, danger, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}>
      <View style={[styles.sheetActionIcon, danger && styles.sheetActionIconDanger]}>
        <Ionicons name={icon} size={20} color={styles.sheetActionIconColor.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sheetActionTitle}>{title}</Text>
        <Text style={styles.sheetActionSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    flex: { flex: 1 },
    welcome: { flex: 1, justifyContent: "space-between", paddingHorizontal: 24 },
    heroOrb: {
      width: 176,
      height: 176,
      borderRadius: 88,
      backgroundColor: colors.brandTertiary,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginTop: 62,
      marginBottom: 42,
      borderWidth: 1,
      borderColor: colors.brandSecondary,
    },
    heroHeart: { color: colors.brandPrimary },
    eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 2.2 },
    heroTitle: { color: colors.onSurface, fontSize: 52, lineHeight: 52, fontWeight: "800", letterSpacing: -2.5, marginTop: 14 },
    heroCopy: { color: colors.onSurfaceTertiary, fontSize: 17, lineHeight: 25, marginTop: 16, maxWidth: 310 },
    trustRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
    trustText: { color: colors.muted, fontSize: 12 },
    form: { flexGrow: 1, paddingHorizontal: 24 },
    formHeader: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 12 },
    backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
    backIcon: { color: colors.onSurface },
    hidden: { opacity: 0 },
    formTitle: { color: colors.onSurface, fontSize: 34, lineHeight: 39, fontWeight: "800", letterSpacing: -1.2, marginTop: 42 },
    formSubtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 12, maxWidth: 330 },
    formFields: { marginTop: 42 },
    inputLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700", marginBottom: 9, marginTop: 18 },
    input: {
      height: 56,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      color: colors.onSurface,
      paddingHorizontal: 16,
      fontSize: 16,
    },
    codeInput: { letterSpacing: 8, fontSize: 22, fontWeight: "700" },
    bioInput: { height: 110, paddingTop: 16, textAlignVertical: "top" },
    placeholder: { color: colors.muted },
    helper: { color: colors.brandPrimary, fontSize: 13, marginTop: 12 },
    primaryButton: {
      minHeight: 56,
      borderRadius: 18,
      backgroundColor: colors.brandPrimary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginTop: 28,
    },
    primaryText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "800" },
    buttonPressed: { opacity: 0.72 },
    permissionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 14 },
    permissionIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
    permissionIconColor: { color: colors.brandPrimary },
    permissionCopy: { flex: 1 },
    permissionTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
    permissionDetail: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
    chevron: { color: colors.muted },
    permissionNote: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 24 },
    noteText: { color: colors.muted, fontSize: 12, flex: 1 },
    choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surfaceSecondary },
    choiceSelected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
    choiceText: { color: colors.onSurfaceSecondary, fontSize: 13 },
    choiceTextSelected: { color: colors.onBrandTertiary, fontWeight: "700" },
    appContent: { flex: 1, paddingHorizontal: 18 },
    topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
    topBarRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    reconnecting: { color: colors.warning, fontSize: 12 },
    iconButton: { minWidth: 44, minHeight: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
    iconButtonSmall: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    toast: {
      position: "absolute",
      zIndex: 10,
      top: 78,
      left: 18,
      right: 18,
      padding: 13,
      borderRadius: 14,
      backgroundColor: colors.surfaceTertiary,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    toastText: { flex: 1, color: colors.onSurface, fontSize: 13 },
    sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 },
    sectionTitle: { color: colors.onSurface, fontSize: 27, fontWeight: "800", letterSpacing: -0.9, marginTop: 6 },
    radiusPill: { flexDirection: "row", gap: 5, alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
    radiusText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
    emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 26 },
    emptyBlock: { alignItems: "center", padding: 24, gap: 8 },
    emptyBlockTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: 8 },
    emptyIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 20 },
    emptyIconColor: { color: colors.brandPrimary },
    emptyTitle: { color: colors.onSurface, fontSize: 23, fontWeight: "800", textAlign: "center" },
    emptyCopy: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 10 },
    secondaryButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center", alignItems: "center", marginTop: 22 },
    secondaryText: { color: colors.onSurface, fontWeight: "700" },
    tabBar: { flexDirection: "row", justifyContent: "space-around", borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surfaceSecondary, paddingTop: 10 },
    tabButton: { minWidth: 76, minHeight: 50, alignItems: "center", gap: 4 },
    tabActive: { color: colors.brandPrimary },
    tabInactive: { color: colors.muted },
    tabLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
    tabLabelActive: { color: colors.brandPrimary },
    pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
    profilePage: { paddingBottom: 28 },
    profileHero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: 22, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginTop: 24, marginBottom: 18 },
    avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    avatarIcon: { color: colors.brandPrimary },
    profileHeroTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
    profileHeroCopy: { color: colors.muted, fontSize: 13, marginTop: 5 },
    photoSection: { padding: 16, borderRadius: 20, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginBottom: 18 },
    photoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    photoAdd: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.brandTertiary },
    photoAddText: { color: colors.onBrandTertiary, fontWeight: "800" },
    photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 16 },
    photoTile: { width: 72, height: 86, borderRadius: 14, backgroundColor: colors.surfaceTertiary },
    photoEmpty: { width: "100%", minHeight: 86, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 7 },
    photoEmptyIcon: { color: colors.brandPrimary },
    photoEmptyText: { color: colors.muted, fontSize: 12 },
    settingsRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
    settingsIcon: { color: colors.brandPrimary },
    settingsCopy: { flex: 1 },
    settingsTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
    settingsDetail: { color: colors.muted, fontSize: 12, marginTop: 4 },
    messagesContainer: { paddingBottom: 24 },
    matchStrip: { flexDirection: "row", gap: 14, marginTop: 12, paddingRight: 12 },
    matchTile: { width: 76, alignItems: "center", gap: 6 },
    matchAvatar: { width: 76, height: 90, borderRadius: 22, overflow: "hidden", backgroundColor: colors.surfaceTertiary, borderWidth: 2, borderColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
    matchAvatarSmall: { width: 52, height: 52, borderRadius: 26, overflow: "hidden", backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
    matchInitial: { color: colors.brandPrimary, fontSize: 24, fontWeight: "800" },
    matchInitialSmall: { color: colors.brandPrimary, fontSize: 18, fontWeight: "800" },
    matchName: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
    matchDot: { position: "absolute", top: 4, right: 4, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brandPrimary },
    conversationRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
    conversationBody: { flex: 1 },
    conversationName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
    conversationPreview: { color: colors.muted, fontSize: 13, marginTop: 3 },
    unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
    unreadBadgeText: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "800" },
    sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, gap: 10 },
    sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: 8 },
    sheetTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
    sheetSubtitle: { color: colors.muted, fontSize: 13 },
    sheetAction: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
    sheetActionIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    sheetActionIconDanger: { backgroundColor: colors.error, opacity: 0.9 },
    sheetActionIconColor: { color: colors.brandPrimary },
    sheetActionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
    sheetActionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
    sheetActionRow: { flexDirection: "row", gap: 12, marginTop: 12 },
    sheetActionButton: { flex: 1, marginTop: 0 },
    matchBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 24 },
    matchCard: { width: "100%", maxWidth: 360, padding: 28, borderRadius: 32, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brandSecondary, alignItems: "center", gap: 10 },
    matchTitle: { color: colors.onSurface, fontSize: 26, fontWeight: "800", textAlign: "center" },
    matchSummary: { color: colors.muted, fontSize: 14, textAlign: "center" },
    matchLater: { color: colors.muted, marginTop: 16, textDecorationLine: "underline" },
  })
);
