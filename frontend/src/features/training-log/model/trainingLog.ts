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
 * 校验：结构契约由 训练日志.schema.json 与 scripts/training_log.py check 把守，
 * 读取端只确认 sessions 是数组（[] 为合法空数据）。
 * ============================================================ */
export function isValidTrainingData(d: unknown): d is TrainingData {
  return (
    !!d && typeof d === "object" && Array.isArray((d as { sessions: unknown }).sessions)
  );
}

/* ============================================================
 * RIR 徽章提取：匹配片段本身即带分隔标点，连字符归一 en-dash
 * ============================================================ */
export interface NoteSplit {
  text: string;
  badge: string | null;
}

export function splitNote(note: string): NoteSplit {
  const m = note.match(/[，、,]?\s*RIR\s*([\d.\-–~]+)/i);
  if (!m) return { text: note, badge: null };
  // 片段自带的分隔标点一并摘掉，避免出现「，；」双标点
  const text = note.replace(m[0], "").replace(/[，、,]?\s*$/, "").trim();
  return { text, badge: "RIR " + m[1].replace(/-/g, "—") };
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
