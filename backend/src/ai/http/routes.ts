/**
 * 模型配置的 HTTP 接口，挂在主入口的请求分发里。
 * 命中并已响应返回 true，未命中返回 false，交给主入口回落 404。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAiServices, type AiServices } from "../application/services.js";
import { AiConfigError } from "../domain/types.js";
import { createEnvSecretStore } from "../infrastructure/envFile.js";
import { resolveAiPaths } from "../infrastructure/paths.js";
import { createProvidersStore } from "../infrastructure/providersFile.js";

const MAX_BODY_BYTES = 64 * 1024;

/** 业务只用 pathname 与 searchParams，基址固定，避免 Host 头参与 URL 解析 */
const REQUEST_BASE_URL = "http://127.0.0.1";

export type AiRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<boolean>;

export interface AiRequestHandlerOptions {
  /** 测试或嵌入时可注入现成的用例集合，默认按当前目录懒建 */
  services?: AiServices;
}

interface RouteContext {
  services: AiServices;
  url: URL;
  req: IncomingMessage;
}

interface Route {
  path: string;
  methods: string[];
  handle(context: RouteContext): Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new AiConfigError("请求体超过 64KB 上限。", 413);
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new AiConfigError("请求体必须是 JSON 对象。");

  try {
    return JSON.parse(text);
  } catch {
    throw new AiConfigError("请求体不是合法的 JSON。");
  }
}

function normalizePath(pathname: string): string {
  if (pathname.length <= 1) return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function defaultServices(): AiServices {
  const paths = resolveAiPaths();
  return createAiServices({
    providers: createProvidersStore(paths.providersFile),
    secrets: createEnvSecretStore(paths.envFile),
  });
}

const ROUTES: Route[] = [
  {
    path: "/api/models",
    methods: ["GET"],
    async handle({ services }) {
      return services.listCatalog();
    },
  },
  {
    path: "/api/settings/providers",
    methods: ["GET"],
    async handle({ services }) {
      return { providers: await services.listPicker() };
    },
  },
  {
    path: "/api/settings/providers/custom",
    methods: ["PUT", "DELETE"],
    async handle({ services, url, req }) {
      if ((req.method ?? "").toUpperCase() === "DELETE") {
        const id = url.searchParams.get("id")?.trim() ?? "";
        if (!id) throw new AiConfigError("缺少 id 参数。");
        return { providers: await services.removeCustomProvider(id) };
      }
      return { providers: await services.upsertCustomProvider(await readJsonBody(req)) };
    },
  },
  {
    path: "/api/settings/connection",
    methods: ["PUT"],
    async handle({ services, req }) {
      const body = await readJsonBody(req);
      if (!isRecord(body)) throw new AiConfigError("请求体必须是一个 JSON 对象。");
      const provider = typeof body.provider === "string" ? body.provider.trim() : "";
      if (!provider) throw new AiConfigError("缺少 provider 参数。");
      if (body.apiKey !== undefined && typeof body.apiKey !== "string") {
        throw new AiConfigError("apiKey 必须是字符串。");
      }
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
      return {
        providers: await services.setConnection(provider, apiKey),
      };
    },
  },
];

export function createAiRequestHandler(
  options: AiRequestHandlerOptions = {}
): AiRequestHandler {
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

    const route = ROUTES.find((item) => item.path === path);
    if (!route) return false;

    if (!route.methods.includes(method)) {
      res.setHeader("Allow", route.methods.join(", "));
      sendJson(res, 405, { error: "该接口不支持这个请求方法。" });
      return true;
    }

    try {
      const services = options.services ?? defaultServices();
      sendJson(res, 200, await route.handle({ services, url, req }));
    } catch (error) {
      if (error instanceof AiConfigError) {
        sendJson(res, error.status, { error: error.message });
      } else {
        /* 未预期错误只记服务端日志：错误文本里可能带文件绝对路径，不能回给浏览器 */
        console.error("[ai-config]", error);
        sendJson(res, 500, { error: "服务端处理模型配置时出错，请查看本机服务日志。" });
      }
    }
    return true;
  };
}
