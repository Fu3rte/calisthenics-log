/**
 * 自定义端点输入校验：非法 id、URL、api、空模型与重复模型都返回中文 400。
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CUSTOM_INPUT,
  cleanupDir,
  loadAi,
  makeAiDir,
  prepareAiDir,
  requestJson,
  resetDir,
  sendJson,
  startAiServer,
} from "../testkit/helpers.mjs";

const dir = makeAiDir("ai-config-validation");
let ai;
let server;

const SEED = {
  providers: {
    existing: {
      name: "已存在",
      baseUrl: "http://127.0.0.1:9000/v1",
      api: "openai-completions",
      models: [{ id: "keep-me" }],
    },
  },
};

before(async () => {
  await prepareAiDir(dir);
  ai = await loadAi();
  server = await startAiServer(ai.createAiRequestHandler());
});

beforeEach(async () => {
  await resetDir(dir);
  await writeFile(join(dir, "providers.json"), JSON.stringify(SEED, null, 2));
});

after(async () => {
  await server.close();
  await cleanupDir(dir);
});

const INVALID = [
  ["provider id 大写", { ...CUSTOM_INPUT, id: "Gateway" }],
  ["provider id 数字开头", { ...CUSTOM_INPUT, id: "1gateway" }],
  ["provider id 含空格", { ...CUSTOM_INPUT, id: "bad id" }],
  ["provider id 以连字符开头", { ...CUSTOM_INPUT, id: "-bad" }],
  ["provider id 撞内置", { ...CUSTOM_INPUT, id: "deepseek" }],
  ["显示名为空白", { ...CUSTOM_INPUT, name: "   " }],
  ["baseUrl 不是 http(s)", { ...CUSTOM_INPUT, baseUrl: "ftp://127.0.0.1/v1" }],
  ["baseUrl 不是 URL", { ...CUSTOM_INPUT, baseUrl: "不是地址" }],
  ["api 非 openai-completions", { ...CUSTOM_INPUT, api: "anthropic-messages" }],
  ["models 为空", { ...CUSTOM_INPUT, models: [] }],
  ["模型 id 为空", { ...CUSTOM_INPUT, models: [{ id: "  " }] }],
  [
    "模型 id 重复",
    { ...CUSTOM_INPUT, models: [{ id: "org/model-x" }, { id: " org/model-x " }] },
  ],
];

for (const [label, body] of INVALID) {
  test(`校验失败：${label}`, async () => {
    const response = await sendJson(
      server.baseUrl,
      "/api/settings/providers/custom",
      "PUT",
      body
    );
    assert.equal(response.status, 400, `期望 400，实际 ${response.status}`);
    assert.equal(typeof response.json.error, "string");
    assert.match(response.json.error, /[\u4e00-\u9fa5]/);

    const raw = JSON.parse(await readFile(join(dir, "providers.json"), "utf8"));
    assert.deepEqual(raw, SEED, "校验失败不得改动 providers.json");
  });
}

test("校验失败：请求体不是 JSON", async () => {
  const response = await sendJson(
    server.baseUrl,
    "/api/settings/providers/custom",
    "PUT",
    "不是对象"
  );
  assert.equal(response.status, 400);
  assert.match(response.json.error, /[\u4e00-\u9fa5]/);
});

test("合法输入在已有文件上追加，不清掉别的 provider", async () => {
  const response = await sendJson(
    server.baseUrl,
    "/api/settings/providers/custom",
    "PUT",
    { ...CUSTOM_INPUT, models: [{ id: "org/model-x", name: "自建模型" }] }
  );
  assert.equal(response.status, 200);

  const raw = JSON.parse(await readFile(join(dir, "providers.json"), "utf8"));
  assert.ok(raw.providers.existing, "原有 provider 必须保留");
  assert.deepEqual(raw.providers.gateway.models, [
    { id: "org/model-x", name: "自建模型" },
  ]);
});

test("数字开头 id 的报错写明必须以小写字母开头", async () => {
  const response = await sendJson(
    server.baseUrl,
    "/api/settings/providers/custom",
    "PUT",
    { ...CUSTOM_INPUT, id: "1gateway" }
  );
  assert.equal(response.status, 400);
  assert.match(response.json.error, /必须以小写字母开头/);

  const raw = JSON.parse(await readFile(join(dir, "providers.json"), "utf8"));
  assert.deepEqual(raw, SEED, "校验失败不得改动 providers.json");
});

test("省略 api 字段时按 openai-completions 保存", async () => {
  const { api: _omitted, ...withoutApi } = CUSTOM_INPUT;
  const response = await sendJson(
    server.baseUrl,
    "/api/settings/providers/custom",
    "PUT",
    withoutApi
  );
  assert.equal(response.status, 200);

  const raw = JSON.parse(await readFile(join(dir, "providers.json"), "utf8"));
  assert.equal(raw.providers.gateway.api, "openai-completions");
});

test("文件里数字开头的老条目仍能读到补前缀的密钥", async () => {
  const secret = "sk-legacy-0123456789abcdef";
  await writeFile(
    join(dir, "providers.json"),
    JSON.stringify(
      {
        providers: {
          "1gateway": {
            name: "老网关",
            baseUrl: "http://127.0.0.1:8080/v1",
            api: "openai-completions",
            models: [{ id: "legacy-model" }],
          },
        },
      },
      null,
      2
    )
  );
  await writeFile(join(dir, ".env"), `AI_1GATEWAY_API_KEY=${secret}\n`);

  const selection = await ai.resolveModelSelection("1gateway/legacy-model");
  assert.equal(selection.apiKey, secret);
  assert.equal(selection.model.provider, "1gateway");
  assert.equal(selection.model.id, "legacy-model");

  const catalog = await requestJson(server.baseUrl, "/api/models");
  assert.equal(catalog.status, 200);
  const credential = catalog.json.credentials.find((item) => item.provider === "1gateway");
  assert.equal(credential.envVar, "AI_1GATEWAY_API_KEY");
  assert.equal(credential.configured, true);
  assert.ok(!catalog.text.includes(secret), "响应里不得出现明文密钥");
});
