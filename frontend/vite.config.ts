import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const LOG_FILE = path.resolve(__dirname, "../backend/训练日志.json");
const LOG_URL = "/训练日志.json";
const LOG_URL_ENCODED = `/${encodeURIComponent(LOG_URL.slice(1))}`;

// 训练日志归后端所有：dev 用中间件按需回原文（改完 JSON 刷新即生效），build 拷进 dist。
function trainingLogAsset(): Plugin {
  let building = false;
  const read = () => (fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE) : null);

  return {
    name: "training-log-asset",
    configResolved(config) {
      building = config.command === "build";
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (pathname !== LOG_URL && pathname !== LOG_URL_ENCODED) {
          next();
          return;
        }
        const raw = read();
        if (raw === null) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(raw);
      });
    },
    closeBundle() {
      if (!building) return;
      const raw = read();
      if (raw === null) return;
      fs.writeFileSync(path.resolve(__dirname, "dist/训练日志.json"), raw);
    },
  };
}

const CHAT_SERVER = "http://127.0.0.1:8787";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), trainingLogAsset()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // 问答后端独立进程，dev 与 preview 都转发到它
  server: { proxy: { "/api": CHAT_SERVER } },
  preview: { proxy: { "/api": CHAT_SERVER } },
});
