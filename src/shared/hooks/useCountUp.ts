import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function hasGsap(): boolean {
  return typeof gsap !== "undefined" && typeof gsap.to === "function";
}

/**
 * 数字 count-up（GSAP）。首次挂载从 0 计数（带入场 delay），
 * 之后随 value 变化从当前显示值计到新值；reduced-motion / GSAP 失败直出终态。
 */
export function useCountUp(value: number, decimals = 0, delay = 0) {
  const ref = useRef<HTMLSpanElement>(null);
  const displayed = useRef(0);
  const isFirst = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fmt = (v: number) =>
      decimals ? v.toFixed(decimals) : String(Math.round(v));
    const from = displayed.current;
    const to = value;

    if (prefersReducedMotion() || !hasGsap() || from === to) {
      el.textContent = fmt(to);
      displayed.current = to;
      isFirst.current = false;
      return;
    }

    const d = isFirst.current ? delay : 0;
    isFirst.current = false;
    el.textContent = fmt(from);

    try {
      const proxy = { v: from };
      const tw = gsap.to(proxy, {
        v: to,
        duration: 0.55,
        delay: d,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = fmt(proxy.v);
          displayed.current = proxy.v;
        },
        onComplete: () => {
          el.textContent = fmt(to);
          displayed.current = to;
        },
      });
      return () => {
        tw.kill();
      };
    } catch {
      el.textContent = fmt(to);
      displayed.current = to;
    }
  }, [value, decimals, delay]);

  return ref;
}
