/**
 * 训练日志聚合。
 *
 * 不变量由写侧保证：`scripts/training_log.py` 按 `训练日志.schema.json` 校验后才落盘，
 * 前端读时再校验一遍；这里只做排序与裁出给模型的载荷。
 */

export interface SetEntry {
  readonly reps: number;
  readonly note: string;
}

export interface Exercise {
  readonly name: string;
  readonly sets: readonly SetEntry[];
}

export interface Session {
  readonly date: string;
  readonly exercises: readonly Exercise[];
  readonly note: string;
}

export class TrainingLog {
  readonly sessions: readonly Session[];

  private constructor(sessions: readonly Session[]) {
    this.sessions = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  }

  /** 缺 sessions 当成空日志，格式问题在 JSON.parse 那层已经拦下 */
  static from(raw: unknown): TrainingLog {
    return new TrainingLog((raw as { sessions?: Session[] })?.sessions ?? []);
  }

  get isEmpty(): boolean {
    return this.sessions.length === 0;
  }

  /** 交给模型的事实载荷：只带最近 200 次，控制上下文体积 */
  toPayload(): string {
    return JSON.stringify(this.sessions.slice(-200));
  }
}
