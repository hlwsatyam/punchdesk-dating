import { useEffect, useRef, useState } from "react";
import { API_ROOT, getAccessToken } from "@/src/api";
import type { Message } from "@/src/types";

export type WsEvent =
  | { type: "connected"; userId: string }
  | { type: "message"; conversationId: string; message: Message }
  | { type: "typing"; conversationId: string; userId: string; state: boolean }
  | { type: "read"; conversationId: string; readerId: string }
  | { type: "ack"; clientId: string; message: Message }
  | { type: "pong" };

export type WsSocket = {
  ready: boolean;
  reconnecting: boolean;
  send: (payload: Record<string, unknown>) => boolean;
  close: () => void;
};

export function useChatSocket(handlers: {
  onEvent?: (event: WsEvent) => void;
}): WsSocket {
  const [ready, setReady] = useState(false);
  const [showReconnecting, setShowReconnecting] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlerRef = useRef(handlers.onEvent);
  handlerRef.current = handlers.onEvent;

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      const token = await getAccessToken();
      if (!token) return;
      const wsUrl = `${API_ROOT.replace(/^http/, "ws")}/ws/chat?token=${encodeURIComponent(token)}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      socket.onopen = () => {
        if (cancelled) return;
        setReady(true);
        setShowReconnecting(false);
        if (reconnectFlashRef.current) clearTimeout(reconnectFlashRef.current);
        pingRef.current = setInterval(() => {
          try {
            socket.send(JSON.stringify({ type: "ping" }));
          } catch {
            /* ignore */
          }
        }, 25000);
      };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsEvent;
          handlerRef.current?.(data);
        } catch {
          /* ignore */
        }
      };
      socket.onclose = () => {
        setReady(false);
        if (pingRef.current) clearInterval(pingRef.current);
        pingRef.current = null;
        // Only surface "reconnecting" pill after 1500ms so cold-start doesn't flash.
        if (!cancelled) {
          if (reconnectFlashRef.current) clearTimeout(reconnectFlashRef.current);
          reconnectFlashRef.current = setTimeout(() => setShowReconnecting(true), 1500);
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      };
    };
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (reconnectFlashRef.current) clearTimeout(reconnectFlashRef.current);
      if (pingRef.current) clearInterval(pingRef.current);
      try {
        socketRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return {
    ready,
    reconnecting: !ready && showReconnecting,
    send: (payload) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      try {
        socket.send(JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    },
    close: () => {
      try {
        socketRef.current?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
