/**
 * 一条命令起两个进程：先编译后端，再并行跑 API 与 Vite。
 *
 *   npm run dev               前端 + 问答后端
 *   npm run dev:web           只跑 Vite
 *   npm run dev:api           只跑问答后端
 *   npm run preview           预览构建产物（同样带 /api 代理）
 */
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

// 子进程的 cwd 各指向前端包，脚本路径一律给绝对值
const root = path.resolve(import.meta.dirname, "..");
const tscBin = path.join(root, "node_modules/typescript/bin/tsc");
const viteBin = path.join(root, "node_modules/vite/bin/vite.js");

const flags = new Set(process.argv.slice(2));
const preview = flags.has("--preview");
const apiOnly = flags.has("--api-only");

const tsc = spawnSync(
  process.execPath,
  [tscBin, "-p", path.join(root, "backend/tsconfig.json")],
  { stdio: "inherit" }
);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const children = [];
let closing = false;

function run(args, cwd = root) {
  const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env, cwd });
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  children.push(child);
  return child;
}

function stop(code) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exit(code);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

const api = run([path.join(root, "backend/dist/main.js")]);
api.on("exit", (code) => {
  if (!closing && code) stop(code);
});

if (!apiOnly) {
  const vite = run([viteBin, ...(preview ? ["preview"] : [])], path.join(root, "frontend"));
  vite.on("exit", (code) => stop(code ?? 0));
}
