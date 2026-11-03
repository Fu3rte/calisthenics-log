/**
 * 模型设置值对象。
 * 只描述「用哪个模型、回复上限多少」，modelId 为 provider/model；密钥与端点在服务端 .env，不进设置。
 */

export interface CoachSettings {
  readonly modelId: string;
  readonly maxTokens: number;
}

export const MIN_MAX_TOKENS = 128;
export const MAX_MAX_TOKENS = 4000;

export class CoachSettingsInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachSettingsInvalidError";
  }
}

/** 请求体里的 settings 可缺省，缺省时整份用服务端默认 */
export function parseSettings(
  raw: unknown,
  fallback: CoachSettings
): CoachSettings {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "object") {
    throw new CoachSettingsInvalidError("settings 必须是对象");
  }

  const input = raw as Record<string, unknown>;

  const modelId =
    input.model === undefined ? fallback.modelId : String(input.model).trim();
  if (!modelId) {
    throw new CoachSettingsInvalidError("模型 id 不能为空");
  }

  let maxTokens = fallback.maxTokens;
  if (input.maxTokens !== undefined) {
    const value = input.maxTokens;
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new CoachSettingsInvalidError("maxTokens 必须是整数");
    }
    if (value < MIN_MAX_TOKENS || value > MAX_MAX_TOKENS) {
      throw new CoachSettingsInvalidError(
        `maxTokens 必须在 ${MIN_MAX_TOKENS}–${MAX_MAX_TOKENS} 之间`
      );
    }
    maxTokens = value;
  }

  return { modelId, maxTokens };
}
