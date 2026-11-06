/**
 * .env 的单行读写：只动目标变量，其它行原样保留；写入走临时文件 + rename，
 * 权限尽量收到 0o600（Windows 上 chmod 失败静默忽略）。
 */
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SecretStore } from "../application/ports.js";

const LINE_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function nameOf(line: string): string | null {
  const match = LINE_PATTERN.exec(line);
  return match ? match[1] ?? null : null;
}

function valueOf(line: string): string {
  const index = line.indexOf("=");
  if (index < 0) return "";
  const raw = line.slice(index + 1).trim();
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeText(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = join(dirname(file), `.${Date.now()}.${process.pid}.env.tmp`);
  try {
    await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
    await chmod(temporary, 0o600).catch(() => {});
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function splitLines(text: string | null): { lines: string[]; eol: string } {
  const eol = text && text.includes("\r\n") ? "\r\n" : "\n";
  if (!text) return { lines: [], eol };
  return { lines: text.split(/\r?\n/), eol };
}

function joinLines(lines: string[], eol: string): string {
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return `${lines.join(eol)}${eol}`;
}

export function createEnvSecretStore(file: string): SecretStore {
  return {
    async read(name: string): Promise<string | null> {
      const text = await readText(file);
      if (text !== null) {
        for (const line of text.split(/\r?\n/)) {
          if (nameOf(line) !== name) continue;
          const value = valueOf(line);
          if (value) return value;
        }
      }
      // 文件里的值优先；文件未命中时才回落到进程环境（宿主注入的变量）。
      const fallback = process.env[name];
      return fallback && fallback.trim() ? fallback : null;
    },

    async set(name: string, value: string): Promise<void> {
      const { lines, eol } = splitLines(await readText(file));
      const next: string[] = [];
      let written = false;
      for (const line of lines) {
        if (nameOf(line) !== name) {
          next.push(line);
          continue;
        }
        if (!written) {
          next.push(`${name}=${value}`);
          written = true;
        }
      }
      if (!written) next.push(`${name}=${value}`);
      await writeText(file, joinLines(next, eol));
    },

    async delete(name: string): Promise<void> {
      // 读的时候文件优先、进程环境兜底，所以断开连接必须两边都清；
      // 同一进程里 process.env 的旧值否则会让「已断开」仍然 configured。
      delete process.env[name];
      const text = await readText(file);
      if (text === null) return;
      const { lines, eol } = splitLines(text);
      const next = lines.filter((line) => nameOf(line) !== name);
      if (next.length === lines.length) return;
      await writeText(file, joinLines(next, eol));
    },
  };
}
