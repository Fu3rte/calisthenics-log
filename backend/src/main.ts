import { createServer, type ServerResponse } from "node:http";
import { createAgentRequestHandler } from "./agent/index.js";
import { ensureAgentDirs, resolveAgentPaths } from "./agent/infrastructure/paths.js";
import { resolveModelSelection } from "./ai/index.js";

const host = "127.0.0.1";
const port = Number(process.env.CHAT_PORT ?? 8787);

/**
 * 只挂对话与会话接口。模型配置的五条路径归 AI 配置层自己注册，合并后接在同一处分发里；
 * 未命中返回 false，最后统一回落 404。
 */
const handleAgent = createAgentRequestHandler({ resolveModel: resolveModelSelection });

function fail(res: ServerResponse, error: unknown): void {
  console.error("[server]", error);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(500, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ error: "服务端处理请求时出错。" }));
}

async function start(): Promise<void> {
  await ensureAgentDirs(resolveAgentPaths());

  createServer((req, res) => {
    handleAgent(req, res).then(
      (agentHandled) => {
        if (agentHandled) return;
        res.writeHead(404, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ error: "not found" }));
      },
      (error) => fail(res, error)
    );
  }).listen(port, host, () => {
    console.log(`后端已就绪 http://${host}:${port}`);
  });
}

void start().catch((error) => {
  console.error("[server] 启动失败", error);
  process.exitCode = 1;
});
