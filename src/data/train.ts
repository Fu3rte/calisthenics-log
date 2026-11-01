/**
 * 数据层 —— 训练日志.json（唯一事实源，Vite JSON import）
 * 派生规则见 设计计划.md 第 3 节；动作分类映射硬编码于本文件。
 */
import rawTrainingData from "../../训练日志.json";

/* ============================================================
 * 类型（对齐 训练日志.schema.json）
 * ============================================================ */
export interface Exercise {
  name: string;
  sets: number[];
}

export interface Session {
  date: string;
  exercises: Exercise[];
  note: string;
}

export interface TrainingData {
  sessions: Session[];
}

export type Category = "pull" | "push" | "other";
export type Filter = "all" | Category;

/* ============================================================
 * 动作分类映射：引体向上/高位引体 → 拉；双杠臂屈伸/单杠臂屈伸 → 推；未命中归「其他」
 * ============================================================ */
const CATEGORY_MAP: Record<string, Category> = {
  引体向上: "pull",
  高位引体: "pull",
  双杠臂屈伸: "push",
  单杠臂屈伸: "push",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  pull: "拉",
  push: "推",
  other: "其他",
};

export function catOf(name: string): Category {
  return Object.prototype.hasOwnProperty.call(CATEGORY_MAP, name)
    ? CATEGORY_MAP[name]
    : "other";
}

/* ============================================================
 * 校验（缺 sessions 或元素不符 schema 形状 → 非法；[] 合法空数据）
 * ============================================================ */
function validExercise(e: unknown): e is Exercise {
  if (!e || typeof e !== "object") return false;
  const ex = e as Record<string, unknown>;
  return (
    typeof ex.name === "string" &&
    ex.name.length > 0 &&
    Array.isArray(ex.sets) &&
    ex.sets.length > 0 &&
    ex.sets.every(
      (r) =>
        typeof r === "number" && isFinite(r) && r >= 1 && r === Math.round(r)
    )
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

export const TRAINING_DATA: TrainingData = rawTrainingData as TrainingData;
export const DATA_VALID = isValidTrainingData(TRAINING_DATA);
export const SESSIONS: Session[] = DATA_VALID ? TRAINING_DATA.sessions : [];

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
  const raw = m[1].replace(/-/g, "\u2013");
  // 移除 RIR 片段时一并收拢紧邻的分隔标点，避免出现「，；」双标点
  const rest = note
    .replace(/[，、,]?\s*RIR\s*[\d.\-–~]+/i, "")
    .replace(/[，、,]?\s*$/, "")
    .trim();
  return { text: rest, badge: "RIR " + raw };
}

/* ============================================================
 * 展平：每组一根柱
 * ============================================================ */
export interface Bar {
  date: string;
  name: string;
  reps: number;
  cat: Category;
  structure: string;
  setIndex: number;
  sessionIndex: number;
}

export function flatten(sessions: Session[]): Bar[] {
  const bars: Bar[] = [];
  sessions.forEach((s, sessionIndex) => {
    s.exercises.forEach((ex) => {
      const c = catOf(ex.name);
      const structure = ex.sets.join("\u00b7");
      ex.sets.forEach((reps, i) => {
        bars.push({
          date: s.date,
          name: ex.name,
          reps,
          cat: c,
          structure,
          setIndex: i,
          sessionIndex,
        });
      });
    });
  });
  return bars;
}

export const ALL_BARS: Bar[] = flatten(SESSIONS);

/* ============================================================
 * 筛选切片（派生指标）
 * ============================================================ */
export interface SessionBlock {
  date: string;
  exercises: { name: string; sets: number[]; cat: Category }[];
  note: string;
  volume: number;
}

export interface CompRow {
  name: string;
  reps: number;
  cat: Category;
}

export interface View {
  bars: Bar[];
  sessions: SessionBlock[];
  stats: {
    sessions: number;
    reps: number;
    sets: number;
    avg: number;
    record: number;
    recordBar: Bar | null;
  };
  comp: CompRow[];
  balance: {
    pull: number;
    push: number;
    pullPct: number;
    pushPct: number;
  };
  cal: Record<string, number>;
  notes: NoteSplitWithDate[];
}

export interface NoteSplitWithDate extends NoteSplit {
  date: string;
}

export function computeView(filter: Filter): View {
  const bars = ALL_BARS.filter((b) => filter === "all" || b.cat === filter);

  /* 按 session / 动作组织明细（保留组次结构顺序） */
  const sessions: SessionBlock[] = [];
  SESSIONS.forEach((s) => {
    const exercises: SessionBlock["exercises"] = [];
    let volume = 0;
    s.exercises.forEach((ex) => {
      const c = catOf(ex.name);
      if (filter !== "all" && c !== filter) return;
      if (!exercises.some((e) => e.name === ex.name)) {
        exercises.push({ name: ex.name, sets: ex.sets.slice(), cat: c });
      }
      ex.sets.forEach((r) => {
        volume += r;
      });
    });
    if (exercises.length > 0) {
      sessions.push({ date: s.date, exercises, note: s.note, volume });
    }
  });

  let reps = 0;
  let maxReps = 0;
  let recordBar: Bar | null = null;
  bars.forEach((b) => {
    reps += b.reps;
    if (b.reps > maxReps) {
      maxReps = b.reps;
      recordBar = b;
    }
  });

  /* 动作构成 */
  const compMap = new Map<string, CompRow>();
  bars.forEach((b) => {
    const row = compMap.get(b.name) ?? { name: b.name, reps: 0, cat: b.cat };
    row.reps += b.reps;
    compMap.set(b.name, row);
  });
  const comp = [...compMap.values()].sort((a, b) => b.reps - a.reps);

  /* 推拉平衡 */
  let pull = 0;
  let push = 0;
  bars.forEach((b) => {
    if (b.cat === "pull") pull += b.reps;
    else if (b.cat === "push") push += b.reps;
  });
  const total = pull + push;
  const pullPct = total ? (pull / total) * 100 : 0;
  const pushPct = total ? (push / total) * 100 : 0;

  /* 日历当日总量 */
  const cal: Record<string, number> = {};
  bars.forEach((b) => {
    cal[b.date] = (cal[b.date] ?? 0) + b.reps;
  });

  /* 备注 */
  const notes = sessions
    .filter((s) => s.note)
    .map((s) => ({ date: s.date, ...splitNote(s.note) }));

  return {
    bars,
    sessions,
    stats: {
      sessions: sessions.length,
      reps,
      sets: bars.length,
      avg: bars.length ? reps / bars.length : 0,
      record: maxReps,
      recordBar,
    },
    comp,
    balance: { pull, push, pullPct, pushPct },
    cal,
    notes,
  };
}

/* 展示用格式 */
export function fmtShort(date: string): string {
  return date.slice(5);
}

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

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function weekdayCN(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
}

export function fmtAvg(avg: number): string {
  return (Math.round(avg * 10) / 10).toFixed(1);
}
