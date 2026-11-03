import { readFile } from "node:fs/promises";
import { TrainingLog } from "../../domain/training/TrainingLog.js";
import type { TrainingLogRepository } from "../../domain/training/TrainingLogRepository.js";

export class TrainingLogUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingLogUnavailableError";
  }
}

/** 从磁盘读 训练日志.json，解析与校验交给聚合 */
export class JsonTrainingLogRepository implements TrainingLogRepository {
  constructor(private readonly filePath: string) {}

  async load(): Promise<TrainingLog> {
    const raw = await readFile(this.filePath, "utf8").catch(() => null);
    if (raw === null) {
      throw new TrainingLogUnavailableError(`读不到训练日志：${this.filePath}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new TrainingLogUnavailableError("训练日志不是合法 JSON");
    }

    try {
      return TrainingLog.from(parsed);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new TrainingLogUnavailableError(`训练日志格式不对：${detail}`);
    }
  }
}
