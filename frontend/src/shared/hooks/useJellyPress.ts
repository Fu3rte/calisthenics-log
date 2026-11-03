/**
 * 液态玻璃按压：按下轻微压扁、松手克制回弹。
 *
 * 位移交给 CSS 的 [data-pressed] 处理，这里只管 transform。
 * 幅度压到 0.06、回弹阻尼拉高，只在按下瞬间给一点体积感，不改变版面。
 */
import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { prefersReducedMotion } from "@/shared/hooks/useCountUp";

const PRESS_K = 0.06;
const SPRING_MS = 420;

function jelly(k: number): string {
  if (k < 0.001) return "";
  return `scale(${(1 + k).toFixed(4)}, ${(1 - k * 0.45).toFixed(4)})`;
}

function springEase(t: number): number {
  return 1 - Math.exp(-6 * t) * Math.cos(7 * t);
}

export interface JellyPressHandlers {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  onBlur: () => void;
}

export function useJellyPress<T extends HTMLElement>(intensity = PRESS_K) {
  const ref = useRef<T | null>(null);
  const frame = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  const mark = useCallback((pressed: boolean) => {
    const element = ref.current;
    if (!element) return;
    if (pressed) element.dataset.pressed = "true";
    else delete element.dataset.pressed;
  }, []);

  const press = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    stop();
    mark(true);
    if (prefersReducedMotion()) return;
    element.style.transform = jelly(intensity);
  }, [intensity, mark, stop]);

  const release = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    mark(false);
    if (prefersReducedMotion()) {
      element.style.transform = "";
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SPRING_MS);
      element.style.transform = jelly(intensity * (1 - springEase(t)));
      if (t < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        element.style.transform = "";
        frame.current = null;
      }
    };
    frame.current = requestAnimationFrame(step);
  }, [intensity, mark]);

  useEffect(() => stop, [stop]);

  const handlers: JellyPressHandlers = {
    onPointerDown: press,
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") press();
    },
    onKeyUp: (event) => {
      if (event.key === "Enter" || event.key === " ") release();
    },
    onBlur: release,
  };

  return { ref, handlers };
}
