/**
 * 当前选中会话的 id：只记住「上次看的是哪一段」。
 * 对话正文归服务端 session，浏览器不落历史。
 */

const STORAGE_KEY = "calisthenics.chat.session.v1";
const RAIL_KEY = "calisthenics.chat.rail.v1";

/** 会话侧栏宽度的可拖范围与默认值，拖拽、键盘与读取共用同一组数 */
export const RAIL_WIDTH_MIN = 200;
export const RAIL_WIDTH_MAX = 360;
export const RAIL_WIDTH_DEFAULT = 252;

export interface RailPref {
  open: boolean;
  width: number;
}

export function clampRailWidth(width: number): number {
  if (!Number.isFinite(width)) return RAIL_WIDTH_DEFAULT;
  return Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, Math.round(width)));
}

export function loadSessionId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 隐私模式写不进去就算了，下次回落到列表第一条 */
  }
}

/** 宽容器下会话侧栏是否展开、有多宽；缺字段或脏数据都回落到默认 */
export function loadRailPref(): RailPref {
  const fallback: RailPref = { open: true, width: RAIL_WIDTH_DEFAULT };
  try {
    const raw = localStorage.getItem(RAIL_KEY);
    if (!raw) return fallback;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;

    const { open, width } = parsed as { open?: unknown; width?: unknown };
    return {
      open: typeof open === "boolean" ? open : fallback.open,
      width: typeof width === "number" ? clampRailWidth(width) : fallback.width,
    };
  } catch {
    return fallback;
  }
}

export function saveRailPref(pref: RailPref): void {
  try {
    localStorage.setItem(
      RAIL_KEY,
      JSON.stringify({ open: pref.open, width: clampRailWidth(pref.width) })
    );
  } catch {
    /* 同上：记不住就用默认展开 + 默认宽度 */
  }
}
