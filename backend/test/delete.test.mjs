/**
 * 删除自定义端点：定义与密钥一起消失，内置 provider 不可删。
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CUSTOM_INPUT,
  GATEWAY_KEY,
  cleanupDir,
  loadAi,
  makeAiDir,
  prepareAiDir,
  requestJson,
  resetDir,
  sendJson,
  startAiServer,
} from "../testkit/helpers.mjs";

const dir = makeAiDir("ai-config-delete");
let ai;
let server;

before(async () => {
  await prepareAiDir(dir);
  ai = await loadAi();
  server = await startAiServer(ai.createAiRequestHandler());
});

beforeEach(async () => {
  await resetDir(dir);
});

after(async () => {
  await server.close();
  await cleanupDir(dir);
});

test("删除端点同时清掉密钥，之后解析报未找到 provider", async () => {
  await writeFile(join(dir, ".env"), "KEEP_ME=untouched\n");
  await sendJson(server.baseUrl, "/api/settings/providers/custom", "PUT", CUSTOM_INPUT);
  await sendJson(server.baseUrl, "/api/settings/connection", "PUT", {
    provider: "gateway",
    apiKey: GATEWAY_KEY,
  });

  const removed = await requestJson(
    server.baseUrl,
    "/api/settings/providers/custom?id=gateway",
    { method: "DELETE" }
  );
  assert.equal(removed.status, 200);
  assert.equal(removed.json.providers.some((item) => item.id === "gateway"), false);

  const raw = JSON.parse(await readFile(join(dir, "providers.json"), "utf8"));
  assert.deepEqual(raw.providers, {});

  const envText = await readFile(join(dir, ".env"), "utf8");
  assert.ok(!envText.includes("GATEWAY_API_KEY"));
  assert.ok(envText.includes("KEEP_ME=untouched"));

  const catalog = await requestJson(server.baseUrl, "/api/models");
  assert.equal(catalog.json.models.some((item) => item.provider === "gateway"), false);

  await assert.rejects(
    () => ai.resolveModelSelection("gateway/org/model-x"),
    /未找到 provider「gateway」。/
  );
});

test("删除不存在的自定义 provider 返回 404", async () => {
  const missing = await requestJson(
    server.baseUrl,
    "/api/settings/providers/custom?id=ghost",
    { method: "DELETE" }
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error, "没有这个自定义 provider。");
});

test("内置 provider 不可删除，即使文件里没有覆盖条目", async () => {
  const builtin = await requestJson(
    server.baseUrl,
    "/api/settings/providers/custom?id=deepseek",
    { method: "DELETE" }
  );
  assert.equal(builtin.status, 400);
  assert.match(builtin.json.error, /[\u4e00-\u9fa5]/);

  const catalog = await requestJson(server.baseUrl, "/api/models");
  assert.ok(catalog.json.credentials.some((item) => item.provider === "deepseek"));
});

test("删除时缺 id 参数返回 400", async () => {
  const missingId = await requestJson(
    server.baseUrl,
    "/api/settings/providers/custom",
    { method: "DELETE" }
  );
  assert.equal(missingId.status, 400);
  assert.match(missingId.json.error, /缺少 id 参数/);
});
