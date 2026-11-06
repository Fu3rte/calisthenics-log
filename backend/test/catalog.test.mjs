/**
 * 清单与解析：空配置、自定义（含带斜杠的模型 id）与默认模型回落。
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

const dir = makeAiDir("ai-config-catalog");
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

test("空配置：没有可用模型，deepseek 未配置且不泄露", async () => {
  const catalog = await requestJson(server.baseUrl, "/api/models");
  assert.equal(catalog.status, 200);
  assert.deepEqual(catalog.json.models, []);
  assert.equal(catalog.json.defaults.model, "");

  const deepseek = catalog.json.credentials.find((item) => item.provider === "deepseek");
  assert.ok(deepseek);
  assert.equal(deepseek.configured, false);
  assert.equal(deepseek.masked, null);
  assert.equal(deepseek.envVar, "DEEPSEEK_API_KEY");
  assert.equal(deepseek.custom, false);

  await assert.rejects(
    () => ai.resolveModelSelection(),
    /还没有可用的模型：先在模型配置里接入 provider 并填好密钥。/
  );
});

test("自定义端点可重复写入，写密钥后模型可解析", async () => {
  const first = await sendJson(
    server.baseUrl,
    "/api/settings/providers/custom",
    "PUT",
    CUSTOM_INPUT
  );
  assert.equal(first.status, 200);
  const entry = first.json.providers.find((item) => item.id === "gateway");
  assert.ok(entry, "providers 里应出现 gateway");
  assert.equal(entry.modelCount, 1);
  assert.equal(entry.custom, true);
  assert.equal(entry.selectable, true);
  assert.equal(entry.configured, false);

  const second = await sendJson(
    server.baseUrl,
    "/api/settings/providers/custom",
    "PUT",
    CUSTOM_INPUT
  );
  assert.equal(second.status, 200);
  assert.equal(second.json.providers.filter((item) => item.id === "gateway").length, 1);

  const connection = await sendJson(
    server.baseUrl,
    "/api/settings/connection",
    "PUT",
    { provider: "gateway", apiKey: GATEWAY_KEY }
  );
  assert.equal(connection.status, 200);
  const credential = connection.json.providers.find((item) => item.provider === "gateway");
  assert.equal(credential.configured, true);
  assert.equal(credential.masked, `••••${GATEWAY_KEY.slice(-4)}`);

  const catalog = await requestJson(server.baseUrl, "/api/models");
  assert.equal(catalog.status, 200);
  const option = catalog.json.models.find((item) => item.id === "gateway/org/model-x");
  assert.ok(option, "带斜杠的模型 id 应以 provider/org/model-x 呈现");
  assert.equal(option.provider, "gateway");
  assert.equal(option.label, "org/model-x");
  assert.equal(catalog.json.defaults.model, "gateway/org/model-x");

  const selection = await ai.resolveModelSelection("gateway/org/model-x");
  assert.equal(selection.model.id, "org/model-x");
  assert.equal(selection.model.provider, "gateway");
  assert.equal(selection.model.api, "openai-completions");
  assert.equal(selection.model.baseUrl, CUSTOM_INPUT.baseUrl);
  assert.equal(selection.apiKey, GATEWAY_KEY);
  assert.equal(selection.model.contextWindow, 131072);
  assert.equal(selection.model.maxTokens, 8192);
});

test("默认模型：指向可用模型时命中，指向已删除 provider 时回落第一家可用", async () => {
  const providersFile = join(dir, "providers.json");
  const envFile = join(dir, ".env");

  await writeFile(
    providersFile,
    JSON.stringify(
      {
        default: "gateway/org/model-x",
        providers: {
          gateway: {
            name: "本地网关",
            baseUrl: "http://127.0.0.1:8080/v1",
            api: "openai-completions",
            models: [{ id: "org/model-x" }],
          },
        },
      },
      null,
      2
    )
  );
  await writeFile(
    envFile,
    ["DEEPSEEK_API_KEY=sk-deepseek-abcdefgh", `GATEWAY_API_KEY=${GATEWAY_KEY}`, ""].join("\n")
  );

  const picked = await ai.resolveModelSelection();
  assert.equal(picked.model.id, "org/model-x");
  assert.equal(picked.model.provider, "gateway");

  const catalog = await requestJson(server.baseUrl, "/api/models");
  assert.equal(catalog.json.defaults.model, "gateway/org/model-x");

  await writeFile(
    providersFile,
    JSON.stringify({ default: "ghost/model-x", providers: {} }, null, 2)
  );

  const fallback = await ai.resolveModelSelection();
  assert.equal(fallback.model.provider, "deepseek");
  assert.equal(fallback.model.id, "deepseek-flash");
  assert.equal(fallback.apiKey, "sk-deepseek-abcdefgh");

  const fallbackCatalog = await requestJson(server.baseUrl, "/api/models");
  assert.equal(fallbackCatalog.json.defaults.model, "deepseek/deepseek-flash");
});

test("deepseek 内置元数据来自 pi-ai 目录，不编造数值", async () => {
  await writeFile(join(dir, ".env"), "DEEPSEEK_API_KEY=sk-deepseek-abcdefgh\n");

  const catalog = await requestJson(server.baseUrl, "/api/models");
  const ids = catalog.json.models.map((item) => item.id);
  assert.ok(ids.includes("deepseek/deepseek-flash"));
  assert.ok(ids.includes("deepseek/deepseek-v4-pro"));

  const selection = await ai.resolveModelSelection("deepseek/deepseek-v4-pro");
  assert.equal(selection.model.name, "DeepSeek V4 Pro");
  assert.equal(selection.model.baseUrl, "https://api.deepseek.com");
  assert.equal(selection.model.reasoning, true);
  assert.equal(selection.model.contextWindow, 1000000);
  assert.deepEqual(selection.model.input, ["text"]);
  assert.deepEqual(selection.model.cost, {
    input: 1.32,
    output: 3.96,
    cacheRead: 0.044,
    cacheWrite: 0,
  });
});

test("providers.json 里的 deepseek 覆盖 baseUrl，模型元数据仍取内置目录", async () => {
  await writeFile(
    join(dir, "providers.json"),
    JSON.stringify(
      {
        providers: {
          deepseek: {
            baseUrl: "https://proxy.example.com/v1",
            models: [{ id: "deepseek-flash" }, { id: "third-party-model" }],
          },
        },
      },
      null,
      2
    )
  );
  await writeFile(join(dir, ".env"), "DEEPSEEK_API_KEY=sk-deepseek-abcdefgh\n");

  const selection = await ai.resolveModelSelection("deepseek/deepseek-flash");
  assert.equal(selection.model.baseUrl, "https://proxy.example.com/v1");
  assert.equal(selection.model.contextWindow, 1000000);

  const unknown = await ai.resolveModelSelection("deepseek/third-party-model");
  assert.equal(unknown.model.baseUrl, "https://proxy.example.com/v1");
  assert.equal(unknown.model.contextWindow, 131072);
  assert.equal(unknown.model.maxTokens, 8192);
});

test("写入后的 providers.json 结构可被直接读回", async () => {
  await sendJson(server.baseUrl, "/api/settings/providers/custom", "PUT", CUSTOM_INPUT);
  const raw = JSON.parse(await readFile(join(dir, "providers.json"), "utf8"));
  assert.deepEqual(raw.providers.gateway, {
    name: CUSTOM_INPUT.name,
    baseUrl: CUSTOM_INPUT.baseUrl,
    api: "openai-completions",
    models: [{ id: "org/model-x" }],
  });
  assert.equal(raw.providers.gateway.models[0].name, undefined);
});
