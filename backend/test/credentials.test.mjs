/**
 * 密钥生命周期与不泄露：写、掩码、断开、删除端点，以及所有响应里都不出现明文。
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

const dir = makeAiDir("ai-config-secret");
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

test("密钥写入后掩码可见，断开后 .env 只删目标行", async () => {
  const envFile = join(dir, ".env");
  await writeFile(envFile, "KEEP_ME=untouched\n# 注释行\n");
  await sendJson(server.baseUrl, "/api/settings/providers/custom", "PUT", CUSTOM_INPUT);

  const written = await sendJson(server.baseUrl, "/api/settings/connection", "PUT", {
    provider: "gateway",
    apiKey: `  ${GATEWAY_KEY}  `,
  });
  assert.equal(written.status, 200);
  const credential = written.json.providers.find((item) => item.provider === "gateway");
  assert.equal(credential.configured, true);
  assert.equal(credential.masked, `••••${GATEWAY_KEY.slice(-4)}`);
  assert.notEqual(credential.masked, GATEWAY_KEY);

  const envText = await readFile(envFile, "utf8");
  assert.ok(envText.includes(`GATEWAY_API_KEY=${GATEWAY_KEY}`), "首尾空白应被去掉后写入");
  assert.ok(envText.includes("KEEP_ME=untouched"));
  assert.ok(envText.includes("# 注释行"));

  const picker = await requestJson(server.baseUrl, "/api/settings/providers");
  assert.equal(
    picker.json.providers.find((item) => item.id === "gateway").configured,
    true
  );

  const disconnected = await sendJson(
    server.baseUrl,
    "/api/settings/connection",
    "PUT",
    { provider: "gateway", apiKey: "   " }
  );
  assert.equal(disconnected.status, 200);
  const after = disconnected.json.providers.find((item) => item.provider === "gateway");
  assert.equal(after.configured, false);
  assert.equal(after.masked, null);

  const clearedText = await readFile(envFile, "utf8");
  assert.ok(!clearedText.includes("GATEWAY_API_KEY"));
  assert.ok(clearedText.includes("KEEP_ME=untouched"));
  assert.ok(clearedText.includes("# 注释行"));

  await assert.rejects(
    () => ai.resolveModelSelection("gateway/org/model-x"),
    /provider「gateway」还没有配置 API Key。/
  );
});

test("进程环境里的同名变量不阻止断开连接", async () => {
  process.env.GATEWAY_API_KEY = GATEWAY_KEY;
  try {
    await sendJson(server.baseUrl, "/api/settings/providers/custom", "PUT", CUSTOM_INPUT);
    await sendJson(server.baseUrl, "/api/settings/connection", "PUT", {
      provider: "gateway",
      apiKey: GATEWAY_KEY,
    });

    const disconnected = await sendJson(
      server.baseUrl,
      "/api/settings/connection",
      "PUT",
      { provider: "gateway", apiKey: "" }
    );
    assert.equal(disconnected.status, 200);
    const credential = disconnected.json.providers.find((item) => item.provider === "gateway");
    assert.equal(credential.configured, false);
    assert.equal(credential.masked, null);

    const envText = await readFile(join(dir, ".env"), "utf8").catch(() => "");
    assert.ok(!envText.includes("GATEWAY_API_KEY"));

    await assert.rejects(
      () => ai.resolveModelSelection("gateway/org/model-x"),
      /provider「gateway」还没有配置 API Key。/
    );
  } finally {
    delete process.env.GATEWAY_API_KEY;
  }
});

test("短密钥只给圆点，不同 provider 各自一行", async () => {
  await writeFile(join(dir, "providers.json"), JSON.stringify({ providers: {} }, null, 2));
  await sendJson(server.baseUrl, "/api/settings/providers/custom", "PUT", {
    ...CUSTOM_INPUT,
    id: "tiny",
    name: "短钥网关",
  });

  const response = await sendJson(server.baseUrl, "/api/settings/connection", "PUT", {
    provider: "tiny",
    apiKey: "abc123",
  });
  const credential = response.json.providers.find((item) => item.provider === "tiny");
  assert.equal(credential.masked, "••••");
  assert.equal(credential.envVar, "TINY_API_KEY");

  const envText = await readFile(join(dir, ".env"), "utf8");
  assert.ok(envText.includes("TINY_API_KEY=abc123"));
});

test("GET 与四个写接口的响应都不包含明文密钥", async () => {
  const secret = `sk-live-${"x".repeat(32)}-9f3a`;
  const texts = [];

  texts.push((await requestJson(server.baseUrl, "/api/models")).text);
  texts.push((await requestJson(server.baseUrl, "/api/settings/providers")).text);
  texts.push(
    (await sendJson(server.baseUrl, "/api/settings/providers/custom", "PUT", CUSTOM_INPUT)).text
  );
  texts.push(
    (await sendJson(server.baseUrl, "/api/settings/connection", "PUT", {
      provider: "gateway",
      apiKey: secret,
    })).text
  );
  texts.push((await requestJson(server.baseUrl, "/api/models")).text);
  texts.push((await requestJson(server.baseUrl, "/api/settings/providers")).text);
  texts.push(
    (
      await sendJson(server.baseUrl, "/api/settings/connection", "PUT", {
        provider: "gateway",
        apiKey: "",
      })
    ).text
  );
  texts.push(
    (await requestJson(server.baseUrl, "/api/settings/providers/custom?id=gateway", {
      method: "DELETE",
    })).text
  );

  for (const text of texts) {
    assert.ok(!text.includes(secret), "响应里出现了明文密钥");
    assert.ok(!text.includes(secret.slice(0, 16)), "响应里出现了密钥前缀");
  }

  const envText = await readFile(join(dir, ".env"), "utf8").catch(() => "");
  assert.ok(!envText.includes(secret), "密钥行应随端点删除一起清掉");
});

test("未知 provider 与非法密钥类型都被拒绝", async () => {
  const missing = await sendJson(server.baseUrl, "/api/settings/connection", "PUT", {
    provider: "nope",
    apiKey: "sk-whatever",
  });
  assert.equal(missing.status, 404);
  assert.match(missing.json.error, /未找到 provider/);

  const badKey = await sendJson(server.baseUrl, "/api/settings/connection", "PUT", {
    provider: "deepseek",
    apiKey: 42,
  });
  assert.equal(badKey.status, 400);
  assert.match(badKey.json.error, /[\u4e00-\u9fa5]/);
});
