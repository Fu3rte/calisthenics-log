/**
 * Agent 的 HTTP 接口，挂在主入口的请求分发里。
 * 命中并已响应返回 true，未命中返回 false，交给主入口回落 404。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createChatRunner } from "../application/chat.js";
import type { ResolveModelSelection } from "../application/ports.js";
import { createSessionService } from "../application/sessions.js";
import { AgentError, type ChatStreamFrame } from "../domain/types.js";
import { ensureAgentDirs, resolveAgentPaths, type AgentPaths } from "../infrastructure/paths.js";

const MAX_BODY_BYTES = 64 * 1024;

/** 业务只用 pathname，基址固定，避免 Host 头参与 URL 解析 */
const REQUEST_BASE_URL = "http://127.0.0.1";

const SESSIONS_PATH = "/api/sessions";
const CHAT_PATH = "/api/chat";
const SESSION_MESSAGES_PATTERN = /^\/api\/sessions\/([^/]+)\/messages$/;
const SESSION_PATTERN = /^\/api\/sessions\/([^/]+)$/;

export type AgentRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<boolean>;

export interface AgentRequestHandlerOptions {
  resolveModel: ResolveModelSelection;
  /** 测试可注入现成目录，默认读 CALISTHENICS_AGENT_DIR 或项目内目录 */
  paths?: AgentPaths;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(pathname: string): string {
  if (pathname.length <= 1) return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent || res.writableEnded) {
    res.end();
    return;
  }
  try {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(payload));
  } catch {
    try {
      res.end();
    } catch {
      /* 连接已断开，静默收尾 */
    }
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new AgentError("请求体超过 64KB 上限。", 413);
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new AgentError("请求体必须是 JSON 对象。");

  try {
    return JSON.parse(text);
  } catch {
    throw new AgentError("请求体不是合法的 JSON。");
  }
}

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new AgentError("会话 id 不合法。");
  }
}

/** 业务错误带 status；未预期错误只记服务端日志，不回显内部细节 */
function toHttpError(error: unknown): { status: number; message: string } {
  if (error instanceof AgentError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof Error) {
    const status = (error as Error & { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      return { status, message: error.message };
    }
  }
  console.error("[agent]", error);
  return { status: 500, message: "服务端处理对话时出错，请查看本机服务日志。" };
}

function requireMethod(res: ServerResponse, method: string, allowed: string[]): void {
  if (allowed.includes(method)) return;
  res.setHeader("Allow", allowed.join(", "));
  throw new AgentError("该接口不支持这个请求方法。", 405);
}

/** 写 SSE 响应头并立即 flush，后续每帧格式固定为 "data: <json>\n\n" */
function startEventStream(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
}

interface ChatBody {
  sessionId?: string | null;
  message: string;
  model?: string;
  ephemeral?: boolean;
}

function readChatBody(raw: unknown): ChatBody {
  if (!isRecord(raw)) throw new AgentError("请求体必须是一个 JSON 对象。");

  const message = typeof raw.message === "string" ? raw.message : "";
  if (!message.trim()) throw new AgentError("请输入要发送的内容。");

  let sessionId: string | null | undefined;
  if (raw.sessionId !== undefined) {
    if (raw.sessionId !== null && typeof raw.sessionId !== "string") {
      throw new AgentError("sessionId 必须是字符串或 null。");
    }
    if (typeof raw.sessionId === "string" && !raw.sessionId.trim()) {
      throw new AgentError("sessionId 不能为空字符串。");
    }
    sessionId = raw.sessionId;
  }

  let model: string | undefined;
  if (raw.model !== undefined) {
    if (typeof raw.model !== "string") throw new AgentError("model 必须是字符串。");
    model = raw.model.trim() || undefined;
  }

  let ephemeral: boolean | undefined;
  if (raw.ephemeral !== undefined) {
    if (typeof raw.ephemeral !== "boolean") {
      throw new AgentError("ephemeral 必须是布尔值。");
    }
    ephemeral = raw.ephemeral;
  }

  return { sessionId, message, model, ephemeral };
}

async function handleChat(
  req: IncomingMessage,
  res: ServerResponse,
  paths: AgentPaths,
  resolveModel: ResolveModelSelection
): Promise<void> {
  const body = readChatBody(await readJsonBody(req));
  const runner = createChatRunner({
    resolveModel,
    sessionDir: paths.sessionsDir,
    workspaceDir: paths.workspaceDir,
    agentDir: paths.piDir,
  });

  let started = false;
  let closed = false;
  const controller = new AbortController();

  const emit = (frame: ChatStreamFrame): void => {
    if (closed) return;
    if (!started) {
      started = true;
      try {
        startEventStream(res);
      } catch {
        closed = true;
        return;
      }
    }
    try {
      res.write(`data: ${JSON.stringify(frame)}\n\n`);
    } catch {
      closed = true;
    }
  };

  const abortOnClose = (): void => {
    if (res.writableEnded) return;
    closed = true;
    controller.abort();
  };
  res.on("close", abortOnClose);

  try {
    await runner.run(body, emit, controller.signal);
  } catch (error) {
    const mapped = toHttpError(error);
    if (started) {
      emit({ error: mapped.message });
    } else {
      sendJson(res, mapped.status, { error: mapped.message });
      return;
    }
  } finally {
    res.off("close", abortOnClose);
  }

  if (!closed && !res.writableEnded) res.end();
}

export function createAgentRequestHandler(
  options: AgentRequestHandlerOptions
): AgentRequestHandler {
  return async (req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", REQUEST_BASE_URL);
    } catch {
      sendJson(res, 400, { error: "请求路径不合法。" });
      return true;
    }

    const path = normalizePath(url.pathname);
    const method = (req.method ?? "GET").toUpperCase();

    const messagesMatch = SESSION_MESSAGES_PATTERN.exec(path);
    const sessionMatch = SESSION_PATTERN.exec(path);
    const isSessions = path === SESSIONS_PATH;
    const isChat = path === CHAT_PATH;
    if (!isSessions && !isChat && !messagesMatch && !sessionMatch) return false;

    try {
      const paths = options.paths ?? resolveAgentPaths();
      await ensureAgentDirs(paths);
      const sessions = createSessionService({
        sessionDir: paths.sessionsDir,
        workspaceDir: paths.workspaceDir,
      });

      if (isSessions) {
        requireMethod(res, method, ["GET"]);
        sendJson(res, 200, { sessions: await sessions.list() });
        return true;
      }

      if (isChat) {
        requireMethod(res, method, ["POST"]);
        await handleChat(req, res, paths, options.resolveModel);
        return true;
      }

      if (messagesMatch) {
        requireMethod(res, method, ["GET"]);
        const id = decodeId(messagesMatch[1]);
        sendJson(res, 200, { messages: await sessions.transcript(id) });
        return true;
      }

      if (sessionMatch) {
        const id = decodeId(sessionMatch[1]);
        if (method === "PATCH") {
          const body = await readJsonBody(req);
          if (!isRecord(body) || typeof body.name !== "string") {
            throw new AgentError("请求体必须包含字符串 name。");
          }
          sendJson(res, 200, { session: await sessions.rename(id, body.name) });
          return true;
        }
        if (method === "DELETE") {
          await sessions.remove(id);
          sendJson(res, 200, { ok: true });
          return true;
        }
        requireMethod(res, method, ["PATCH", "DELETE"]);
        return true;
      }

      return false;
    } catch (error) {
      const mapped = toHttpError(error);
      sendJson(res, mapped.status, { error: mapped.message });
      return true;
    }
  };
}
