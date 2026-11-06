/**
 * 模型配置的领域类型：provider 定义、模型定义、凭证状态与清单快照。
 * 不触碰文件系统，也不含 HTTP 细节。
 */
import type {
  Model,
  ModelCost,
  ModelInputLimits,
  ModelInputModality,
  OpenAICompletionsCompat,
  ThinkingLevelMap,
} from "@earendil-works/pi-ai";

/** 当前唯一支持的对话协议：OpenAI Chat Completions 兼容接口 */
export type ChatApi = "openai-completions";

export const CHAT_API: ChatApi = "openai-completions";

/** 可直接展示给用户的配置错误，status 供 HTTP 层映射状态码 */
export class AiConfigError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AiConfigError";
    this.status = status;
  }
}

/** 一个可调用的模型；baseUrl 与元数据都在这里定稿 */
export interface ModelDefinition {
  id: string;
  name: string;
  baseUrl: string;
  api: ChatApi;
  input: ModelInputModality[];
  cost: ModelCost;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  compat?: OpenAICompletionsCompat;
  thinkingLevelMap?: ThinkingLevelMap;
  inputLimits?: ModelInputLimits;
}

export interface ProviderDefinition {
  id: string;
  label: string;
  baseUrl: string;
  api: ChatApi;
  /** 自定义兼容端点，面板上可删 */
  custom: boolean;
  /** 密钥写入 .env 的变量名 */
  envVar: string;
  models: ModelDefinition[];
}

/** providers.json 里模型条目的可选扩展字段 */
export interface StoredModelEntry {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  input?: ModelInputModality[];
  cost?: Partial<ModelCost>;
  compat?: OpenAICompletionsCompat;
  thinkingLevelMap?: ThinkingLevelMap;
  inputLimits?: ModelInputLimits;
}

/** providers.json 里一家 provider 的落盘形状 */
export interface StoredProviderEntry {
  name?: string;
  baseUrl?: string;
  api?: string;
  models?: StoredModelEntry[];
}

/** providers.json 整份文档；未知字段不保留 */
export interface ProvidersDocument {
  providers: Record<string, StoredProviderEntry>;
  default?: string;
}

/** 面板与路由共用的自定义端点输入 */
export interface CustomProviderDraft {
  id: string;
  name: string;
  baseUrl: string;
  api: ChatApi;
  models: { id: string; name?: string }[];
}

/** 服务端给出的 provider 连接状态；masked 永远不是明文密钥 */
export interface CredentialStatus {
  provider: string;
  providerLabel: string;
  envVar: string;
  configured: boolean;
  masked: string | null;
  custom: boolean;
}

/** 添加 Provider 浮层里的一张卡片 */
export interface PickerEntry {
  id: string;
  label: string;
  group: "apikey" | "oauth";
  modelCount: number;
  custom: boolean;
  selectable: boolean;
  configured: boolean;
}

/** 左栏可见的模型；id 一律是 provider/modelId */
export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  providerLabel: string;
}

export interface CatalogSnapshot {
  models: ModelOption[];
  credentials: CredentialStatus[];
  defaults: { model: string };
}

/** 对话运行时需要的成品模型与明文密钥；密钥只出现在这里 */
export interface ResolvedSelection {
  model: Model<ChatApi>;
  apiKey: string;
}
