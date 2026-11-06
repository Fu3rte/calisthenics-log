/**
 * Agent 运行目录解析：默认 backend/.agent-sessions，测试或多环境可用
 * CALISTHENICS_AGENT_DIR 整体覆盖。编译产物在 backend/dist/agent/infrastructure/，上溯三层即 backend。
 */
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AGENT_DIR_ENV = "CALISTHENICS_AGENT_DIR";
export const SESSIONS_DIR_NAME = "sessions";
export const PI_DIR_NAME = "pi";
export const WORKSPACE_DIR_NAME = "workspace";

export interface AgentPaths {
  /** 总目录，下辖三个子目录 */
  dir: string;
  /** 会话 JSONL 文件存放处 */
  sessionsDir: string;
  /** Pi 的 agentDir，只放运行时配置，不落密钥 */
  piDir: string;
  /** 对话工作目录，写入会话 header 的 cwd */
  workspaceDir: string;
}

export function resolveAgentPaths(env: NodeJS.ProcessEnv = process.env): AgentPaths {
  const override = env[AGENT_DIR_ENV]?.trim();
  const dir = override
    ? resolve(override)
    : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".agent-sessions");
  return {
    dir,
    sessionsDir: join(dir, SESSIONS_DIR_NAME),
    piDir: join(dir, PI_DIR_NAME),
    workspaceDir: join(dir, WORKSPACE_DIR_NAME),
  };
}

/** 启动与每次请求前都可调用，重复创建无副作用 */
export async function ensureAgentDirs(paths: AgentPaths = resolveAgentPaths()): Promise<void> {
  await Promise.all([
    mkdir(paths.sessionsDir, { recursive: true }),
    mkdir(paths.piDir, { recursive: true }),
    mkdir(paths.workspaceDir, { recursive: true }),
  ]);
}
