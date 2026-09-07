import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import type { AppConfig, SupportTicket } from "@/src/types";

export default function SupportScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api
      .config()
      .then((config: AppConfig) => {
        setCategories(config.supportCategories ?? ["Account", "Billing", "Safety", "Bug"]);
        if (config.supportCategories?.length) setCategory(config.supportCategories[0]);
      })
      .catch(() => setCategories(["Account", "Billing", "Safety", "Bug"]));
    api.supportList().then((data) => setTickets(data.tickets)).catch(() => undefined);
  }, []);

  const submit = async () => {
    if (!subject.trim() || !description.trim() || !category) {
      setMessage("Please fill category, subject and description.");
      return;
    }
    setBusy(true);
    try {
      const ticket = await api.supportCreate(category, subject.trim(), description.trim());
      setTickets((current) => [ticket, ...current]);
      setSubject("");
      setDescription("");
      setMessage("Ticket created. We will reply soon.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create ticket.");
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable testID="support-back" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Support</Text>
        <View style={styles.backButton} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>WE&apos;RE HERE FOR YOU</Text>
          <Text style={styles.title}>Create a ticket</Text>

          <Text style={styles.label}>Category</Text>
          <View style={styles.chipRow}>
            {categories.map((option) => (
              <Pressable
                key={option}
                testID={`support-category-${option.toLowerCase()}`}
                onPress={() => setCategory(option)}
                style={[styles.chip, category === option && styles.chipActive]}
              >
                <Text style={[styles.chipText, category === option && styles.chipTextActive]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Subject</Text>
          <TextInput
            testID="support-subject"
            value={subject}
            onChangeText={setSubject}
            style={styles.input}
            placeholder="Short summary"
            placeholderTextColor={colors.muted}
            maxLength={140}
          />

          <Text style={styles.label}>Describe the issue</Text>
          <TextInput
            testID="support-description"
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textarea]}
            placeholder="What happened and what were you trying to do?"
            placeholderTextColor={colors.muted}
            multiline
          />

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Pressable
            testID="support-submit"
            onPress={submit}
            disabled={busy}
            style={[styles.submit, busy && styles.submitDisabled]}
          >
            <Text style={styles.submitText}>{busy ? "Sending…" : "Send ticket"}</Text>
          </Pressable>

          <Text style={[styles.title, styles.historyTitle]}>Your tickets</Text>
          {tickets.length === 0 ? (
            <Text style={styles.empty}>No tickets yet.</Text>
          ) : (
            tickets.map((ticket) => (
              <View key={ticket.id} style={styles.ticketCard} testID={`ticket-${ticket.id}`}>
                <Text style={styles.ticketSubject}>{ticket.subject}</Text>
                <Text style={styles.ticketMeta}>
                  {ticket.category} · {ticket.status.replace("_", " ")}
                </Text>
                <Text style={styles.ticketDesc} numberOfLines={2}>
                  {ticket.description}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    flex: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
    },
    headerTitle: { flex: 1, textAlign: "center", color: colors.onSurface, fontWeight: "700", fontSize: 16 },
    body: { padding: 20, gap: 8 },
    eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 2 },
    title: { color: colors.onSurface, fontSize: 26, fontWeight: "800", marginTop: 8 },
    label: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700", marginTop: 18 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
    },
    chipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
    chipText: { color: colors.onSurfaceSecondary, fontSize: 13 },
    chipTextActive: { color: colors.onBrandTertiary, fontWeight: "700" },
    input: {
      minHeight: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      color: colors.onSurface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      marginTop: 10,
    },
    textarea: { minHeight: 120, textAlignVertical: "top" },
    message: { color: colors.brandPrimary, marginTop: 12 },
    submit: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.brandPrimary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 20,
    },
    submitDisabled: { opacity: 0.6 },
    submitText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
    historyTitle: { marginTop: 28 },
    empty: { color: colors.muted, marginTop: 10 },
    ticketCard: {
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      marginTop: 12,
      gap: 6,
    },
    ticketSubject: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
    ticketMeta: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
    ticketDesc: { color: colors.muted, fontSize: 13 },
  })
);
