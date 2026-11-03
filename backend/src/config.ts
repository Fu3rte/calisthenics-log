import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AppConfig {
  readonly host: string;
  readonly port: number;
  /** provider/model 形式 */
  readonly modelId: string;
  readonly maxTokens: number;
  readonly trainingLogPath: string;
  readonly envPath: string;
  readonly providersJsonPath: string;
  readonly piAuthPath: string;
}

export function backendRoot(): string {
  /* 编译产物位于 backend/dist，上一级即后端包根：数据、.env、providers.json 都在这 */
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

export function loadConfig(): AppConfig {
  return {
    host: "127.0.0.1",
    port: Number(process.env.CHAT_PORT ?? 8787),
    modelId: process.env.CHAT_MODEL ?? "deepseek/deepseek-v4-pro",
    maxTokens: Number(process.env.CHAT_MAX_TOKENS ?? 900),
    trainingLogPath: path.join(backendRoot(), "训练日志.json"),
    /* 密钥集中在这一个文件，面板写它，进程启动时灌进环境变量 */
    envPath: path.join(backendRoot(), ".env"),
    /* 自定义兼容端点的定义，本机数据，不含密钥 */
    providersJsonPath: path.join(backendRoot(), "providers.json"),
    piAuthPath: path.join(os.homedir(), ".pi", "agent", "auth.json"),
  };
}
