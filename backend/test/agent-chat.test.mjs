/**
 * 对话链路验收：新建会话、历史权威、模型未配置、取消、并发、
 * 工具收紧、ephemeral、参数校验。
 * 全部请求打到本地桩服务，不访问外网、不请求真实模型。
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestJson, sendJson } from "../testkit/helpers.mjs";
import {
  cleanupAgentDir,
  collectChat,
  joinDeltas,
  listFilesRecursive,
  listSessionFiles,
  loadAgent,
  makeAgentDir,
  makeStubModel,
  openChat,
  prepareAgentDir,
  readJsonl,
  startAgentServer,
  startFallbackServer,
  startModelStub,
  stubResolveModel,
  waitFor,
} from "../testkit/agentHelpers.mjs";

const dirs = [];

let agent;
let pathsResolved;
let stub;
let server;
/** 每个用例可覆盖桩行为；null 表示默认按请求序号回一段文本 */
let behavior = null;

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

before(async () => {
  agent = await loadAgent();
  stub = await startModelStub(async (ctx) => {
    if (behavior) return behavior(ctx);
    return { text: [`桩回复${ctx.index + 1}`] };
  });
  const model = makeStubModel(stub.baseUrl);
  server = await startAgentServer(
    agent.createAgentRequestHandler({ resolveModel: stubResolveModel(model) })
  );
});

beforeEach(async () => {
  behavior = null;
  /* 桩是跨用例共享的，清空记录让每个用例从 0 开始计数 */
  stub.requests.length = 0;
  stub.events.length = 0;
  stub.open.clear();
  /* 每个用例用全新目录，避免依赖删除旧目录（Windows 上刚写完的文件可能仍被扫描占用） */
  const dir = makeAgentDir("agent-chat");
  dirs.push(dir);
  pathsResolved = await prepareAgentDir(dir);
});

after(async () => {
  stub?.releaseAll();
  await server?.close();
  await stub?.close();
  for (const dir of dirs) await cleanupAgentDir(dir);
});

/** 建一个已完成一轮的会话，返回 { sessionId, frames } */
async function seedSession(message = "建立会话的一句") {
  const result = await collectChat(server.baseUrl, { message });
  assert.equal(result.status, 200, `建会话失败：${result.text}`);
  const sessionId = result.frames[0]?.sessionId;
  assert.ok(sessionId, "首帧必须带 sessionId");
  return { sessionId, frames: result.frames };
}

test("1 新建会话：首帧 sessionId、delta、done，JSONL header 的 cwd 是 workspace", async () => {
  const result = await collectChat(server.baseUrl, { message: "第一次对话" });

  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-type"), "text/event-stream; charset=utf-8");

  const first = result.frames[0];
  assert.deepEqual(Object.keys(first), ["sessionId"], "第一帧只能有 sessionId");
  assert.match(first.sessionId, /^[0-9a-z-]{8,}$/i);

  const deltas = result.frames.filter((frame) => typeof frame.delta === "string");
  assert.ok(deltas.length >= 1, `应收到 delta，实际帧：${JSON.stringify(result.frames)}`);
  assert.equal(joinDeltas(result.frames), "桩回复1");
  assert.deepEqual(result.frames.at(-1), { done: true, aborted: false });

  const files = await listSessionFiles(pathsResolved.sessionsDir);
  assert.equal(files.length, 1, `sessions 下应只有一个 jsonl，实际 ${files}`);
  assert.ok(
    files[0].includes(first.sessionId),
    `文件名应包含会话 id：${files[0]} vs ${first.sessionId}`
  );

  const entries = await readJsonl(resolve(pathsResolved.sessionsDir, files[0]));
  const header = entries[0];
  assert.equal(header.type, "session");
  assert.equal(header.id, first.sessionId);
  assert.equal(
    resolve(header.cwd),
    resolve(pathsResolved.workspaceDir),
    "header.cwd 必须是注入的 workspace 目录"
  );
});

test("2 会话是历史权威：第二轮请求体带上一轮 user/assistant，且忽略客户端伪造历史", async () => {
  const first = await collectChat(server.baseUrl, { message: "历史问题一" });
  const sessionId = first.frames[0].sessionId;

  const second = await collectChat(server.baseUrl, {
    sessionId,
    message: "历史问题二",
    /* 客户端伪装的字段，服务端必须忽略，历史只能来自 JSONL */
    messages: [
      { role: "user", content: "伪造历史：我上次卧推 100kg" },
      { role: "assistant", content: "伪造回答：已完成" },
    ],
    history: ["伪造历史：我上次卧推 100kg"],
  });

  assert.equal(second.status, 200);
  assert.deepEqual(second.frames[0], { sessionId });

  assert.equal(stub.requests.length, 2, "两轮应各打一次模型");
  const body = stub.requests[1].body;

  assert.deepEqual(
    body.messages.map((message) => message.role),
    ["system", "user", "assistant", "user"],
    "第二轮请求体应是 system + 上一轮 user/assistant + 本轮 user"
  );
  assert.equal(body.messages[1].content[0].text, "历史问题一");
  assert.equal(body.messages[2].content, "桩回复1");
  assert.equal(body.messages[3].content[0].text, "历史问题二");

  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes("伪造历史"), "客户端伪造的历史不得进入模型请求");
  assert.ok(!serialized.includes("伪造回答"), "客户端伪造的回答不得进入模型请求");
});

test("3 模型未配置：400 + 原文案，且不落任何 jsonl", async () => {
  const failure = Object.assign(
    new Error("还没有可用的模型：先在模型配置里接入 provider 并填好密钥。"),
    { status: 400 }
  );
  const isolated = await startFallbackServer(
    agent.createAgentRequestHandler({
      resolveModel: async () => {
        throw failure;
      },
    })
  );

  try {
    const response = await sendJson(isolated.baseUrl, "/api/chat", "POST", {
      message: "没有模型时的一问",
    });
    assert.equal(response.status, 400);
    assert.equal(
      response.json.error,
      "还没有可用的模型：先在模型配置里接入 provider 并填好密钥。"
    );
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");

    assert.deepEqual(
      await listSessionFiles(pathsResolved.sessionsDir),
      [],
      "解析模型失败时不得创建会话文件"
    );
  } finally {
    await isolated.close();
  }
});

test("4 取消与流生命周期：中途断开不产生未捕获异常，同会话随后可继续", async () => {
  const unhandled = [];
  const onRejection = (error) => unhandled.push(["unhandledRejection", error]);
  const onException = (error) => unhandled.push(["uncaughtException", error]);
  process.on("unhandledRejection", onRejection);
  process.on("uncaughtException", onException);

  behavior = () => ({ text: ["第一段", "第二段"], chunkDelayMs: 10, hang: true });
  const controller = new AbortController();
  let sessionId = null;

  try {
    const chat = await openChat(
      server.baseUrl,
      { message: "请连续输出两段" },
      { signal: controller.signal }
    );
    assert.equal(chat.status, 200);

    const deltas = [];
    for await (const frame of chat.frames()) {
      if (frame.sessionId) sessionId = frame.sessionId;
      if (typeof frame.delta === "string") deltas.push(frame.delta);
      if (deltas.length >= 2) break;
    }
    assert.deepEqual(deltas, ["第一段", "第二段"], "断开前应收到两个 delta");
    assert.ok(sessionId);

    controller.abort();
    await waitFor(() => stub.events.some((event) => event.type === "client-close"), {
      label: "桩观察到客户端断开",
      timeoutMs: 5000,
    });
    await sleep(150);

    assert.deepEqual(unhandled, [], `断开后出现未捕获异常：${unhandled.map(String)}`);

    /* 桩恢复正常，同一会话紧接着再发一次 */
    behavior = () => ({ text: ["恢复正常"] });
    const deadline = Date.now() + 5000;
    let second = null;
    while (Date.now() < deadline) {
      second = await collectChat(
        server.baseUrl,
        { sessionId, message: "继续一句" },
        { signal: AbortSignal.timeout(4000) }
      );
      if (second.status !== 409) break;
      await sleep(50);
    }

    assert.equal(second.status, 200, `中止后同会话应能继续，实际 ${second?.status}：${second?.text}`);
    assert.deepEqual(second.frames.at(-1), { done: true, aborted: false });
    assert.ok(joinDeltas(second.frames).includes("恢复正常"));
  } finally {
    process.off("unhandledRejection", onRejection);
    process.off("uncaughtException", onException);
  }
});

test("5 取消后子进程 stderr 没有 Unhandled，进程正常退出", async () => {
  const childPath = fileURLToPath(new URL("../testkit/agentAbortChild.mjs", import.meta.url));
  const child = spawn(process.execPath, [childPath], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const code = await new Promise((done, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`子进程超时未退出。stdout=${stdout} stderr=${stderr}`));
    }, 30000);
    child.on("error", reject);
    child.on("exit", (exitCode) => {
      clearTimeout(timer);
      done(exitCode);
    });
  });

  assert.equal(code, 0, `子进程应以 0 退出。stdout=${stdout} stderr=${stderr}`);
  assert.doesNotMatch(stderr, /Unhandled|unhandledRejection|uncaughtException/i, `stderr 含未捕获异常：${stderr}`);

  const marker = stdout.split("\n").find((line) => line.startsWith("CHILD_RESULT "));
  assert.ok(marker, `子进程应输出结果标记。stdout=${stdout}`);
  const result = JSON.parse(marker.slice("CHILD_RESULT ".length));
  assert.equal(result.deltasBeforeAbort, 2);
  assert.equal(result.closedByClient, true, "服务端应感知客户端断开");
  assert.equal(result.secondStatus, 200);
  assert.equal(result.secondDone, true);
  assert.equal(result.secondAborted, false);
});

test("6 并发：同一会话同时只跑一个，第二个得到 409", async () => {
  const { sessionId } = await seedSession("并发用例的第一句");

  behavior = () => ({ text: [], hang: true });
  const controller = new AbortController();
  const slow = await openChat(
    server.baseUrl,
    { sessionId, message: "占用中的一句" },
    { signal: controller.signal }
  );
  assert.equal(slow.status, 200);

  const iterator = slow.frames();
  const head = await iterator.next();
  assert.deepEqual(head.value, { sessionId }, "长请求应先发出 sessionId 帧");

  const conflict = await sendJson(server.baseUrl, "/api/chat", "POST", {
    sessionId,
    message: "插队的一句",
  });
  assert.equal(conflict.status, 409, `并发应返回 409，实际 ${conflict.status}`);
  assert.match(conflict.json.error, /正在回答/);
  assert.equal(stub.requests.length, 2, "被拒的第二个请求不应打到模型");

  controller.abort();
  await waitFor(() => stub.events.some((event) => event.type === "client-close"), {
    label: "桩观察到被中止的长请求断开",
    timeoutMs: 5000,
  });
});

test("7 工具与资源收紧：无 tools 声明、system 不含 AGENTS.md 协议、工作区不被写入", async () => {
  const result = await collectChat(server.baseUrl, { message: "请帮我读一下训练日志" });
  assert.equal(result.status, 200);

  const body = stub.requests[0].body;
  assert.equal(body.tools, undefined, `请求体不应声明 tools，实际 ${JSON.stringify(body.tools)}`);
  assert.equal(body.tool_choice, undefined, "请求体不应有 tool_choice");
  assert.deepEqual(
    Object.keys(body).filter((key) => /tool/i.test(key)),
    [],
    `请求体不应出现工具相关字段，实际 ${Object.keys(body)}`
  );

  const system = body.messages[0];
  assert.equal(system.role, "system");
  assert.match(system.content, /街健训练助手/);
  assert.ok(!system.content.includes("街健记录协议"), "system 提示不得包含 AGENTS.md 的记录协议");
  assert.ok(!system.content.includes("AGENTS.md"), "system 提示不得包含 AGENTS.md 字样");
  assert.ok(!/bash|read_file|write_file|shell/i.test(system.content), "system 提示不得声明 shell/文件工具");

  assert.deepEqual(
    await listFilesRecursive(pathsResolved.workspaceDir),
    [],
    "对话不得向 workspace 写入任何文件"
  );
});

test("8 ephemeral：没有 session 帧、不新增文件、列表条数不变", async () => {
  const listBefore = await requestJson(server.baseUrl, "/api/sessions");
  assert.equal(listBefore.status, 200);
  const filesBefore = await listSessionFiles(pathsResolved.sessionsDir);

  const result = await collectChat(server.baseUrl, {
    message: "临时探针一句",
    ephemeral: true,
  });

  assert.equal(result.status, 200);
  assert.ok(
    !result.frames.some((frame) => "sessionId" in frame),
    `ephemeral 不应有 sessionId 帧：${JSON.stringify(result.frames)}`
  );
  assert.ok(joinDeltas(result.frames).length > 0, "临时运行仍应收到 delta");
  assert.deepEqual(result.frames.at(-1), { done: true, aborted: false });

  assert.equal(stub.requests.length, 1, "临时运行仍要真实请求一次");
  assert.deepEqual(await listSessionFiles(pathsResolved.sessionsDir), filesBefore, "不得新增会话文件");

  const after = await requestJson(server.baseUrl, "/api/sessions");
  assert.equal(after.json.sessions.length, listBefore.json.sessions.length, "列表条数不变");
});

test("9 参数校验：空 message 400、会话不存在 404、GET /api/chat 405、未知路径交回主入口", async () => {
  const empty = await sendJson(server.baseUrl, "/api/chat", "POST", { message: "   " });
  assert.equal(empty.status, 400);
  assert.match(empty.json.error, /请输入要发送的内容/);

  const missing = await sendJson(server.baseUrl, "/api/chat", "POST", {
    sessionId: "00000000-0000-0000-0000-000000000000",
    message: "会话不存在",
  });
  assert.equal(missing.status, 404);
  assert.match(missing.json.error, /会话不存在/);

  const wrongMethod = await requestJson(server.baseUrl, "/api/chat");
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");

  /* handler 对未知路径返回 false，由主入口回落 404 */
  const handler = agent.createAgentRequestHandler({
    resolveModel: stubResolveModel(makeStubModel(stub.baseUrl)),
  });
  const handled = await handler({ url: "/api/nope", method: "GET" }, {});
  assert.equal(handled, false);

  const fallback = await startFallbackServer(handler);
  try {
    const notFound = await requestJson(fallback.baseUrl, "/api/nope");
    assert.equal(notFound.status, 404);
  } finally {
    await fallback.close();
  }

  assert.equal(stub.requests.length, 0, "以上失败请求都不应打到模型");
});
