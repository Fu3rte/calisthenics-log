import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 构建时把训练日志拷进 dist，使线上看板从同源 fetch 到最新数据。
function copyTrainingLog() {
  return {
    name: "copy-training-log",
    apply: "build" as const,
    closeBundle() {
      const src = path.resolve(__dirname, "训练日志.json");
      if (!fs.existsSync(src)) return;
      const dest = path.resolve(__dirname, "dist/训练日志.json");
      fs.copyFileSync(src, dest);
    },
  };
}

const CHAT_SERVER = "http://127.0.0.1:8787";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), copyTrainingLog()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // 单页应用：index.html 承载侧栏路由；chat.html 只是旧地址的重定向壳
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        chat: path.resolve(__dirname, "chat.html"),
      },
    },
  },
  // 问答后端独立进程，dev 与 preview 都转发到它
  // .env 与 providers.json 由配置面板在服务端改写，前端不读它们；不忽略就会每次保存都触发 dev 重启
  server: {
    proxy: { "/api": CHAT_SERVER },
    watch: { ignored: ["**/.env", "**/.env.*", "**/providers.json"] },
  },
  preview: { proxy: { "/api": CHAT_SERVER } },
});
