/**
 * 配置面板共用的排版原子：小号大写节标题、行首勾选、说明文字。
 * 结构照 pi-web 的 Settings 分区，颜色只用本项目的黑白令牌。
 */
import type { ReactNode } from "react";

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] leading-[1.35] font-semibold uppercase text-muted-foreground">
      {children}
    </p>
  );
}

export function FieldHint({
  children,
  invalid = false,
}: {
  children: ReactNode;
  invalid?: boolean;
}) {
  return (
    <p
      className={`text-[11.5px] leading-[1.6] ${
        invalid ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {children}
    </p>
  );
}

export function CheckMark({ active }: { active: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={active ? "shrink-0 text-foreground" : "shrink-0 text-transparent"}
    >
      <polyline points="1.5 5 4 7.5 8.5 2.5" />
    </svg>
  );
}
