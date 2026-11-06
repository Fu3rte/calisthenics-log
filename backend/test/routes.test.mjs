/**
 * 路由契约：未命中不吞请求、方法不符 405、坏 providers.json 报错且不覆盖。
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupDir,
  loadAi,
  makeAiDir,
  prepareAiDir,
  rawRequest,
  requestJson,
  resetDir,
  startAiServer,
} from "../testkit/helpers.mjs";

const dir = makeAiDir("ai-config-routes");
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

test("未知路径返回 false，由主入口回落 404", async () => {
  const response = await requestJson(server.baseUrl, "/api/unknown");
  assert.equal(response.status, 418);
  assert.equal(response.json.error, "未命中 AI 配置路由");

  const root = await requestJson(server.baseUrl, "/");
  assert.equal(root.status, 418);
});

test("方法不符返回 405 并带 Allow 头", async () => {
  const custom = await requestJson(server.baseUrl, "/api/settings/providers/custom");
  assert.equal(custom.status, 405);
  assert.equal(custom.headers.get("allow"), "PUT, DELETE");
  assert.match(custom.json.error, /不支持这个请求方法/);

  const connection = await requestJson(server.baseUrl, "/api/settings/connection");
  assert.equal(connection.status, 405);

  const models = await requestJson(server.baseUrl, "/api/models", { method: "DELETE" });
  assert.equal(models.status, 405);
  assert.equal(models.headers.get("allow"), "GET");
});

test("所有响应都是 application/json; charset=utf-8", async () => {
  const cases = [
    await requestJson(server.baseUrl, "/api/models"),
    await requestJson(server.baseUrl, "/api/settings/providers"),
    await requestJson(server.baseUrl, "/api/settings/providers/custom"),
  ];
  for (const response of cases) {
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  }
});

test("尾斜杠可访问同一接口", async () => {
  const response = await requestJson(server.baseUrl, "/api/models/");
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.models, []);
});

test("坏的 providers.json 报清晰错误且不被覆盖", async () => {
  const providersFile = join(dir, "providers.json");
  const broken = '{ "providers": { "gateway": ';
  await writeFile(providersFile, broken);

  const response = await requestJson(server.baseUrl, "/api/models");
  assert.equal(response.status, 500);
  assert.match(response.json.error, /不是合法的 JSON/);
  assert.match(response.json.error, /providers\.json/);
  assert.match(response.json.error, /请修正或删除该文件后重试/);
  assert.ok(
    !response.json.error.includes(providersFile) && !response.json.error.includes(dir),
    "错误信息不得包含本机绝对路径"
  );

  assert.equal(await readFile(providersFile, "utf8"), broken, "不得覆盖损坏的文件");

  await assert.rejects(() => ai.resolveModelSelection(), /不是合法的 JSON/);
});

test("providers.json 顶层结构错误也只报文件名", async () => {
  const providersFile = join(dir, "providers.json");
  await writeFile(providersFile, "[]");

  const response = await requestJson(server.baseUrl, "/api/models");
  assert.equal(response.status, 500);
  assert.match(response.json.error, /providers\.json 的结构不对/);
  assert.ok(
    !response.json.error.includes(providersFile) && !response.json.error.includes(dir),
    "错误信息不得包含本机绝对路径"
  );
});

test("未预期错误只回固定文案，不带错误原文与本机路径", async () => {
  /* 目录冒充配置文件：读失败抛 EISDIR，属非预期错误，走兜底分支 */
  await mkdir(join(dir, "providers.json"));

  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await requestJson(server.baseUrl, "/api/models");
    assert.equal(response.status, 500);
    assert.equal(
      response.json.error,
      "服务端处理模型配置时出错，请查看本机服务日志。"
    );
    assert.ok(!response.text.includes("EISDIR"), "不得回传错误原文");
    assert.ok(
      !response.text.includes(dir) && !response.text.includes("\\\\"),
      "不得回传本机路径"
    );
  } finally {
    console.error = originalError;
  }
});

test("兜底分支：错误原文带绝对路径时也不回给浏览器", async () => {
  /* 注入一份必定抛出带路径错误的用例集合，正面验证兜底不许透传原文 */
  const absolute = join(dir, "providers.json");
  const leaking = new Error(`ENOENT: no such file or directory, open '${absolute}'`);
  const handler = ai.createAiRequestHandler({
    services: {
      async listCatalog() {
        throw leaking;
      },
    },
  });

  const stub = await startAiServer(handler);
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const response = await requestJson(stub.baseUrl, "/api/models");
    assert.equal(response.status, 500);
    assert.equal(
      response.json.error,
      "服务端处理模型配置时出错，请查看本机服务日志。"
    );
    assert.ok(!response.text.includes(absolute), "不得回传本机路径");
    assert.ok(!response.text.includes("ENOENT"), "不得回传错误原文");
    assert.equal(logged.length, 1, "原文应进服务端日志");
    assert.equal(logged[0][0], "[ai-config]");
    assert.equal(logged[0][1], leaking);
  } finally {
    console.error = originalError;
    await stub.close();
  }
});

test("畸形 Host 头不会让 handler 抛出未捕获异常", async () => {
  let unhandled = null;
  const onUnhandled = (error) => {
    unhandled = error;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    const response = await rawRequest(server.baseUrl, "/api/models", {
      headers: { Host: "bad host" },
    });
    assert.equal(response.status, 200, `期望 200，实际 ${response.status}：${response.text}`);
    assert.ok(Array.isArray(response.json.models));

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(unhandled, null, "不应出现 unhandledRejection");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});
