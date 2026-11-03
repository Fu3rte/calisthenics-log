/**
 * 自定义 provider 的定义与校验：OpenAI / Anthropic 兼容端点。
 * 纯数据规则，不碰文件也不碰 pi-ai。
 */

export type CustomProviderApi = "openai-completions" | "anthropic-messages";

export interface CustomModelEntry {
  readonly id: string;
  readonly name: string;
}

export interface CustomProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly api: CustomProviderApi;
  readonly models: readonly CustomModelEntry[];
}

export class CustomProviderInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomProviderInvalidError";
  }
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MODEL_ID_PATTERN = /^[\w.@:/-]{1,80}$/;
const APIS: readonly CustomProviderApi[] = ["openai-completions", "anthropic-messages"];

/** 自定义 provider 的密钥变量名，与内置家的风格一致 */
export function customProviderEnvVar(id: string): string {
  return `${id.replace(/-/g, "_").toUpperCase()}_API_KEY`;
}

function readText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") {
    throw new CustomProviderInvalidError(`${field} 必须是字符串`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CustomProviderInvalidError(`${field} 不能为空`);
  }
  if (trimmed.length > max) {
    throw new CustomProviderInvalidError(`${field} 长度不超过 ${max}`);
  }
  return trimmed;
}

function readBaseUrl(value: unknown): string {
  const raw = readText(value, "baseUrl", 300);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CustomProviderInvalidError("baseUrl 不是合法 URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CustomProviderInvalidError("baseUrl 只支持 http 或 https");
  }
  return url.toString().replace(/\/$/, "");
}

function readModels(value: unknown): CustomModelEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CustomProviderInvalidError("至少填一个模型 id");
  }
  if (value.length > 64) {
    throw new CustomProviderInvalidError("模型数量不超过 64");
  }

  const seen = new Set<string>();
  return value.map((item) => {
    const entry = item as Record<string, unknown>;
    const id = readText(entry?.id, "模型 id", 80);
    if (!MODEL_ID_PATTERN.test(id)) {
      throw new CustomProviderInvalidError(`模型 id 含非法字符：${id}`);
    }
    if (seen.has(id)) {
      throw new CustomProviderInvalidError(`模型 id 重复：${id}`);
    }
    seen.add(id);
    const name =
      typeof entry?.name === "string" && entry.name.trim()
        ? entry.name.trim()
        : id;
    return { id, name };
  });
}

export function parseCustomProvider(raw: unknown): CustomProvider {
  if (!raw || typeof raw !== "object") {
    throw new CustomProviderInvalidError("provider 定义必须是对象");
  }
  const input = raw as Record<string, unknown>;

  const id = readText(input.id, "id", 40);
  if (!ID_PATTERN.test(id)) {
    throw new CustomProviderInvalidError("id 只能用小写字母、数字与连字符，2–40 位");
  }

  const api = input.api;
  if (!APIS.includes(api as CustomProviderApi)) {
    throw new CustomProviderInvalidError(`api 只能是 ${APIS.join(" 或 ")}`);
  }

  return {
    id,
    name: readText(input.name, "显示名", 60),
    baseUrl: readBaseUrl(input.baseUrl),
    api: api as CustomProviderApi,
    models: readModels(input.models),
  };
}

/** 文件里的整份定义：{ providers: { id: {...} } } */
export function parseCustomProviderFile(value: unknown): CustomProvider[] {
  const providers = (value as { providers?: unknown })?.providers;
  if (!providers || typeof providers !== "object") return [];
  return Object.entries(providers as Record<string, unknown>).map(([id, raw]) =>
    parseCustomProvider({ ...raw as object, id })
  );
}

export function toCustomProviderFile(
  list: readonly CustomProvider[]
): { providers: Record<string, Omit<CustomProvider, "id">> } {
  const providers: Record<string, Omit<CustomProvider, "id">> = {};
  for (const item of list) {
    const { id, ...rest } = item;
    providers[id] = rest;
  }
  return { providers };
}
