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
import type { AskCoach } from "../../application/AskCoach.js";
import type { CoachSetup } from "../../application/CoachSetup.js";
import {
  CredentialKeyInvalidError,
  CredentialProviderUnknownError,
} from "../../application/ports/CoachCredentials.js";
import { CoachSettingsInvalidError } from "../../domain/coaching/CoachSettings.js";
import type { CoachSettings } from "../../domain/coaching/CoachSettings.js";
import { CustomProviderInvalidError } from "../../domain/coaching/CustomProviders.js";
import { CoachTurnInvalidError } from "../../domain/coaching/CoachTurn.js";
import type { CoachTurn } from "../../domain/coaching/CoachTurn.js";
import { openEventStream, writeEvent } from "./sse.js";

const MAX_BODY = 64 * 1024;

export interface ChatServerOptions {
  readonly askCoach: AskCoach;
  readonly setup: CoachSetup;
  readonly host: string;
  readonly port: number;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new CoachTurnInvalidError("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
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
      this.server.listen(port, host, () => {
        this.server.removeListener("error", reject);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/api/health") {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        model: this.options.askCoach.defaults.modelId,
      });
      return;
    }

    if (url.pathname === "/api/models") {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      sendJson(res, 200, await this.options.setup.catalog());
      return;
    }

    if (url.pathname === "/api/settings/connection") {
      await this.handleConnection(req, res);
      return;
    }

    if (url.pathname === "/api/settings/providers") {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      sendJson(res, 200, { providers: await this.options.setup.picker() });
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

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }

    let prepared: { turns: CoachTurn[]; settings: CoachSettings };
    try {
      const body = await readBody(req);
      prepared = this.options.askCoach.prepare(JSON.parse(body));
    } catch (cause) {
      const message =
        cause instanceof CoachTurnInvalidError ||
        cause instanceof CoachSettingsInvalidError
          ? cause.message
          : "请求体不是合法 JSON";
      sendJson(res, 400, { error: message });
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
      sendJson(res, 200, { providers: await this.options.setup.connection() });
      return;
    }
    if (req.method !== "PUT") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }

    let provider: string;
    let apiKey: string;
    try {
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
      if (typeof body.provider !== "string" || !body.provider.trim()) {
        throw new CredentialProviderUnknownError("provider 不能为空");
      }
      if (typeof body.apiKey !== "string") {
        throw new CredentialKeyInvalidError("apiKey 必须是字符串，清空请传空串");
      }
      provider = body.provider.trim();
      apiKey = body.apiKey;
    } catch (cause) {
      const message =
        cause instanceof CredentialProviderUnknownError ||
        cause instanceof CredentialKeyInvalidError
          ? cause.message
          : "请求体不是合法的连接配置";
      sendJson(res, 400, { error: message });
      return;
    }

    try {
      sendJson(res, 200, {
        providers: await this.options.setup.updateConnection(provider, apiKey),
      });
    } catch (cause) {
      const message =
        cause instanceof CredentialProviderUnknownError ||
        cause instanceof CredentialKeyInvalidError
          ? cause.message
          : "写入 .env 失败";
      sendJson(res, 400, { error: message });
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
      sendJson(res, 405, { error: "method not allowed" });
    } catch (cause) {
      const message =
        cause instanceof CustomProviderInvalidError ||
        cause instanceof CoachSettingsInvalidError
          ? cause.message
          : cause instanceof SyntaxError
            ? "请求体不是合法 JSON"
            : "写入 providers.json 失败";
      sendJson(res, 400, { error: message });
    }
  }
}
