import type { ComponentProps, Ref, RefObject } from "react";
import { cn } from "@/shared/lib/utils";
import { useJellyPress, type JellyPressHandlers } from "@/shared/hooks/useJellyPress";

export type GlassVariant = "glass" | "ink" | "quiet";

const VARIANTS: Record<GlassVariant, string> = {
  glass:
    "border border-black/[0.07] bg-white/60 text-foreground/80 hover:border-black/[0.1] hover:bg-white/90 hover:text-foreground",
  ink: "bg-[var(--ink)] text-white hover:bg-[#111113]",
  quiet: "text-foreground/70 hover:bg-black/[0.05] hover:text-foreground",
};

interface PressableProps {
  variant?: GlassVariant;
  /** 果冻压扁幅度，默认 0.1；小控件用 0.06 */
  intensity?: number;
}

type PressKey = keyof JellyPressHandlers;
type PressHandler = (event: never) => void;

const PRESS_KEYS = [
  "onPointerDown",
  "onPointerUp",
  "onPointerLeave",
  "onPointerCancel",
  "onKeyDown",
  "onKeyUp",
  "onBlur",
] as const satisfies readonly PressKey[];

/**
 * asChild 的 radix 组件（tooltip、popover）会把同名事件塞进 props，
 * 直接展开会让按压与提示只剩一个，这里串成两个都跑。
 */
function sharePress(
  press: JellyPressHandlers,
  outer: Record<string, unknown>
): JellyPressHandlers {
  const merged: Record<PressKey, unknown> = { ...press };
  for (const key of PRESS_KEYS) {
    const incoming = outer[key] as PressHandler | undefined;
    if (!incoming) continue;
    const current = press[key] as PressHandler;
    merged[key] = (event: never) => {
      current(event);
      incoming(event);
    };
  }
  return merged as JellyPressHandlers;
}

function bindRefs<T>(refs: readonly (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const target of refs) {
      if (typeof target === "function") target(node);
      else if (target) (target as RefObject<T | null>).current = node;
    }
  };
}

export function GlassButton({
  variant = "glass",
  intensity,
  className,
  type = "button",
  ref,
  ...props
}: PressableProps & ComponentProps<"button">) {
  const { ref: pressRef, handlers } = useJellyPress<HTMLButtonElement>(intensity);

  return (
    <button
      type={type}
      {...props}
      ref={bindRefs([pressRef, ref])}
      {...sharePress(handlers, props)}
      className={cn("lg-surface", VARIANTS[variant], className)}
    />
  );
}

export function GlassLink({
  variant = "glass",
  intensity,
  className,
  ref,
  ...props
}: PressableProps & ComponentProps<"a">) {
  const { ref: pressRef, handlers } = useJellyPress<HTMLAnchorElement>(intensity);

  return (
    <a
      {...props}
      ref={bindRefs([pressRef, ref])}
      {...sharePress(handlers, props)}
      className={cn("lg-surface", VARIANTS[variant], className)}
    />
  );
}
