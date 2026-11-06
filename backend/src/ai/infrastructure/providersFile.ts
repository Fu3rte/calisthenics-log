/**
 * providers.json 的读写：缺失即空配置；非法 JSON 抛清晰错误且绝不覆盖原文件。
 * 写入走临时文件 + rename，避免半截文件。
 */
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AiConfigError, type ProvidersDocument } from "../domain/types.js";
import type { ProvidersStore } from "../application/ports.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 错误文案只暴露文件名，不把本机绝对路径带到前端 */
function normalizeDocument(parsed: unknown): ProvidersDocument {
  if (!isRecord(parsed)) {
    throw new AiConfigError("providers.json 的结构不对，顶层必须是对象。", 500);
  }
  const rawProviders = parsed.providers;
  if (rawProviders !== undefined && !isRecord(rawProviders)) {
    throw new AiConfigError("providers.json 的 providers 字段必须是对象。", 500);
  }
  const doc: ProvidersDocument = {
    providers: (rawProviders as ProvidersDocument["providers"]) ?? {},
  };
  if (typeof parsed.default === "string") doc.default = parsed.default;
  return doc;
}

export function createProvidersStore(file: string): ProvidersStore {
  return {
    async read(): Promise<ProvidersDocument> {
      let raw: string;
      try {
        raw = await readFile(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { providers: {} };
        throw error;
      }

      if (!raw.trim()) return { providers: {} };

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new AiConfigError(
          "providers.json 不是合法的 JSON，请修正或删除该文件后重试。",
          500
        );
      }
      return normalizeDocument(parsed);
    },

    async write(doc: ProvidersDocument): Promise<void> {
      await mkdir(dirname(file), { recursive: true });
      const temporary = join(dirname(file), `.${Date.now()}.${process.pid}.providers.tmp`);
      const payload = `${JSON.stringify(doc, null, 2)}\n`;
      try {
        await writeFile(temporary, payload, { encoding: "utf8", mode: 0o600 });
        await rename(temporary, file);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        throw error;
      }
    },
  };
}
