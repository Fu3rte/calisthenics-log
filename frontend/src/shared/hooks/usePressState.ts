/**
 * 按压状态：只维护 [data-pressed]，反馈全交给 CSS。
 */
import { useCallback, useRef, type KeyboardEvent } from "react";

export interface PressStateHandlers {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  onBlur: () => void;
}

export function usePressState<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  const mark = useCallback((pressed: boolean) => {
    const element = ref.current;
    if (!element) return;
    if (pressed) element.dataset.pressed = "true";
    else delete element.dataset.pressed;
  }, []);

  const handlers: PressStateHandlers = {
    onPointerDown: () => mark(true),
    onPointerUp: () => mark(false),
    onPointerLeave: () => mark(false),
    onPointerCancel: () => mark(false),
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") mark(true);
    },
    onKeyUp: (event) => {
      if (event.key === "Enter" || event.key === " ") mark(false);
    },
    onBlur: () => mark(false),
  };

  return { ref, handlers };
}
