const CHEVRON_PATH = {
  left: "M10 3.5 5.5 8 10 12.5",
  right: "M6 3.5 10.5 8 6 12.5",
  up: "M4 9.5 8 5.5 12 9.5",
  down: "M4 6.5 8 10.5 12 6.5",
} as const;

/** 16x16 的箭头，尺寸交给 CSS */
export function Chevron({
  dir,
  className,
}: {
  dir: keyof typeof CHEVRON_PATH;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path
        d={CHEVRON_PATH[dir]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Close({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M3.2 3.2l8.6 8.6M11.8 3.2l-8.6 8.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const EYE_PATH =
  "M2.6 12.4C1.9 11.4 1.5 10.2 1.5 9c0-1.2.4-2.4 1.1-3.4A7.6 7.6 0 0 1 9 2.6a7.6 7.6 0 0 1 6.4 3c.7 1 1.1 2.2 1.1 3.4s-.4 2.4-1.1 3.4";

/** 密钥可见性切换 */
export function Eye({ off = false }: { off?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d={EYE_PATH} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      {off && (
        <path d="M3 15 15 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** 新建会话 */
export function Plus({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 3.4v11.2M3.4 9h11.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 会话栏显隐：双线框 + 左侧分栏，与主导航的收起按钮同一套几何 */
export function PanelLeft({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect
        x="2.2"
        y="3.4"
        width="13.6"
        height="11.2"
        rx="3.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M7 3.8v10.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** 新建对话：方框右上角挑出一支笔 */
export function SquarePen({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9.8 3.1H4.9c-1.16 0-2.1.94-2.1 2.1v7.9c0 1.16.94 2.1 2.1 2.1h7.9c1.16 0 2.1-.94 2.1-2.1V8.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M13.1 2.7a1.76 1.76 0 0 1 2.5 2.5l-6 6-3.1.6.6-3.1 6-6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 发送：上箭头 */
export function ArrowUp({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 14.6V4.2M4.6 8.6 9 4.2l4.4 4.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 停止生成：实心圆角方块 */
export function StopSquare({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}

/** 重命名会话 */
export function Pencil({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="m3.2 14.8.7-3.4 8.2-8.2a1.7 1.7 0 0 1 2.4 0l.3.3a1.7 1.7 0 0 1 0 2.4l-8.2 8.2-3.4.7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="m10.7 4.6 2.7 2.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 删除会话 */
export function Trash({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3.6 5.2h10.8M7.2 5.2V3.9c0-.4.3-.7.7-.7h2.2c.4 0 .7.3.7.7v1.3M5 5.2l.6 8.5c0 .7.6 1.2 1.3 1.2h4.2c.7 0 1.3-.5 1.3-1.2L13 5.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.7 8.4v3.6M10.3 8.4v3.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
