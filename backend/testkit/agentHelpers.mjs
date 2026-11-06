/**
 * Agent 层测试辅助：
 * - 会话目录固定在仓库 .tmp/ 下，用 CALISTHENICS_AGENT_DIR 整体覆盖；
 * - 本地 OpenAI Chat Completions 桩服务（127.0.0.1:0），只回协议分块，不伪造业务回答；
 * - SSE 帧读取与直接调用 handler 的小工具。
 * 不访问外网，不触发任何真实模型请求。
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, rmdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startAiServer } from "./helpers.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export const AGENT_DIR_ENV = "CALISTHENICS_AGENT_DIR";

export function makeAgentDir(label = "agent-test") {
  return join(repoRoot, ".tmp", `${label}-${randomUUID().slice(0, 8)}`);
}

/** 三个子目录的路径，与产品 resolveAgentPaths 的布局一致 */
export function agentPaths(dir) {
  return {
    dir,
    sessionsDir: join(dir, "sessions"),
    piDir: join(dir, "pi"),
    workspaceDir: join(dir, "workspace"),
  };
}

/** 重建空目录并设为 CALISTHENICS_AGENT_DIR（产品默认从 env 解析） */
export async function prepareAgentDir(dir) {
  await removeTree(dir);
  for (const sub of ["sessions", "pi", "workspace"]) {
    await mkdir(join(dir, sub), { recursive: true });
  }
  process.env[AGENT_DIR_ENV] = dir;
  return agentPaths(dir);
}

export async function cleanupAgentDir(dir) {
  /* 本机 node 的 unlink/rmdir/rm 被安全删除 shim 接管（走回收站、偶发失败），
     所以清理只尽力而为：删不掉就留下 .tmp 下的临时目录，不影响验收结论。 */
  try {
    await removeTree(dir);
  } catch {
    /* 忽略：测试数据都在 .tmp 内，已 gitignore */
  }
}

async function removeTree(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) {
      await removeTree(target);
    } else {
      await unlink(target);
    }
  }
  await rmdir(path);
}

export async function loadAgent() {
  return import("../dist/agent/index.js");
}

/** Agent handler 与 AI handler 的签名一致，直接复用通用 HTTP 外壳 */
export const startAgentServer = startAiServer;

/** 与 main.ts 一致：handler 返回 false 时回落 404 */
export async function startFallbackServer(handler) {
  const server = createServer((req, res) => {
    handler(req, res).then(
      (handled) => {
        if (handled) return;
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "not found" }));
      },
      (error) => {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: String(error) }));
      }
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/* ------------------------------------------------------------------ */
/* 模型桩                                                              */
/* ------------------------------------------------------------------ */

export function makeStubModel(baseUrl, overrides = {}) {
  const model = {
    id: "stub-model",
    name: "本地桩模型",
    api: "openai-completions",
    provider: "stub",
    baseUrl: `${baseUrl}/v1`,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: false,
    contextWindow: 16384,
    maxTokens: 1024,
    ...overrides,
  };
  return model;
}

/** 注入用：固定返回同一模型与假密钥 */
export function stubResolveModel(model, apiKey = "sk-stub-test-key") {
  return async () => ({ model, apiKey });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sseChunk(delta, finishReason = null) {
  return {
    id: "chatcmpl-stub",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "stub-model",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

/**
 * 起一个 OpenAI Chat Completions 桩。
 *
 * plan(ctx) 拿到 { index, body, raw, headers, record, sendText, sendChunk,
 *                   sendRaw, finish, end, closed }，返回：
 *   - { text: string | string[], chunkDelayMs?, hang?, finishReason? } 由桩自动分块
 *   - { status, error } 非 200 的 JSON 错误
 *   - "manual" 表示 plan 自己写完
 * 省略 plan 时回一段固定文本。
 *
 * 记录：stub.requests 按到达顺序保存 body；stub.events 记录 close/finish；
 * stub.open 保存挂起的响应，stub.releaseAll() 结束它们。
 */
export async function startModelStub(plan = null) {
  const requests = [];
  const events = [];
  const open = new Set();
  const sockets = new Set();

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("error", () => {});
    req.on("end", async () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }

      const index = requests.length;
      const record = {
        index,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
        raw,
        closedByClient: false,
      };
      requests.push(record);

      res.on("close", () => {
        if (!res.writableEnded) {
          record.closedByClient = true;
          events.push({ type: "client-close", index });
        }
      });

      const controller = {
        index,
        body,
        raw,
        headers: req.headers,
        record,
        get closed() {
          return record.closedByClient;
        },
        sendRaw(text) {
          if (!res.writableEnded) res.write(text);
        },
        sendChunk(chunk) {
          controller.sendRaw(`data: ${JSON.stringify(chunk)}\n\n`);
        },
        sendText(text) {
          controller.sendChunk(sseChunk({ content: text }));
        },
        finish(reason = "stop") {
          controller.sendChunk(sseChunk({}, reason));
          controller.sendRaw("data: [DONE]\n\n");
        },
        end() {
          try {
            res.end();
          } catch {
            /* 连接已断开 */
          }
        },
      };

      let spec;
      try {
        spec = plan ? await plan(controller) : {};
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(error) }));
        return;
      }
      if (spec === "manual") return;

      if (spec?.status && spec.status !== 200) {
        res.writeHead(spec.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(spec.error ?? { error: "stub error" }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders?.();

      controller.sendChunk(sseChunk({ role: "assistant", content: "" }));

      const pieces = Array.isArray(spec?.text) ? spec.text : [spec?.text ?? "桩回复"];
      for (const piece of pieces) {
        controller.sendText(piece);
        if (spec?.chunkDelayMs) await delay(spec.chunkDelayMs);
      }

      if (spec?.hang) {
        open.add(controller);
        events.push({ type: "hang", index });
        return;
      }

      controller.finish(spec?.finishReason ?? "stop");
      controller.end();
      events.push({ type: "finish", index });
    });
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    events,
    open,
    releaseAll() {
      for (const controller of open) {
        controller.finish("stop");
        controller.end();
      }
      open.clear();
    },
    async close() {
      for (const controller of open) {
        try {
          controller.end();
        } catch {
          /* ignore */
        }
      }
      open.clear();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/* ------------------------------------------------------------------ */
/* SSE 客户端                                                          */
/* ------------------------------------------------------------------ */

/** 解析 "data: <json>\n\n" 帧；[DONE] 不产出 */
async function* parseFrames(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let cut;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        yield JSON.parse(payload);
      }
    }
  }
}

/** 发 POST /api/chat，返回响应与帧迭代器 */
export async function openChat(baseUrl, body, { signal, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal,
  });
  return {
    status: response.status,
    headers: response.headers,
    response,
    frames: () => parseFrames(response.body),
  };
}

/** 收完整条流：{ status, frames, text } */
export async function collectChat(baseUrl, body, options = {}) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const text = await response.text();
  const frames = [];
  for (const block of text.split("\n\n")) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      frames.push(JSON.parse(payload));
    }
  }
  return { status: response.status, frames, text, headers: response.headers };
}

/** 拼出流里所有 delta 文本 */
export function joinDeltas(frames) {
  return frames
    .filter((frame) => typeof frame.delta === "string")
    .map((frame) => frame.delta)
    .join("");
}

/* ------------------------------------------------------------------ */
/* 文件系统观察                                                        */
/* ------------------------------------------------------------------ */

export async function listSessionFiles(sessionsDir) {
  try {
    return (await readdir(sessionsDir)).filter((name) => name.endsWith(".jsonl")).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

/** 递归列出目录下的文件（相对路径），用于断言工作区未被写入 */
export async function listFilesRecursive(dir) {
  const out = [];
  async function walk(current, prefix) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(current, entry.name), relative);
      } else {
        out.push(relative);
      }
    }
  }
  await walk(dir, "");
  return out.sort();
}

export async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export async function readJsonlHeader(path) {
  const entries = await readJsonl(path);
  return entries[0] ?? null;
}

export async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** 等待条件成立，超时抛错；避免用固定 sleep 猜时序 */
export async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 20, label = "条件" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(intervalMs);
  }
  throw new Error(`等待${label}超时（${timeoutMs}ms）`);
}
