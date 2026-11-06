/**
 * 配置目录解析：默认 backend 目录，测试与多环境可用 CALISTHENICS_AI_DIR 整体覆盖。
 * 编译产物在 backend/dist/ai/infrastructure/，上溯三层即 backend。
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AI_DIR_ENV = "CALISTHENICS_AI_DIR";
export const PROVIDERS_FILE_NAME = "providers.json";
export const ENV_FILE_NAME = ".env";

export interface AiPaths {
  dir: string;
  providersFile: string;
  envFile: string;
}

export function resolveAiPaths(env: NodeJS.ProcessEnv = process.env): AiPaths {
  const override = env[AI_DIR_ENV]?.trim();
  const dir = override
    ? resolve(override)
    : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return {
    dir,
    providersFile: join(dir, PROVIDERS_FILE_NAME),
    envFile: join(dir, ENV_FILE_NAME),
  };
}
