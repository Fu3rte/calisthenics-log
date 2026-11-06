/**
 * provider 注册表：内置目录 + 本机 providers.json 定义合并，校验自定义端点，
 * 以及 ref 解析、变量名与掩码这些纯函数。
 */
import type { Model } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import {
  AiConfigError,
  CHAT_API,
  type ChatApi,
  type CustomProviderDraft,
  type ModelDefinition,
  type ProvidersDocument,
  type ProviderDefinition,
  type StoredModelEntry,
  type StoredProviderEntry,
} from "./types.js";

/** 内置 provider 只有 deepseek，其余都来自 providers.json */
export const BUILTIN_PROVIDER_IDS: readonly string[] = ["deepseek"];

const BUILTIN_LABELS: Record<string, string> = { deepseek: "DeepSeek" };

/** 自定义端点与未知模型 id 的通用元数据；不编造具体数值 */
export const DEFAULT_MODEL_METADATA = {
  contextWindow: 131072,
  maxTokens: 8192,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
} as const;

/**
 * 环境变量名的合法形式，也是 provider id 规则的依据：
 * id 必须以小写字母开头，派生出的变量名才不会以数字开头。
 */
const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** provider id：小写字母开头，其余为小写字母、数字或连字符，总长不超过 40 */
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/** 老条目派生名不合法时补的前缀，保证能被 .env 解析器读回 */
const ENV_VAR_PREFIX = "AI_";

function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * deepseek → DEEPSEEK_API_KEY；本地网关 → LOCAL_GATEWAY_API_KEY。
 * 新写入的 id 都被校验为字母开头，但 providers.json 里可能残留数字开头的老条目，
 * 它们的派生名会以数字开头，因此按同一套变量名规则补 AI_ 前缀，避免写了读不回来。
 */
export function envVarForProvider(providerId: string): string {
  if (providerId === "deepseek") return "DEEPSEEK_API_KEY";
  const name = `${providerId.replace(/-/g, "_").toUpperCase()}_API_KEY`;
  return ENV_VAR_NAME_PATTERN.test(name) ? name : `${ENV_VAR_PREFIX}${name}`;
}

/** 长度 ≥ 8 时留后 4 位，否则只给圆点；未配置返回 null */
export function maskSecret(secret: string | null): string | null {
  if (!secret) return null;
  return secret.length >= 8 ? `••••${secret.slice(-4)}` : "••••";
}

/** 只在第一个斜杠切分，模型 id 本身可以带斜杠 */
export function parseModelRef(ref: string): { provider: string; modelId: string } {
  const index = ref.indexOf("/");
  if (index < 0) return { provider: ref.trim(), modelId: "" };
  return { provider: ref.slice(0, index).trim(), modelId: ref.slice(index + 1).trim() };
}

export function modelRef(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

/** 通用元数据兜底，name 缺省时用模型 id */
export function defaultModelDefinition(
  id: string,
  baseUrl: string,
  name?: string | null
): ModelDefinition {
  return {
    id,
    name: name ?? id,
    baseUrl,
    api: CHAT_API,
    input: [...DEFAULT_MODEL_METADATA.input],
    cost: { ...DEFAULT_MODEL_METADATA.cost },
    reasoning: DEFAULT_MODEL_METADATA.reasoning,
    contextWindow: DEFAULT_MODEL_METADATA.contextWindow,
    maxTokens: DEFAULT_MODEL_METADATA.maxTokens,
  };
}

/** 把 pi-ai 内置模型整份复制成自有定义，保留 compat / thinkingLevelMap / inputLimits */
function fromBuiltinModel(model: Model<ChatApi>): ModelDefinition {
  const definition: ModelDefinition = {
    id: model.id,
    name: model.name,
    baseUrl: model.baseUrl,
    api: CHAT_API,
    input: [...model.input],
    cost: { ...model.cost },
    reasoning: model.reasoning,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
  if (model.compat) definition.compat = model.compat;
  if (model.thinkingLevelMap) definition.thinkingLevelMap = model.thinkingLevelMap;
  if (model.inputLimits) definition.inputLimits = model.inputLimits;
  return definition;
}

/** 内置目录，每次都取一份新的，调用方可安全改写 */
export function builtinProviders(): ProviderDefinition[] {
  const models = getBuiltinModels("deepseek").map((model) =>
    fromBuiltinModel(model as Model<ChatApi>)
  );
  const baseUrl = models[0]?.baseUrl ?? "https://api.deepseek.com";
  return [
    {
      id: "deepseek",
      label: BUILTIN_LABELS.deepseek ?? "DeepSeek",
      baseUrl,
      api: CHAT_API,
      custom: false,
      envVar: envVarForProvider("deepseek"),
      models,
    },
  ];
}

function isStoredModelEntry(value: unknown): value is StoredModelEntry {
  return isRecord(value) && typeof value.id === "string" && value.id.trim().length > 0;
}

function normalizeInput(value: unknown): ModelDefinition["input"] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const modalities = value.filter((item) => item === "text" || item === "image");
  return modalities.length === 0 ? null : [...new Set(modalities)];
}

const RATE_KEYS = ["input", "output", "cacheRead", "cacheWrite"] as const;

function costFrom(value: unknown, fallback: ModelDefinition["cost"]): ModelDefinition["cost"] {
  if (!isRecord(value)) return fallback;
  const rate = (key: (typeof RATE_KEYS)[number]) => {
    const item = value[key];
    return typeof item === "number" && Number.isFinite(item) ? item : fallback[key];
  };
  return {
    input: rate("input"),
    output: rate("output"),
    cacheRead: rate("cacheRead"),
    cacheWrite: rate("cacheWrite"),
  };
}

/** 本机文件里的模型条目 → 定稿定义；扩展字段缺省时用通用默认值 */
function modelFromStored(entry: StoredModelEntry, baseUrl: string): ModelDefinition {
  const id = entry.id.trim();
  const model = defaultModelDefinition(id, baseUrl, trimmed(entry.name));
  if (typeof entry.contextWindow === "number" && entry.contextWindow > 0) {
    model.contextWindow = entry.contextWindow;
  }
  if (typeof entry.maxTokens === "number" && entry.maxTokens > 0) {
    model.maxTokens = entry.maxTokens;
  }
  if (typeof entry.reasoning === "boolean") model.reasoning = entry.reasoning;
  const input = normalizeInput(entry.input);
  if (input) model.input = input;
  model.cost = costFrom(entry.cost, model.cost);
  if (entry.compat) model.compat = entry.compat;
  if (entry.thinkingLevelMap) model.thinkingLevelMap = entry.thinkingLevelMap;
  if (entry.inputLimits) model.inputLimits = entry.inputLimits;
  return model;
}

/** providers.json 对内置 deepseek 的覆盖：baseUrl / models / api 可覆盖，元数据仍取内置目录 */
function overrideBuiltin(
  base: ProviderDefinition,
  entry: StoredProviderEntry
): ProviderDefinition {
  const baseUrl = trimmed(entry.baseUrl) ?? base.baseUrl;
  const label = trimmed(entry.name) ?? base.label;
  const storedModels = (Array.isArray(entry.models) ? entry.models : []).filter(
    isStoredModelEntry
  );

  const models =
    storedModels.length > 0
      ? storedModels.map((stored) => {
          const id = stored.id.trim();
          const catalog = base.models.find((item) => item.id === id);
          if (!catalog) return modelFromStored(stored, baseUrl);
          return { ...catalog, baseUrl };
        })
      : base.models.map((model) => ({ ...model, baseUrl }));

  return { ...base, label, baseUrl, api: CHAT_API, models };
}

function buildCustomProvider(id: string, entry: StoredProviderEntry): ProviderDefinition {
  const baseUrl = trimmed(entry.baseUrl);
  if (!baseUrl) {
    throw new Error(`providers.json 里的 provider「${id}」缺少 baseUrl。`);
  }
  if (trimmed(entry.api) && entry.api !== CHAT_API) {
    throw new Error(`providers.json 里的 provider「${id}」只支持 openai-completions。`);
  }
  const models = (Array.isArray(entry.models) ? entry.models : [])
    .filter(isStoredModelEntry)
    .map((model) => modelFromStored(model, baseUrl));
  if (models.length === 0) {
    throw new Error(`providers.json 里的 provider「${id}」没有可用模型。`);
  }
  return {
    id,
    label: trimmed(entry.name) ?? id,
    baseUrl,
    api: CHAT_API,
    custom: true,
    envVar: envVarForProvider(id),
    models,
  };
}

/** 合并顺序：内置在前，自定义按文件里的顺序在后 */
export function resolveProviders(doc: ProvidersDocument): ProviderDefinition[] {
  const stored = doc.providers ?? {};
  const result: ProviderDefinition[] = [];

  for (const provider of builtinProviders()) {
    const override = stored[provider.id];
    result.push(override ? overrideBuiltin(provider, override) : provider);
  }

  for (const [id, entry] of Object.entries(stored)) {
    if (BUILTIN_PROVIDER_IDS.includes(id)) continue;
    result.push(buildCustomProvider(id, entry));
  }

  return result;
}

/** 校验面板提交的自定义端点；失败抛可展示的中文错误 */
export function validateCustomProviderInput(raw: unknown): CustomProviderDraft {
  if (!isRecord(raw)) {
    throw new AiConfigError("请求体必须是一个 JSON 对象。");
  }

  const id = trimmed(raw.id);
  if (!id) throw new AiConfigError("provider id 不能为空。");
  if (!PROVIDER_ID_PATTERN.test(id)) {
    throw new AiConfigError(
      "provider id 必须以小写字母开头，只能用小写字母、数字或连字符，总长不超过 40 个字符。"
    );
  }
  if (BUILTIN_PROVIDER_IDS.includes(id)) {
    throw new AiConfigError(`provider id「${id}」是内置 provider，不能覆盖。`);
  }

  const name = trimmed(raw.name);
  if (!name) throw new AiConfigError("provider 显示名不能为空。");

  const baseUrl = trimmed(raw.baseUrl);
  if (!baseUrl) throw new AiConfigError("Base URL 不能为空。");
  if (!isHttpUrl(baseUrl)) {
    throw new AiConfigError("Base URL 必须是 http 或 https 开头的地址。");
  }

  /* 只支持一种协议，api 缺省即按 openai-completions 处理；显式写了别的值才报错 */
  if (raw.api !== undefined && raw.api !== CHAT_API) {
    throw new AiConfigError("API 格式只支持 openai-completions。");
  }

  if (!Array.isArray(raw.models) || raw.models.length === 0) {
    throw new AiConfigError("至少要配置一个模型。");
  }

  const models: CustomProviderDraft["models"] = [];
  const seen = new Set<string>();
  for (const item of raw.models) {
    if (!isRecord(item)) throw new AiConfigError("模型条目必须是包含 id 的对象。");
    const modelId = trimmed(item.id);
    if (!modelId) throw new AiConfigError("模型 id 不能为空。");
    if (seen.has(modelId)) throw new AiConfigError(`模型 id「${modelId}」重复了。`);
    seen.add(modelId);
    const modelName = trimmed(item.name);
    models.push(modelName ? { id: modelId, name: modelName } : { id: modelId });
  }

  return { id, name, baseUrl, api: CHAT_API, models };
}
