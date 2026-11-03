/**
 * 按钮悬浮提示：只在桌面端挂 tooltip，窄屏（侧栏走抽屉）下直接输出按钮本体。
 */
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

interface HintProps {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}

export function Hint({ label, side = "top", children }: HintProps) {
  const isMobile = useIsMobile();

  if (isMobile) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
