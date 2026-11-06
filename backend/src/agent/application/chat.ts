/**
 * 对话用例：解析模型、准备 Pi 会话、把事件转成 SSE 帧。
 * 每次运行独立创建 ModelRuntime 与凭证，密钥只留在进程内存。
 */
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { InMemoryCredentialStore, type Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import { summarizeDetail } from "../domain/transcript.js";
import { AgentError, type ChatStreamFrame } from "../domain/types.js";
import type { ResolveModelSelection } from "./ports.js";

export const COACH_PROMPT = [
  "你是街健训练助手，用简体中文回答。",
  "只依据自身知识回答训练、动作、进阶与恢复相关问题。",
  "当前没有可调用的工具，读不到任何本地文件或训练日志；不要声称查看过记录。",
  "用户没有明确给出的训练数据（动作、组数、次数、日期、体重等）一律不要编造或估算，需要时直接询问。",
  "回答简洁具体，优先给出可执行的下一步。",
].join("\n");

export interface ChatRunInput {
  sessionId?: string | null;
  message: string;
  model?: string;
  /** 不落盘的临时运行：模型连通性探针用，不建会话也不进列表 */
  ephemeral?: boolean;
}

export type ChatFrameEmitter = (frame: ChatStreamFrame) => void;

export interface ChatRunner {
  run(input: ChatRunInput, emit: ChatFrameEmitter, signal?: AbortSignal): Promise<void>;
  isBusy(sessionId: string): boolean;
}

export interface ChatRunnerOptions {
  resolveModel: ResolveModelSelection;
  sessionDir: string;
  workspaceDir: string;
  /** Pi 的运行配置目录；省略时取 workspace 的兄弟目录 pi/ */
  agentDir?: string;
}

/** 同一会话同时只允许一个回答，跨请求共享 */
const activeSessions = new Set<string>();

function assertWithin(baseDir: string, target: string): void {
  const rel = relative(resolve(baseDir), resolve(target));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new AgentError("会话路径不合法。", 400);
  }
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "模型运行出错。";
}

function toProviderModel(model: Model<"openai-completions">): ProviderModelConfig {
  const config: ProviderModelConfig = {
    type: "chat",
    id: model.id,
    name: model.name,
    api: model.api,
    baseUrl: model.baseUrl,
    input: [...model.input],
    cost: { ...model.cost },
    reasoning: model.reasoning,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
  if (model.compat) config.compat = model.compat;
  if (model.thinkingLevelMap) config.thinkingLevelMap = model.thinkingLevelMap;
  if (model.inputLimits) config.inputLimits = model.inputLimits;
  return config;
}

async function createRuntime(model: Model<"openai-completions">, apiKey: string): Promise<ModelRuntime> {
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
  });
  /* SDK 要求 provider 注册时就带认证方式，否则组装阶段会判定为不可用；
     密钥同时写入运行时凭证，只存在内存。 */
  runtime.registerProvider(model.provider, {
    name: model.provider,
    baseUrl: model.baseUrl,
    api: "openai-completions",
    apiKey,
    models: [toProviderModel(model)],
  });
  await runtime.setRuntimeApiKey(model.provider, apiKey);
  return runtime;
}

export function createChatRunner(options: ChatRunnerOptions): ChatRunner {
  const { resolveModel, sessionDir, workspaceDir } = options;
  const agentDir = options.agentDir ?? join(dirname(resolve(workspaceDir)), "pi");

  return {
    isBusy(sessionId) {
      return activeSessions.has(sessionId);
    },

    async run(input, emit, signal) {
      if (!input.ephemeral && input.sessionId && activeSessions.has(input.sessionId)) {
        throw new AgentError("该会话正在回答中，请稍候。", 409);
      }

      const selection = await resolveModel(input.model);

      const existingPath =
        input.ephemeral || !input.sessionId
          ? undefined
          : SessionManager.findById(workspaceDir, input.sessionId, sessionDir);
      if (!input.ephemeral && input.sessionId && !existingPath) {
        throw new AgentError("会话不存在。", 404);
      }
      if (existingPath) assertWithin(sessionDir, existingPath);

      const manager = input.ephemeral
        ? SessionManager.inMemory(workspaceDir)
        : existingPath
          ? SessionManager.open(existingPath, sessionDir, workspaceDir)
          : SessionManager.create(workspaceDir, sessionDir);
      const sessionId = manager.getSessionId();

      if (activeSessions.has(sessionId)) {
        throw new AgentError("该会话正在回答中，请稍候。", 409);
      }
      activeSessions.add(sessionId);

      let aborted = false;
      let failed = false;
      let session: AgentSession | undefined;
      let unsubscribe = () => {};

      const onAbort = () => {
        aborted = true;
        if (session) void session.abort().catch(() => {});
      };

      try {
        /* 临时运行没有会话归属，不把 id 交给前端 */
        if (!input.ephemeral) emit({ sessionId });

        if (signal?.aborted) {
          aborted = true;
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });

        const runtime = await createRuntime(selection.model, selection.apiKey);
        const settingsManager = SettingsManager.inMemory({});
        const resourceLoader = new DefaultResourceLoader({
          cwd: workspaceDir,
          agentDir,
          settingsManager,
          noExtensions: true,
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          systemPrompt: COACH_PROMPT,
        });
        await resourceLoader.reload();

        const created = await createAgentSession({
          cwd: workspaceDir,
          agentDir,
          modelRuntime: runtime,
          model: selection.model,
          thinkingLevel: selection.model.reasoning ? "medium" : "off",
          sessionManager: manager,
          settingsManager,
          resourceLoader,
          noTools: "all",
          customTools: [],
        });
        session = created.session;

        unsubscribe = session.subscribe((event) => {
          if (event.type === "message_update") {
            const update = event.assistantMessageEvent;
            if (update.type === "text_delta" && update.delta) {
              emit({ delta: update.delta });
            }
            return;
          }
          if (event.type === "tool_execution_start") {
            emit({
              tool: {
                id: event.toolCallId,
                name: event.toolName,
                detail: summarizeDetail(event.args),
                state: "call",
              },
            });
            return;
          }
          if (event.type === "tool_execution_end") {
            emit({
              tool: {
                id: event.toolCallId,
                name: event.toolName,
                detail: summarizeDetail(event.result),
                state: "result",
                isError: event.isError,
                ...(typeof event.durationMs === "number" ? { durationMs: event.durationMs } : {}),
              },
            });
            return;
          }
          if (event.type === "message_end") {
            const message = event.message;
            if (message.role === "assistant" && message.stopReason === "error") {
              failed = true;
              emit({ error: message.errorMessage ?? "模型请求失败。" });
            }
          }
        });

        /* 客户端可能在准备阶段就断开，避免再发起一次模型请求 */
        if (aborted || signal?.aborted) {
          aborted = true;
          return;
        }

        await session.prompt(input.message);
        await session.waitForIdle();
      } catch (error) {
        if (!aborted && !failed) {
          failed = true;
          emit({ error: errorMessageOf(error) });
        }
      } finally {
        signal?.removeEventListener("abort", onAbort);
        unsubscribe();
        if (aborted) {
          if (session) {
            try {
              await session.abort();
            } catch {
              /* 中止失败不再上报，收尾照常 */
            }
          }
          emit({ done: true, aborted: true });
        } else if (!failed) {
          emit({ done: true, aborted: false });
        }
        /* 释放失败也必须解锁，否则该会话会一直 409 到进程重启 */
        try {
          session?.dispose();
        } finally {
          activeSessions.delete(sessionId);
        }
      }
    },
  };
}
