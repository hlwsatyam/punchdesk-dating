import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useChatSocket } from "@/src/hooks/use-chat-socket";
import { storage } from "@/src/utils/storage";
import { makeStyles, useTheme } from "@/src/theme";
import type { Message } from "@/src/types";

const ME_KEY = "punch-desk-user-id";

export default function ChatScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const conversationId = String(params.id ?? "");
  const otherName = params.name ? String(params.name) : "Chat";

  const [me, setMe] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [otherTyping, setOtherTyping] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const socket = useChatSocket({
    onEvent: (event) => {
      if (event.type === "message" && event.conversationId === conversationId) {
        setMessages((current) =>
          current.some((m) => m.id === event.message.id) ? current : [...current, event.message]
        );
        // Auto-mark read if the message is from other user.
        if (event.message.senderId !== me) {
          socket.send({ type: "read", conversationId });
        }
      } else if (event.type === "typing" && event.conversationId === conversationId && event.userId !== me) {
        setOtherTyping(event.state);
      } else if (event.type === "read" && event.conversationId === conversationId && event.readerId !== me) {
        setMessages((current) =>
          current.map((m) => (m.senderId === me && !m.readBy.includes(event.readerId) ? { ...m, readBy: [...m.readBy, event.readerId], status: "read" } : m))
        );
      }
    },
  });

  useEffect(() => {
    (async () => {
      const cachedMe = await storage.secureGet<string | null>(ME_KEY, null);
      if (cachedMe) setMe(cachedMe);
      try {
        const profile = await api.profile();
        const userId = String(profile.userId ?? "");
        if (userId) {
          setMe(userId);
          await storage.secureSet(ME_KEY, userId);
        }
      } catch {
        /* ignore */
      }
      try {
        const result = await api.messages(conversationId);
        setMessages(result.messages);
      } catch {
        /* ignore */
      }
      setLoading(false);
      await api.markRead(conversationId).catch(() => undefined);
    })();
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [conversationId]);

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
    }
  }, [messages.length]);

  const send = () => {
    const value = draft.trim();
    if (!value) return;
    const clientId = `local_${Date.now()}`;
    const optimistic: Message = {
      id: clientId,
      conversationId,
      senderId: me,
      body: value,
      createdAt: new Date().toISOString(),
      status: "sending",
      readBy: [me],
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    const sentViaWs = socket.send({ type: "message", conversationId, body: value, clientId });
    if (!sentViaWs) {
      api
        .sendMessage(conversationId, value)
        .then((message) =>
          setMessages((current) => current.map((m) => (m.id === clientId ? message : m)))
        )
        .catch(() =>
          setMessages((current) => current.map((m) => (m.id === clientId ? { ...m, status: "failed" } : m)))
        );
    }
  };

  const handleTyping = (text: string) => {
    setDraft(text);
    socket.send({ type: "typing", conversationId, state: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.send({ type: "typing", conversationId, state: false });
    }, 1500);
  };

  const rendered = useMemo(() => messages, [messages]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          testID="chat-back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {otherName}
          </Text>
          <Text style={styles.headerStatus}>
            {socket.ready ? (otherTyping ? "Typing…" : "Online") : socket.reconnecting ? "Reconnecting…" : "Online"}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 8}
      >
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <FlatList
            testID="chat-list"
            ref={listRef}
            data={rendered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const mine = item.senderId === me;
              return (
                <View
                  testID={mine ? "message-mine" : "message-theirs"}
                  style={[styles.bubbleRow, mine ? styles.bubbleRight : styles.bubbleLeft]}
                >
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={mine ? styles.bubbleTextMine : styles.bubbleText}>{item.body}</Text>
                  </View>
                  {mine && item.status === "read" ? (
                    <Text style={styles.receipt}>Read</Text>
                  ) : null}
                  {mine && item.status === "sending" ? (
                    <Text style={styles.receipt}>Sending…</Text>
                  ) : null}
                  {mine && item.status === "failed" ? (
                    <Text style={[styles.receipt, styles.receiptError]}>Failed</Text>
                  ) : null}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={26} color={colors.brandPrimary} />
                <Text style={styles.emptyTitle}>Say hello</Text>
                <Text style={styles.emptyCopy}>Break the ice with something they mentioned.</Text>
              </View>
            }
          />
        )}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            testID="chat-input"
            value={draft}
            onChangeText={handleTyping}
            style={styles.input}
            placeholder="Type a message"
            placeholderTextColor={colors.muted}
            multiline
          />
          <Pressable
            testID="chat-send"
            style={[styles.sendButton, !draft.trim() && styles.sendDisabled]}
            onPress={send}
            disabled={!draft.trim()}
          >
            <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
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
      gap: 10,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSecondary,
    },
    headerCenter: { flex: 1, alignItems: "center" },
    headerTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
    headerStatus: { color: colors.muted, fontSize: 12, marginTop: 2 },
    loader: { flex: 1, alignItems: "center", justifyContent: "center" },
    listContent: { padding: 16, gap: 8, flexGrow: 1 },
    bubbleRow: { maxWidth: "82%" },
    bubbleLeft: { alignSelf: "flex-start" },
    bubbleRight: { alignSelf: "flex-end", alignItems: "flex-end" },
    bubble: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
    },
    bubbleMine: {
      backgroundColor: colors.brandPrimary,
      borderBottomRightRadius: 4,
    },
    bubbleTheirs: {
      backgroundColor: colors.surfaceSecondary,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bubbleText: { color: colors.onSurface, fontSize: 15, lineHeight: 20 },
    bubbleTextMine: { color: colors.onBrandPrimary, fontSize: 15, lineHeight: 20, fontWeight: "600" },
    receipt: { color: colors.muted, fontSize: 11, marginTop: 4 },
    receiptError: { color: colors.error },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
    emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
    emptyCopy: { color: colors.muted, fontSize: 13, textAlign: "center" },
    composer: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      backgroundColor: colors.surface,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderRadius: 22,
      backgroundColor: colors.surfaceSecondary,
      color: colors.onSurface,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 15,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.brandPrimary,
      alignItems: "center",
      justifyContent: "center",
    },
    sendDisabled: { opacity: 0.45 },
  })
);
