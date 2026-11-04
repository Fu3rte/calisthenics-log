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
