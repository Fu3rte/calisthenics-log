/**
 * 主入口冒烟：真实进程里对话与会话接口可达，模型配置接口此时仍归 AI 分支（未挂载 → 404），
 * 未知路径回落 404。数据目录全部指向 .tmp/，不碰 backend/ 里的真实配置与训练数据。
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupDir, makeAiDir, requestJson, resetDir } from "../testkit/helpers.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const entry = join(repoRoot, "backend/dist/main.js");
const aiDir = makeAiDir("main-smoke-ai");
const agentDir = makeAiDir("main-smoke-agent");

let child = null;
let baseUrl = "";

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** 轮询直到服务应答或超时；超时把子进程输出带进错误里，便于定位 */
async function waitForServer(port, logs) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/sessions`);
      if (response.ok) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`主入口没有在 15s 内就绪：\n${logs.join("")}`);
}

before(async () => {
  await resetDir(aiDir);
  await resetDir(agentDir);

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      CHAT_PORT: String(port),
      CALISTHENICS_AI_DIR: aiDir,
      CALISTHENICS_AGENT_DIR: agentDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));

  await waitForServer(port, logs);
});

after(async () => {
  if (child) {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", resolve);
    });
  }
  await cleanupDir(aiDir);
  await cleanupDir(agentDir);
});

test("主入口的会话列表可达且初始为空", async () => {
  const response = await requestJson(baseUrl, "/api/sessions");
  assert.equal(response.status, 200, `实际 ${response.status}：${response.text}`);
  assert.deepEqual(response.json.sessions, []);
});

test("模型配置接口此时未挂载，由主入口回落 404", async () => {
  const models = await requestJson(baseUrl, "/api/models");
  assert.equal(models.status, 404);

  const providers = await requestJson(baseUrl, "/api/settings/providers");
  assert.equal(providers.status, 404);
});

test("未知路径仍由主入口回落 404", async () => {
  const response = await requestJson(baseUrl, "/api/unknown-path");
  assert.equal(response.status, 404);
  assert.equal(response.json.error, "not found");
});
