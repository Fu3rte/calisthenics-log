/**
 * 自定义 provider 定义的落盘：backend/providers.json（已 gitignore，属本机数据）。
 * 只存端点与模型 id，密钥一律走 .env，不进这个文件。
 */
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { CustomProviderStore } from "../../application/ports/CustomProviderStore.js";
import {
  parseCustomProvider,
  type CustomProvider,
} from "../../domain/coaching/CustomProviders.js";

export class JsonCustomProviderStore implements CustomProviderStore {
  constructor(private readonly filePath: string) {}

  /** 整份数组直接落盘，id 就在元素里 */
  async load(): Promise<CustomProvider[]> {
    const raw = await readFile(this.filePath, "utf8").catch(() => null);
    return raw === null
      ? []
      : (JSON.parse(raw) as unknown[]).map(parseCustomProvider);
  }

  save(list: readonly CustomProvider[]): void {
    writeFileSync(this.filePath, `${JSON.stringify(list, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}
