import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.CHAT_PORT ?? 8787);

createServer((_req, res) => {
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "not found" }));
}).listen(port, host, () => {
  console.log(`后端已就绪 http://${host}:${port}`);
});
