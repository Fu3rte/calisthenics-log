/**
 * 会话管理验收：列表、transcript、重命名、重启后继续、删除。
 * 会话文件全部落在仓库 .tmp/ 下的注入目录，不触碰 backend/.agent-sessions。
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { requestJson, sendJson } from "../testkit/helpers.mjs";
import {
  cleanupAgentDir,
  collectChat,
  exists,
  joinDeltas,
  listSessionFiles,
  loadAgent,
  makeAgentDir,
  makeStubModel,
  prepareAgentDir,
  readJsonl,
  startAgentServer,
  startModelStub,
  stubResolveModel,
} from "../testkit/agentHelpers.mjs";

const dirs = [];

let agent;
let pathsResolved;
let stub;
let server;

before(async () => {
  agent = await loadAgent();
  stub = await startModelStub((ctx) => ({
    text: [`第${ctx.index + 1}轮回答`],
  }));
  server = await startAgentServer(
    agent.createAgentRequestHandler({
      resolveModel: stubResolveModel(makeStubModel(stub.baseUrl)),
    })
  );
});

beforeEach(async () => {
  stub.requests.length = 0;
  stub.events.length = 0;
  stub.open.clear();
  /* 每个用例用全新目录，避免依赖删除旧目录（Windows 上刚写完的文件可能仍被扫描占用） */
  const dir = makeAgentDir("agent-sessions");
  dirs.push(dir);
  pathsResolved = await prepareAgentDir(dir);
});

after(async () => {
  stub?.releaseAll();
  await server?.close();
  await stub?.close();
  for (const dir of dirs) await cleanupAgentDir(dir);
});

async function seedSession(message = "首条用户输入") {
  const result = await collectChat(server.baseUrl, { message });
  assert.equal(result.status, 200, `建会话失败：${result.text}`);
  return { sessionId: result.frames[0].sessionId, frames: result.frames };
}

async function onlySessionFile(sessionsDir) {
  const files = await listSessionFiles(sessionsDir);
  assert.equal(files.length, 1, `应有且只有一个会话文件，实际 ${files}`);
  return resolve(sessionsDir, files[0]);
}

test("1 列表：包含该会话，messageCount > 0，preview 是首条用户输入", async () => {
  const message = "深蹲到底要蹲多深？";
  const { sessionId } = await seedSession(message);

  const response = await requestJson(server.baseUrl, "/api/sessions");
  assert.equal(response.status, 200);
  const sessions = response.json.sessions;
  assert.equal(sessions.length, 1, `列表应只有 1 条，实际 ${JSON.stringify(sessions)}`);

  const item = sessions[0];
  assert.equal(item.id, sessionId);
  assert.equal(item.name, null, "未改名时 name 应为 null");
  assert.equal(item.messageCount, 2, `user + assistant 应计 2 条，实际 ${item.messageCount}`);
  assert.equal(item.preview, message);
  assert.ok(!Number.isNaN(Date.parse(item.createdAt)), "createdAt 应为 ISO 时间");
  assert.ok(!Number.isNaN(Date.parse(item.updatedAt)), "updatedAt 应为 ISO 时间");
  assert.ok(Date.parse(item.updatedAt) >= Date.parse(item.createdAt));
});

test("2 transcript：user/assistant 交替，内容与流式一致且顺序正确", async () => {
  const first = await collectChat(server.baseUrl, { message: "第一问：引体向上怎么练？" });
  const sessionId = first.frames[0].sessionId;

  const second = await collectChat(server.baseUrl, { sessionId, message: "第二问：需要几天？" });
  assert.equal(second.status, 200);

  const response = await requestJson(server.baseUrl, `/api/sessions/${sessionId}/messages`);
  assert.equal(response.status, 200);
  const messages = response.json.messages;

  assert.deepEqual(
    messages.map((message) => message.role),
    ["user", "assistant", "user", "assistant"],
    `应严格交替，实际 ${JSON.stringify(messages)}`
  );
  assert.equal(messages[0].content, "第一问：引体向上怎么练？");
  assert.equal(messages[1].content, joinDeltas(first.frames));
  assert.equal(messages[2].content, "第二问：需要几天？");
  assert.equal(messages[3].content, joinDeltas(second.frames));
});

test("3 transcript 不存在的会话返回 404", async () => {
  const response = await requestJson(server.baseUrl, "/api/sessions/does-not-exist/messages");
  assert.equal(response.status, 404);
  assert.match(response.json.error, /会话不存在/);
});

test("4 重命名：PATCH 返回新名、JSONL 新增 session_info、列表同步；空字符串清空标题", async () => {
  const { sessionId } = await seedSession("改名前的第一句");
  const file = await onlySessionFile(pathsResolved.sessionsDir);

  const renamed = await sendJson(server.baseUrl, `/api/sessions/${sessionId}`, "PATCH", {
    name: "拉力日计划",
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.session.name, "拉力日计划");
  assert.equal(renamed.json.session.id, sessionId);

  const entries = await readJsonl(file);
  const infoEntries = entries.filter((entry) => entry.type === "session_info");
  assert.equal(infoEntries.length, 1, "JSONL 应新增一条 session_info");
  assert.equal(infoEntries[0].name, "拉力日计划");

  const listed = await requestJson(server.baseUrl, "/api/sessions");
  assert.equal(listed.json.sessions[0].name, "拉力日计划");

  const cleared = await sendJson(server.baseUrl, `/api/sessions/${sessionId}`, "PATCH", {
    name: "",
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.session.name, null, "空字符串应把标题清空为 null");

  const listedAgain = await requestJson(server.baseUrl, "/api/sessions");
  assert.equal(listedAgain.json.sessions[0].name, null);

  assert.equal(
    (await readJsonl(file)).filter((entry) => entry.type === "session_info").length,
    2,
    "清空标题应再追加一条 session_info，而不是改写历史"
  );
});

test("5 重命名不存在的会话返回 404", async () => {
  const response = await sendJson(server.baseUrl, "/api/sessions/nope", "PATCH", { name: "x" });
  assert.equal(response.status, 404);

  const bad = await sendJson(server.baseUrl, `/api/sessions/nope`, "PATCH", { name: 42 });
  assert.equal(bad.status, 400);
});

test("6 重启后继续：新 handler 仍能列出会话并带着旧历史继续对话", async () => {
  const first = await collectChat(server.baseUrl, { message: "重启前的第一句" });
  const sessionId = first.frames[0].sessionId;

  /* 销毁第一个 handler 所在的服务，用同一个 CALISTHENICS_AGENT_DIR 重建 */
  await server.close();
  server = await startAgentServer(
    agent.createAgentRequestHandler({
      resolveModel: stubResolveModel(makeStubModel(stub.baseUrl)),
    })
  );

  const listed = await requestJson(server.baseUrl, "/api/sessions");
  assert.equal(listed.status, 200);
  assert.deepEqual(
    listed.json.sessions.map((item) => item.id),
    [sessionId],
    "重启后列表应仍能看到该会话"
  );

  const second = await collectChat(server.baseUrl, {
    sessionId,
    message: "重启后的第二句",
  });
  assert.equal(second.status, 200);
  assert.deepEqual(second.frames[0], { sessionId });
  assert.deepEqual(second.frames.at(-1), { done: true, aborted: false });

  const body = stub.requests.at(-1).body;
  assert.deepEqual(
    body.messages.map((message) => message.role),
    ["system", "user", "assistant", "user"]
  );
  assert.equal(body.messages[1].content[0].text, "重启前的第一句");
  assert.equal(body.messages[2].content, joinDeltas(first.frames));
  assert.equal(body.messages[3].content[0].text, "重启后的第二句");

  const transcript = await requestJson(server.baseUrl, `/api/sessions/${sessionId}/messages`);
  assert.deepEqual(
    transcript.json.messages.map((message) => message.role),
    ["user", "assistant", "user", "assistant"]
  );
});

test("7 删除：{ok:true}、文件消失、列表不含；重复删除 404", async () => {
  const { sessionId } = await seedSession("待删除的会话");
  const file = await onlySessionFile(pathsResolved.sessionsDir);
  assert.ok(await exists(file));

  const removed = await requestJson(server.baseUrl, `/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.json, { ok: true });
  assert.equal(await exists(file), false, "JSONL 文件应被删除");

  const listed = await requestJson(server.baseUrl, "/api/sessions");
  assert.deepEqual(listed.json.sessions, []);

  const again = await requestJson(server.baseUrl, `/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
  assert.equal(again.status, 404);
  assert.match(again.json.error, /会话不存在/);

  /* 删除后同 id 不能继续对话 */
  const chat = await sendJson(server.baseUrl, "/api/chat", "POST", {
    sessionId,
    message: "删除后还想聊",
  });
  assert.equal(chat.status, 404);
});

test("8 列表按会话隔离：两个会话各自独立，preview 取自己的首条用户输入", async () => {
  const a = await seedSession("会话 A 的第一句");
  const b = await seedSession("会话 B 的第一句");

  const listed = await requestJson(server.baseUrl, "/api/sessions");
  assert.equal(listed.json.sessions.length, 2);

  const byId = new Map(listed.json.sessions.map((item) => [item.id, item]));
  assert.equal(byId.get(a.sessionId).preview, "会话 A 的第一句");
  assert.equal(byId.get(b.sessionId).preview, "会话 B 的第一句");
  assert.equal(byId.get(a.sessionId).messageCount, 2);
  assert.equal(byId.get(b.sessionId).messageCount, 2);

  const transcriptA = await requestJson(server.baseUrl, `/api/sessions/${a.sessionId}/messages`);
  const transcriptB = await requestJson(server.baseUrl, `/api/sessions/${b.sessionId}/messages`);
  assert.equal(transcriptA.json.messages[0].content, "会话 A 的第一句");
  assert.equal(transcriptB.json.messages[0].content, "会话 B 的第一句");
  assert.equal(transcriptA.json.messages.length, 2);
  assert.equal(transcriptB.json.messages.length, 2);
});
