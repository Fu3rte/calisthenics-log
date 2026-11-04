import { readFile } from "node:fs/promises";
import { TrainingLog } from "../../domain/training/TrainingLog.js";
import type { TrainingLogRepository } from "../../domain/training/TrainingLogRepository.js";

/** 从磁盘读 训练日志.json；结构由写侧的 schema 校验保证，这里只解析 */
export class JsonTrainingLogRepository implements TrainingLogRepository {
  constructor(private readonly filePath: string) {}

  async load(): Promise<TrainingLog> {
    const raw = await readFile(this.filePath, "utf8").catch(() => null);
    if (raw === null) {
      throw new Error(`读不到训练日志：${this.filePath}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("训练日志不是合法 JSON");
    }

    return TrainingLog.from(parsed);
  }
}
