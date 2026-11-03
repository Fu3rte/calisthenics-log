/**
 * 模型设置的本地持久化：一台浏览器一份，不落服务端。
 */
import {
  clampMaxTokens,
  type ChatSettings,
} from "@/features/coach-chat/model/chat";

const STORAGE_KEY = "calisthenics.chat.settings.v1";

export function loadSettings(): ChatSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const value = parsed as { model?: unknown; maxTokens?: unknown };
    if (typeof value.model !== "string" || !value.model) return null;
    if (typeof value.maxTokens !== "number") return null;

    return { model: value.model, maxTokens: clampMaxTokens(value.maxTokens) };
  } catch {
    return null;
  }
}

export function saveSettings(settings: ChatSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* 写不进去就只在内存里生效 */
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
}
