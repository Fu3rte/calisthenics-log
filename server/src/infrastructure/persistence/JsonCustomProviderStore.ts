/**
 * 自定义 provider 定义的落盘：项目根 providers.json（已 gitignore，属本机数据）。
 * 只存端点与模型 id，密钥一律走 .env，不进这个文件。
 */
import { existsSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { CustomProviderStore } from "../../application/ports/CustomProviderStore.js";
import {
  parseCustomProviderFile,
  toCustomProviderFile,
  type CustomProvider,
} from "../../domain/coaching/CustomProviders.js";

export class JsonCustomProviderStore implements CustomProviderStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<CustomProvider[]> {
    if (!existsSync(this.filePath)) return [];
    const raw = await readFile(this.filePath, "utf8").catch(() => null);
    if (raw === null) return [];
    return parseCustomProviderFile(JSON.parse(raw));
  }

  save(list: readonly CustomProvider[]): void {
    writeFileSync(this.filePath, `${JSON.stringify(toCustomProviderFile(list), null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}
