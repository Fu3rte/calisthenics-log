/**
 * 会话持久化：浏览器 localStorage。
 * 隐私模式写不进去时静默跳过，聊完即弃。
 */
import { MAX_TURNS, type ChatMessage } from "@/features/coach-chat/model/chat";

const STORAGE_KEY = "calisthenics.chat.v1";

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const item = value as ChatMessage;
  return (
    typeof item.content === "string" &&
    (item.role === "user" || item.role === "assistant")
  );
}

export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMessage).slice(-MAX_TURNS);
  } catch {
    return [];
  }
}

export function saveHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_TURNS)));
  } catch {
    /* 写不进去就算了 */
  }
}
