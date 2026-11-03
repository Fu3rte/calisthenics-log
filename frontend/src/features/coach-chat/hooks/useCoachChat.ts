/**
 * 对话状态机：消息列表、输入、流式中、错误、取消。
 * 组件只管渲染，传输在 api/chatStream，持久化在 api/chatHistoryStore。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { streamCoachReply } from "@/features/coach-chat/api/chatStream";
import {
  loadHistory,
  saveHistory,
} from "@/features/coach-chat/api/chatHistoryStore";
import {
  MAX_INPUT,
  trimTurns,
  type ChatMessage,
  type ChatSettings,
} from "@/features/coach-chat/model/chat";

const NOT_RUNNING = "本地问答服务没起来，跑 npm run dev 一起启动。";

export interface CoachChatState {
  messages: ChatMessage[];
  input: string;
  pending: boolean;
  error: string | null;
  setInput: (value: string) => void;
  send: (text?: string) => void;
  stop: () => void;
}

export function useCoachChat(settings?: ChatSettings): CoachChatState {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    (text?: string) => {
      const trimmed = (text ?? input).trim().slice(0, MAX_INPUT);
      if (!trimmed || pending) return;

      const history = trimTurns([
        ...messages,
        { role: "user" as const, content: trimmed },
      ]);

      setMessages([...history, { role: "assistant", content: "" }]);
      setInput("");
      setError(null);
      setPending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          for await (const delta of streamCoachReply(
            history,
            settings,
            controller.signal
          )) {
            setMessages((prev) => {
              const next = prev.slice();
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = {
                  role: "assistant",
                  content: last.content + delta,
                };
              }
              return next;
            });
          }
        } catch (cause) {
          if (!controller.signal.aborted) {
            const message = cause instanceof Error ? cause.message : String(cause);
            setError(
              message === "Failed to fetch" || message.includes("NetworkError")
                ? NOT_RUNNING
                : message
            );
          }
        } finally {
          abortRef.current = null;
          setPending(false);
          setMessages((prev) =>
            prev.filter((item) => item.role === "user" || item.content.length > 0)
          );
        }
      })();
    },
    [input, messages, pending, settings]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, input, pending, error, setInput, send, stop };
}
