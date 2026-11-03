import type { TrainingLog } from "./TrainingLog.js";

/** 出站端口：训练日志的来源（文件、数据库、缓存都行） */
export interface TrainingLogRepository {
  load(): Promise<TrainingLog>;
}
