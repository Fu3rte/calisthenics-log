/**
 * 训练日志聚合。
 *
 * 不变量：日期为 YYYY-MM-DD；组次为正整数；每条记录至少一个动作、每个动作至少一组；
 * 备注为字符串（可为空）。构造只能走 `TrainingLog.from`，外部拿不到半合法数据。
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

export class TrainingLogInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingLogInvalidError";
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toSet(raw: unknown): SetEntry {
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < 1) {
      throw new TrainingLogInvalidError(`组次必须是正整数，收到 ${raw}`);
    }
    return { reps: raw, note: "" };
  }
  if (raw && typeof raw === "object") {
    const entry = raw as Record<string, unknown>;
    const reps = entry.reps;
    const note = entry.note ?? "";
    if (typeof reps !== "number" || !Number.isInteger(reps) || reps < 1) {
      throw new TrainingLogInvalidError("组次必须是正整数");
    }
    if (typeof note !== "string") {
      throw new TrainingLogInvalidError("组备注必须是字符串");
    }
    return { reps, note };
  }
  throw new TrainingLogInvalidError("组次必须是数字或 {reps, note}");
}

function toExercise(raw: unknown): Exercise {
  if (!raw || typeof raw !== "object") {
    throw new TrainingLogInvalidError("动作必须是对象");
  }
  const exercise = raw as Record<string, unknown>;
  if (typeof exercise.name !== "string" || exercise.name.length === 0) {
    throw new TrainingLogInvalidError("动作名不能为空");
  }
  if (!Array.isArray(exercise.sets) || exercise.sets.length === 0) {
    throw new TrainingLogInvalidError(`动作 ${exercise.name} 没有组次`);
  }
  return { name: exercise.name, sets: exercise.sets.map(toSet) };
}

function toSession(raw: unknown): Session {
  if (!raw || typeof raw !== "object") {
    throw new TrainingLogInvalidError("训练记录必须是对象");
  }
  const session = raw as Record<string, unknown>;
  if (typeof session.date !== "string" || !DATE_PATTERN.test(session.date)) {
    throw new TrainingLogInvalidError("记录日期必须是 YYYY-MM-DD");
  }
  if (!Array.isArray(session.exercises) || session.exercises.length === 0) {
    throw new TrainingLogInvalidError(`${session.date} 没有动作`);
  }
  if (typeof session.note !== "string") {
    throw new TrainingLogInvalidError(`${session.date} 的备注必须是字符串`);
  }
  return {
    date: session.date,
    exercises: session.exercises.map(toExercise),
    note: session.note,
  };
}

export class TrainingLog {
  readonly sessions: readonly Session[];

  private constructor(sessions: readonly Session[]) {
    this.sessions = sessions;
  }

  static empty(): TrainingLog {
    return new TrainingLog([]);
  }

  /** 从 JSON 形状构造，逐层校验不变量 */
  static from(raw: unknown): TrainingLog {
    if (!raw || typeof raw !== "object") {
      throw new TrainingLogInvalidError("训练日志必须是对象");
    }
    const payload = raw as Record<string, unknown>;
    if (!Array.isArray(payload.sessions)) {
      throw new TrainingLogInvalidError("训练日志缺少 sessions 数组");
    }
    const sessions = payload.sessions.map(toSession);
    sessions.sort((a, b) => a.date.localeCompare(b.date));
    return new TrainingLog(sessions);
  }

  get isEmpty(): boolean {
    return this.sessions.length === 0;
  }

  get latest(): Session | undefined {
    return this.sessions[this.sessions.length - 1];
  }

  /** 最近 count 次训练，按时间升序 */
  recent(count: number): readonly Session[] {
    return this.sessions.slice(-count);
  }

  /** 交给模型的事实载荷：只带最近 count 次，控制上下文体积 */
  toPayload(count = 200): string {
    return JSON.stringify(this.recent(count));
  }
}
