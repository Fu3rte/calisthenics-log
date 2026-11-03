/**
 * 训练日志领域模型（前端）
 *
 * 对齐 训练日志.schema.json。sets 兼容旧版纯数字数组与新版 {reps, note} 对象。
 * 只放类型、归一化、形状校验与展示格式化，不碰 IO。
 */

/* ============================================================
 * 类型
 * ============================================================ */
export interface ExerciseSet {
  reps: number;
  note?: string;
}

export interface Exercise {
  name: string;
  sets: Array<number | ExerciseSet>;
}

export interface Session {
  date: string;
  exercises: Exercise[];
  note: string;
}

export interface TrainingData {
  sessions: Session[];
}

/* ============================================================
 * 归一化：纯数字 → {reps}
 * ============================================================ */
export function normalizeSet(s: number | ExerciseSet): ExerciseSet {
  return typeof s === "number" ? { reps: s } : { reps: s.reps, note: s.note };
}

/* ============================================================
 * 校验（缺 sessions 或元素不符形状 → 非法；[] 合法空数据）
 * 只校验形状，不要求键集严格等于 schema（与 scripts/training_log.py check_log 一致）。
 * ============================================================ */
function validSet(r: unknown): r is number | ExerciseSet {
  if (typeof r === "number") return Number.isInteger(r) && r >= 1;
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    const reps = o.reps;
    const note = o.note;
    return (
      typeof reps === "number" &&
      Number.isInteger(reps) &&
      reps >= 1 &&
      (note === undefined || typeof note === "string")
    );
  }
  return false;
}

function validExercise(e: unknown): e is Exercise {
  if (!e || typeof e !== "object") return false;
  const ex = e as Record<string, unknown>;
  return (
    typeof ex.name === "string" &&
    ex.name.length > 0 &&
    Array.isArray(ex.sets) &&
    ex.sets.length > 0 &&
    ex.sets.every(validSet)
  );
}

export function isValidTrainingData(d: unknown): d is TrainingData {
  if (!d || typeof d !== "object") return false;
  const data = d as Record<string, unknown>;
  return (
    Array.isArray(data.sessions) &&
    data.sessions.every((s) => {
      if (!s || typeof s !== "object") return false;
      const session = s as Record<string, unknown>;
      return (
        typeof session.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(session.date) &&
        Array.isArray(session.exercises) &&
        session.exercises.length > 0 &&
        session.exercises.every(validExercise) &&
        typeof session.note === "string"
      );
    })
  );
}

/* ============================================================
 * RIR 徽章提取：RIR\s*([\d.\-–~]+)，连字符归一 en-dash
 * ============================================================ */
export interface NoteSplit {
  text: string;
  badge: string | null;
}

export function splitNote(note: string): NoteSplit {
  if (!note) return { text: "", badge: null };
  const m = note.match(/RIR\s*([\d.\-–~]+)/i);
  if (!m) return { text: note, badge: null };
  const raw = m[1].replace(/-/g, "—");
  // 移除 RIR 片段时一并收拢紧邻的分隔标点，避免出现「，；」双标点
  const rest = note
    .replace(/[，、,]?\s*RIR\s*[\d.\-–~]+/i, "")
    .replace(/[，、,]?\s*$/, "")
    .trim();
  return { text: rest, badge: "RIR " + raw };
}

/* ============================================================
 * 展示用日期格式
 * ============================================================ */
export function fmtMonth(date: string): string {
  return String(Number(date.slice(5, 7)));
}

export function fmtDay(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/* 月份键统一 YYYY-MM（零填充，字典序即时间序） */
export function monthParts(monthKey: string): { year: number; month: number } {
  return {
    year: Number(monthKey.slice(0, 4)),
    month: Number(monthKey.slice(5, 7)),
  };
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/* 月份键 ±n 月；YYYY-MM 字典序即时间序 */
export function shiftMonth(monthKey: string, delta: number): string {
  const { year, month } = monthParts(monthKey);
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function weekdayCN(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
}
