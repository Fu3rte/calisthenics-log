/**
 * 对话领域模型：角色、消息、上下文与输入上限。
 * 不含传输、不含存储。
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** 带上游模型的历史轮数上限 */
export const MAX_TURNS = 12;

/** 单条输入上限，与后端一致 */
export const MAX_INPUT = 2000;

/* ============================================================
 * 模型设置
 * ============================================================ */
export interface ChatSettings {
  /** provider/model 形式的模型引用，来自服务端清单 */
  model: string;
  /** 单次回复上限，与后端 128–4000 对齐 */
  maxTokens: number;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  providerLabel: string;
}

export interface ProviderOption {
  id: string;
  label: string;
}

/** 服务端给出的 provider 连接状态；masked 永远不是明文密钥 */
export interface ProviderCredential {
  provider: string;
  providerLabel: string;
  envVar: string;
  configured: boolean;
  masked: string | null;
  source: "file" | "system" | "pi" | null;
  /** 自定义兼容端点，面板上可删 */
  custom: boolean;
}

export type ProviderGroup = "apikey" | "oauth";

/** 添加 Provider 浮层里的一张卡片 */
export interface PickerEntry {
  id: string;
  label: string;
  group: ProviderGroup;
  envVar: string | null;
  modelCount: number;
  custom: boolean;
  /** false 表示只读展示：订阅登录、多字段端点、零模型 */
  selectable: boolean;
  configured: boolean;
}

export type CustomProviderApi = "openai-completions" | "anthropic-messages";

export interface CustomProviderInput {
  id: string;
  name: string;
  baseUrl: string;
  api: CustomProviderApi;
  models: { id: string; name?: string }[];
}

export interface ModelCatalog {
  providers: ProviderOption[];
  models: ModelOption[];
  credentials: ProviderCredential[];
  defaults: ChatSettings;
}

export const MIN_MAX_TOKENS = 128;
export const MAX_MAX_TOKENS = 4000;

/** 越界的 token 数夹回区间 */
export function clampMaxTokens(value: number): number {
  if (!Number.isFinite(value)) return MIN_MAX_TOKENS;
  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, Math.round(value)));
}

export function sameSettings(a: ChatSettings, b: ChatSettings): boolean {
  return a.model === b.model && a.maxTokens === b.maxTokens;
}

export const SUGGESTIONS = [
  "这周容量比上周涨了多少",
  "引体该不该加组",
  "哪次训练的掉速最明显",
];

/** 把消息列表裁到最近 MAX_TURNS 条 */
export function trimTurns(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_TURNS);
}
