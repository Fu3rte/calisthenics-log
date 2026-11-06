/**
 * 会话侧栏的状态机：展开状态、拖拽宽度、容器宽窄判定。
 *
 * 宽度只在手势结束（松手 / 键盘调节 / 双击复位）后落盘，拖动过程只改内存，
 * 避免每帧写 localStorage；展开状态的切换是离散动作，直接写。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import {
  RAIL_WIDTH_DEFAULT,
  RAIL_WIDTH_MAX,
  RAIL_WIDTH_MIN,
  clampRailWidth,
  loadRailPref,
  saveRailPref,
} from "@/features/coach-chat/api/sessionPrefs";

/** 松手后等一小会儿再写：键盘连按时也不会一次一写 */
const SAVE_DELAY = 180;
const STEP = 16;

export interface ChatRailController {
  open: boolean;
  width: number;
  /** 容器够宽（与 CSS 的 760px 断点同源），窄容器不渲染拖拽条 */
  wide: boolean;
  resizing: boolean;
  toggle: () => void;
  resetWidth: () => void;
  beginResize: (event: ReactPointerEvent<HTMLElement>) => void;
  handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export function useChatRail(surfaceRef: RefObject<HTMLDivElement | null>): ChatRailController {
  const [initial] = useState(loadRailPref);
  const [open, setOpen] = useState(initial.open);
  const [width, setWidth] = useState(initial.width);
  const [resizing, setResizing] = useState(false);
  const [wide, setWide] = useState(false);

  const openRef = useRef(open);
  const widthRef = useRef(width);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  /* 宽窄判定交给 CSS：断点命中时 .chat-surface 上会写 --chat-surface-wide，
     JS 读同一个标记，就不用在这里再抄一份 760 */
  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;

    const read = () => {
      const flag = getComputedStyle(element).getPropertyValue("--chat-surface-wide").trim();
      setWide(flag === "1");
    };

    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [surfaceRef]);

  const write = useCallback(() => {
    saveRailPref({ open: openRef.current, width: widthRef.current });
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      write();
    }, SAVE_DELAY);
  }, [write]);

  /* 卸载时把还没写的那次补上，刷新前不丢宽度 */
  useEffect(
    () => () => {
      if (saveTimer.current === null) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      write();
    },
    [write]
  );

  const applyWidth = useCallback((next: number) => {
    const clamped = clampRailWidth(next);
    widthRef.current = clamped;
    setWidth(clamped);
  }, []);

  const setWidthAndSave = useCallback(
    (next: number) => {
      applyWidth(next);
      scheduleSave();
    },
    [applyWidth, scheduleSave]
  );

  const toggle = useCallback(() => {
    const next = !openRef.current;
    openRef.current = next;
    setOpen(next);
    /* 展开/收起是一次性动作，连同当前宽度立刻记下 */
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    write();
  }, [write]);

  const resetWidth = useCallback(() => {
    setWidthAndSave(RAIL_WIDTH_DEFAULT);
  }, [setWidthAndSave]);

  const beginResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      /* 挡住拖拽起手的文本选择 */
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = widthRef.current;
      setResizing(true);

      const onMove = (move: PointerEvent) => {
        applyWidth(startWidth + move.clientX - startX);
      };

      const finish = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        setResizing(false);
        scheduleSave();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [applyWidth, scheduleSave]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setWidthAndSave(widthRef.current - STEP);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setWidthAndSave(widthRef.current + STEP);
      } else if (event.key === "Home") {
        event.preventDefault();
        setWidthAndSave(RAIL_WIDTH_MIN);
      } else if (event.key === "End") {
        event.preventDefault();
        setWidthAndSave(RAIL_WIDTH_MAX);
      }
    },
    [setWidthAndSave]
  );

  return {
    open,
    width,
    wide,
    resizing,
    toggle,
    resetWidth,
    beginResize,
    handleKeyDown,
  };
}
