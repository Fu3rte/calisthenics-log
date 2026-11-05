/**
 * 会话持久化：浏览器 localStorage。
 * 隐私模式写不进去时静默跳过，聊完即弃。
 */
import { MAX_TURNS, type ChatMessage } from "@/features/coach-chat/model/chat";

const STORAGE_KEY = "calisthenics.chat.v1";

export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is ChatMessage =>
          typeof item === "object" &&
          item !== null &&
          ((item as ChatMessage).role === "user" ||
            (item as ChatMessage).role === "assistant") &&
          typeof (item as ChatMessage).content === "string"
      )
      .slice(-MAX_TURNS);
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
