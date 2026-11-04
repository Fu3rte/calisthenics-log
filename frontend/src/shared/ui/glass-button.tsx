import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { usePressState } from "@/shared/hooks/usePressState";

export type GlassVariant = "glass" | "ink" | "quiet";

const VARIANTS: Record<GlassVariant, string> = {
  glass:
    "border border-black/[0.07] bg-white/60 text-foreground/80 hover:border-black/[0.1] hover:bg-white/90 hover:text-foreground",
  ink: "bg-[var(--ink)] text-white hover:bg-[#111113]",
  quiet: "text-foreground/70 hover:bg-black/[0.05] hover:text-foreground",
};

export function GlassButton({
  variant = "glass",
  className,
  type = "button",
  ...props
}: { variant?: GlassVariant } & ComponentProps<"button">) {
  const { ref, handlers } = usePressState<HTMLButtonElement>();

  return (
    <button
      type={type}
      {...props}
      ref={ref}
      {...handlers}
      className={cn("lg-surface", VARIANTS[variant], className)}
    />
  )
}
