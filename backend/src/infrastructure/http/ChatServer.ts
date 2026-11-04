/**
 * 入站适配器：把 HTTP 请求翻译成用例调用，把用例事件写成 SSE。
 * 只做协议转换，不含业务判断。
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import type { AskCoach, PreparedRequest } from "../../application/AskCoach.js";
import type { CoachSetup } from "../../application/CoachSetup.js";
import type { CoachCredentials } from "../../application/ports/CoachCredentials.js";
import { BadRequestError } from "../../domain/BadRequest.js";
import { openEventStream, writeEvent } from "./sse.js";

export interface ChatServerOptions {
  readonly askCoach: AskCoach;
  readonly setup: CoachSetup;
  readonly credentials: CoachCredentials;
  readonly host: string;
  readonly port: number;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

/** 方法不符时已回 405，调用方直接 return */
function requireMethod(
  req: IncomingMessage,
  res: ServerResponse,
  method: string
): boolean {
  if (req.method === method) return true;
  sendJson(res, 405, { error: "method not allowed" });
  return false;
}

/** 入参非法原样带出消息，其余异常用兜底文案 */
function sendInvalid(res: ServerResponse, cause: unknown, fallback: string): void {
  const error = cause instanceof BadRequestError ? cause.message : fallback;
  sendJson(res, 400, { error });
}

/** 服务只绑 127.0.0.1，唯一的调用方是本仓前端且已限单条 2000 字 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Response(Readable.toWeb(req)).text();
}

export class ChatServer {
  private readonly server: Server;

  constructor(private readonly options: ChatServerOptions) {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
  }

  listen(): Promise<void> {
    const { host, port } = this.options;
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, host, resolve);
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    const getRoutes: Record<string, () => unknown | Promise<unknown>> = {
      "/api/health": () => ({
        ok: true,
        model: this.options.askCoach.defaults.modelId,
      }),
      "/api/models": () => this.options.setup.catalog(),
      "/api/settings/providers": async () => ({
        providers: await this.options.setup.picker(),
      }),
    };
    const route = getRoutes[url.pathname];
    if (route) {
      if (!requireMethod(req, res, "GET")) return;
      sendJson(res, 200, await route());
      return;
    }

    if (url.pathname === "/api/settings/connection") {
      await this.handleConnection(req, res);
      return;
    }

    if (url.pathname === "/api/settings/providers/custom") {
      await this.handleCustomProvider(req, res, url);
      return;
    }

    if (url.pathname !== "/api/chat") {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    if (!requireMethod(req, res, "POST")) return;

    let prepared: PreparedRequest;
    try {
      prepared = this.options.askCoach.prepare(JSON.parse(await readBody(req)));
    } catch (cause) {
      sendInvalid(res, cause, "请求体不是合法 JSON");
      return;
    }

    openEventStream(res);

    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      for await (const event of this.options.askCoach.execute(
        prepared.turns,
        prepared.settings,
        controller.signal
      )) {
        if (event.type === "delta") writeEvent(res, { delta: event.text });
        else if (event.type === "error") writeEvent(res, { error: event.message });
        else writeEvent(res, { done: true });
      }
    } catch {
      /* 客户端断开后写入会抛，直接收尾 */
    } finally {
      res.end();
    }
  }

  /** 连接配置：只出掩码，永不回显密钥 */
  private async handleConnection(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    if (req.method === "GET") {
      sendJson(res, 200, { providers: await this.options.credentials.list() });
      return;
    }
    if (!requireMethod(req, res, "PUT")) return;

    try {
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
      if (typeof body.apiKey !== "string") {
        throw new BadRequestError("apiKey 必须是字符串，清空请传空串");
      }
      const provider = String(body.provider ?? "").trim();
      sendJson(res, 200, {
        providers: await this.options.setup.updateConnection(provider, body.apiKey),
      });
    } catch (cause) {
      sendInvalid(res, cause, "写入 .env 失败");
    }
  }

  /** 自定义兼容端点的新增与删除；定义落 providers.json，密钥仍走 .env */
  private async handleCustomProvider(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<void> {
    try {
      if (req.method === "PUT") {
        const body = JSON.parse(await readBody(req));
        sendJson(res, 200, {
          providers: await this.options.setup.addCustom(body),
        });
        return;
      }
      if (req.method === "DELETE") {
        const id = url.searchParams.get("id") ?? "";
        sendJson(res, 200, {
          providers: await this.options.setup.removeCustom(id),
        });
        return;
      }
    } catch (cause) {
      sendInvalid(res, cause, "写入 providers.json 失败");
      return;
    }
    sendJson(res, 405, { error: "method not allowed" });
  }
}
