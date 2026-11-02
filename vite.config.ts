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

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), copyTrainingLog()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
