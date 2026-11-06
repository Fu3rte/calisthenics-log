/**
 * 测试辅助：临时数据目录、真实 HTTP 服务与请求封装。
 * 所有数据目录都落在仓库根 .tmp/ 下，绝不触碰 backend/ 里的真实配置。
 * 放在 test/ 之外，避免被 node --test 当成测试文件执行。
 */
import { randomUUID } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export function makeAiDir(label = "ai-config-test") {
  return join(repoRoot, ".tmp", `${label}-${randomUUID().slice(0, 8)}`);
}

/** 重建空目录并把它设为 CALISTHENICS_AI_DIR */
export async function prepareAiDir(dir) {
  await resetDir(dir);
  process.env.CALISTHENICS_AI_DIR = dir;
  return dir;
}

export async function resetDir(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

export async function cleanupDir(dir) {
  await rm(dir, { recursive: true, force: true });
}

export async function loadAi() {
  return import("../dist/ai/index.js");
}

export async function startAiServer(handler) {
  const server = createServer((req, res) => {
    handler(req, res).then(
      (handled) => {
        if (handled) return;
        res.writeHead(418, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "未命中 AI 配置路由" }));
      },
      (error) => {
        res.writeHead(599, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: String(error) }));
      }
    );
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json, headers: response.headers };
}

export function sendJson(baseUrl, path, method, body) {
  return requestJson(baseUrl, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 用 node:http 发请求，可自定义 Host 等受限请求头（fetch 不允许改 Host） */
export function rawRequest(baseUrl, path, { method = "GET", headers = {}, body } = {}) {
  const target = new URL(`${baseUrl}${path}`);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, text, json, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export const CUSTOM_INPUT = {
  id: "gateway",
  name: "本地网关",
  baseUrl: "http://127.0.0.1:8080/v1",
  api: "openai-completions",
  models: [{ id: "org/model-x" }],
};

export const GATEWAY_KEY = "sk-gateway-0123456789abcdef";
