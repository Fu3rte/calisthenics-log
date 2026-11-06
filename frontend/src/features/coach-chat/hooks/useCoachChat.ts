/**
 * 会话状态机：会话列表、当前 transcript、流式回答与错误。
 * 历史以服务端 session 为准，浏览器只记当前选中的 id。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { streamCoachReply } from "@/features/coach-chat/api/chatStream";
import {
  deleteSession as requestDelete,
  fetchSessionMessages,
  listSessions,
  renameSession as requestRename,
} from "@/features/coach-chat/api/sessionsApi";
import {
  loadSessionId,
  saveSessionId,
} from "@/features/coach-chat/api/sessionPrefs";
import {
  MAX_INPUT,
  type ChatMessage,
  type SessionSummary,
  type ToolActivity,
} from "@/features/coach-chat/model/chat";

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useCoachChat(model: string | null) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 列表单独报错，服务没起来时输入框仍然可用 */
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  /** 每次切换会话或发起请求都换一个令牌，迟到的异步结果直接丢掉 */
  const runRef = useRef(0);
  /** 列表请求也排队，后发的刷新结果不会被先发的旧列表覆盖 */
  const listSeqRef = useRef(0);

  const commitActiveId = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
    saveSessionId(id);
  }, []);

  const refreshSessions = useCallback(async () => {
    const seq = ++listSeqRef.current;
    try {
      const next = await listSessions();
      if (seq !== listSeqRef.current) return;
      setSessions(next);
      setSessionsError(null);
    } catch (cause) {
      if (seq !== listSeqRef.current) return;
      setSessionsError(describe(cause));
    }
  }, []);

  /* 首次挂载：先拿列表，再按 prefs 选中会话并载入 transcript */
  useEffect(() => {
    const token = ++runRef.current;
    const listSeq = ++listSeqRef.current;

    void (async () => {
      try {
        const list = await listSessions();
        if (listSeq === listSeqRef.current) {
          setSessions(list);
          setSessionsError(null);
        }
        if (runRef.current !== token || listSeq !== listSeqRef.current) return;

        const saved = loadSessionId();
        const target =
          saved && list.some((session) => session.id === saved)
            ? saved
            : list[0]?.id ?? null;

        commitActiveId(target);
        if (!target) return;

        const history = await fetchSessionMessages(target);
        if (runRef.current === token && activeIdRef.current === target) {
          setMessages(history);
        }
      } catch (cause) {
        if (runRef.current === token && listSeq === listSeqRef.current) {
          setSessionsError(describe(cause));
        }
      }
    })();

    return () => {
      runRef.current += 1;
      abortRef.current?.abort();
    };
  }, [commitActiveId]);

  const send = useCallback(
    (text?: string) => {
      const trimmed = (text ?? input).trim().slice(0, MAX_INPUT);
      if (!trimmed || pendingRef.current) return;

      const token = ++runRef.current;
      const startId = activeIdRef.current;
      const controller = new AbortController();

      abortRef.current = controller;
      pendingRef.current = true;
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: "" },
      ]);
      setInput("");
      setError(null);
      setPending(true);

      const patchLastAssistant = (
        update: (last: ChatMessage) => ChatMessage
      ) => {
        if (runRef.current !== token) return;
        setMessages((prev) => {
          const next = prev.slice();
          const last = next[next.length - 1];
          if (!last || last.role !== "assistant") return prev;
          next[next.length - 1] = update(last);
          return next;
        });
      };

      void (async () => {
        try {
          for await (const event of streamCoachReply(
            { sessionId: startId, message: trimmed, model },
            controller.signal
          )) {
            if (runRef.current !== token) return;

            switch (event.type) {
              case "session": {
                /* 新会话在第一帧才知道 id，这时才写 prefs 并刷新列表 */
                if (!activeIdRef.current) {
                  commitActiveId(event.id);
                  void refreshSessions();
                }
                break;
              }
              case "delta": {
                patchLastAssistant((last) => ({
                  ...last,
                  content: last.content + event.text,
                }));
                break;
              }
              case "tool_call":
              case "tool_result": {
                const activity: ToolActivity =
                  event.type === "tool_call"
                    ? {
                        id: event.id,
                        name: event.name,
                        detail: event.detail,
                        state: "call",
                      }
                    : {
                        id: event.id,
                        name: event.name,
                        detail: event.detail,
                        state: "result",
                        isError: event.isError,
                        durationMs: event.durationMs,
                      };

                patchLastAssistant((last) => {
                  const activities = [...(last.activities ?? [])];
                  const index = activities.findIndex(
                    (item) => item.id === activity.id
                  );
                  if (index >= 0) activities[index] = activity;
                  else activities.push(activity);
                  return { ...last, activities };
                });
                break;
              }
              case "done": {
                if (event.aborted) {
                  patchLastAssistant((last) => ({ ...last, stopped: true }));
                } else {
                  /* 完整结束时用服务端 transcript 覆盖，保证与 session 一致 */
                  const finalId = activeIdRef.current ?? startId;
                  if (finalId) {
                    try {
                      const history = await fetchSessionMessages(finalId);
                      if (runRef.current === token) setMessages(history);
                    } catch {
                      /* 重拉失败就保留本地内容，不额外报错 */
                    }
                  }
                }
                void refreshSessions();
                return;
              }
            }
          }
        } catch (cause) {
          if (runRef.current !== token) return;
          if (controller.signal.aborted) {
            patchLastAssistant((last) => ({ ...last, stopped: true }));
            void refreshSessions();
            return;
          }
          setError(describe(cause));
        } finally {
          if (runRef.current === token) {
            abortRef.current = null;
            pendingRef.current = false;
            setPending(false);
            /* 出错或中止时没有正文的占位直接撤掉 */
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (
                last?.role === "assistant" &&
                last.content.length === 0 &&
                (last.activities?.length ?? 0) === 0
              ) {
                return prev.slice(0, -1);
              }
              return prev;
            });
          }
        }
      })();
    },
    [input, model, commitActiveId, refreshSessions]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newSession = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    pendingRef.current = false;
    setPending(false);
    commitActiveId(null);
    setMessages([]);
    setError(null);
    /* 首次列表请求可能还没回来，新对话也要让导轨恢复可用 */
    void refreshSessions();
  }, [commitActiveId, refreshSessions]);

  const selectSession = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) return;

      const token = ++runRef.current;
      abortRef.current?.abort();
      abortRef.current = null;
      pendingRef.current = false;
      setPending(false);

      commitActiveId(id);
      setMessages([]);
      setError(null);

      void (async () => {
        try {
          const history = await fetchSessionMessages(id);
          if (runRef.current === token && activeIdRef.current === id) {
            setMessages(history);
          }
        } catch (cause) {
          if (runRef.current === token) setError(describe(cause));
        }
      })();
    },
    [commitActiveId]
  );

  const renameSession = useCallback(async (id: string, name: string) => {
    try {
      const session = await requestRename(id, name);
      setSessions((prev) =>
        prev.map((item) => (item.id === session.id ? session : item))
      );
      setSessionsError(null);
    } catch (cause) {
      setSessionsError(describe(cause));
    }
  }, []);

  const removeSession = useCallback(
    async (id: string) => {
      try {
        await requestDelete(id);
        const remaining = sessions.filter((item) => item.id !== id);
        setSessions(remaining);
        setSessionsError(null);

        /* 删的不是当前会话，列表更新到这里就够了 */
        if (activeIdRef.current !== id) return;

        const token = ++runRef.current;
        abortRef.current?.abort();
        abortRef.current = null;
        pendingRef.current = false;
        setPending(false);
        setError(null);

        const next = remaining[0]?.id ?? null;
        commitActiveId(next);
        setMessages([]);
        if (!next) return;

        try {
          const history = await fetchSessionMessages(next);
          if (runRef.current === token && activeIdRef.current === next) {
            setMessages(history);
          }
        } catch (cause) {
          if (runRef.current === token) setError(describe(cause));
        }
      } catch (cause) {
        setSessionsError(describe(cause));
      }
    },
    [sessions, commitActiveId]
  );

  return {
    sessions,
    activeId,
    messages,
    input,
    pending,
    error,
    sessionsError,
    setInput,
    send,
    stop,
    newSession,
    selectSession,
    renameSession,
    removeSession,
  };
}
