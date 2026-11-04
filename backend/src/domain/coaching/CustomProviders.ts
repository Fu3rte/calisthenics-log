/**
 * 自定义 provider 的定义与校验：OpenAI / Anthropic 兼容端点。
 * 纯数据规则，不碰文件也不碰 pi-ai。
 */
import { BadRequestError } from "../BadRequest.js";

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

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
const APIS: readonly CustomProviderApi[] = ["openai-completions", "anthropic-messages"];

/** 自定义 provider 的密钥变量名，与内置家的风格一致 */
export function customProviderEnvVar(id: string): string {
  return `${id.replace(/-/g, "_").toUpperCase()}_API_KEY`;
}

function readText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") {
    throw new BadRequestError(`${field} 必须是字符串`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestError(`${field} 不能为空`);
  }
  if (trimmed.length > max) {
    throw new BadRequestError(`${field} 长度不超过 ${max}`);
  }
  return trimmed;
}

function readBaseUrl(value: unknown): string {
  const raw = readText(value, "baseUrl", 300);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestError("baseUrl 不是合法 URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestError("baseUrl 只支持 http 或 https");
  }
  return url.toString().replace(/\/$/, "");
}

function readModels(value: unknown): CustomModelEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestError("至少填一个模型 id");
  }

  const seen = new Set<string>();
  return value.map((item) => {
    const entry = item as Record<string, unknown>;
    const id = readText(entry?.id, "模型 id", 80);
    if (seen.has(id)) {
      throw new BadRequestError(`模型 id 重复：${id}`);
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
    throw new BadRequestError("provider 定义必须是对象");
  }
  const input = raw as Record<string, unknown>;

  const id = readText(input.id, "id", 40);
  if (!ID_PATTERN.test(id)) {
    throw new BadRequestError("id 只能用小写字母、数字与连字符，2–40 位");
  }

  const api = input.api;
  if (!APIS.includes(api as CustomProviderApi)) {
    throw new BadRequestError(`api 只能是 ${APIS.join(" 或 ")}`);
  }

  return {
    id,
    name: readText(input.name, "显示名", 60),
    baseUrl: readBaseUrl(input.baseUrl),
    api: api as CustomProviderApi,
    models: readModels(input.models),
  };
}
