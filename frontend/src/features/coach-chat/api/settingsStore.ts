/**
 * 模型选择的本地持久化：一台浏览器一份，不落服务端。
 * 回复上限一律用服务端默认值。
 */

const STORAGE_KEY = "calisthenics.chat.settings.v1";

export function loadModel(): string | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const model = (JSON.parse(raw) as { model?: unknown }).model;
  return typeof model === "string" && model ? model : null;
}

export function saveModel(model: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ model }));
}

export function clearModel(): void {
  localStorage.removeItem(STORAGE_KEY);
}
