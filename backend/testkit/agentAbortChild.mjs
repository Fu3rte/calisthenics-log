/**
 * 取消场景的子进程夹具：在独立进程里跑完整链路，父进程据此检查
 * 1) 客户端断开后进程仍存活并正常退出；2) stderr 没有未捕获异常字样。
 * 只作为夹具被 test/agent-chat.test.mjs 启动，不会被 node --test 收集。
 */
import {
  cleanupAgentDir,
  collectChat,
  listSessionFiles,
  loadAgent,
  makeAgentDir,
  makeStubModel,
  openChat,
  prepareAgentDir,
  startFallbackServer,
  startModelStub,
  stubResolveModel,
  waitFor,
} from "./agentHelpers.mjs";

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

const dir = makeAgentDir("agent-abort-child");
const result = {
  deltasBeforeAbort: 0,
  closedByClient: false,
  secondStatus: null,
  secondDone: false,
  secondAborted: null,
  sessionFiles: [],
};

let stub;
let server;

try {
  const paths = await prepareAgentDir(dir);
  stub = await startModelStub((ctx) =>
    ctx.index === 0
      ? { text: ["子进程第一段", "子进程第二段"], chunkDelayMs: 10, hang: true }
      : { text: ["子进程恢复"] }
  );
  const agent = await loadAgent();
  server = await startFallbackServer(
    agent.createAgentRequestHandler({
      resolveModel: stubResolveModel(makeStubModel(stub.baseUrl)),
    })
  );

  const controller = new AbortController();
  const chat = await openChat(
    server.baseUrl,
    { message: "子进程里先输出两段" },
    { signal: controller.signal }
  );

  let sessionId = null;
  for await (const frame of chat.frames()) {
    if (frame.sessionId) sessionId = frame.sessionId;
    if (typeof frame.delta === "string") {
      result.deltasBeforeAbort += 1;
    }
    if (result.deltasBeforeAbort >= 2) break;
  }

  controller.abort();
  await waitFor(() => stub.events.some((event) => event.type === "client-close"), {
    label: "子进程桩观察到断开",
    timeoutMs: 8000,
  });
  result.closedByClient = true;
  await sleep(150);

  const deadline = Date.now() + 6000;
  let second = null;
  while (Date.now() < deadline) {
    second = await collectChat(
      server.baseUrl,
      { sessionId, message: "子进程继续" },
      { signal: AbortSignal.timeout(4000) }
    );
    if (second.status !== 409) break;
    await sleep(50);
  }

  result.secondStatus = second.status;
  const last = second.frames.at(-1);
  result.secondDone = last?.done === true;
  result.secondAborted = last?.aborted ?? null;
  result.sessionFiles = await listSessionFiles(paths.sessionsDir);

  console.log(`CHILD_RESULT ${JSON.stringify(result)}`);
} catch (error) {
  console.error(`CHILD_FAILED ${error?.stack ?? error}`);
  process.exitCode = 1;
} finally {
  stub?.releaseAll();
  await server?.close();
  await stub?.close();
  await cleanupAgentDir(dir);
}
