/**
 * 主导航侧栏：品牌、页面切换、折叠。
 *
 * 动效（GSAP）：选中指示器在条目间滑动，换页用带回弹的曲线，
 * 折叠时与栏宽同一条缓动；reduced-motion 下直出。
 */
import { useId, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { routeHref, useRoute, type AppRoute } from "@/app/router";
import { useChatSettings } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import { prefersReducedMotion } from "@/shared/hooks/prefersReducedMotion";
import { GlassButton } from "@/shared/ui/glass-button";
import { Close } from "@/shared/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import {
  SIDEBAR_PADDING,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_ICON,
  SIDEBAR_WIDTH_MOBILE,
  Sidebar,
  useSidebar,
} from "@/shared/ui/sidebar";

interface NavEntry {
  id: AppRoute;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const NAV: NavEntry[] = [
  {
    id: "chat",
    label: "训练问答",
    description: "只读日志的教练",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M2.8 6.1a3.3 3.3 0 0 1 3.3-3.3h5.8a3.3 3.3 0 0 1 3.3 3.3v3.1a3.3 3.3 0 0 1-3.3 3.3H7.6l-3.4 2.4a.5.5 0 0 1-.8-.4v-2.1a3.3 3.3 0 0 1-.6-1.9V6.1Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="6.7" cy="7.6" r="0.95" fill="currentColor" />
        <circle cx="9.3" cy="7.6" r="0.95" fill="currentColor" />
        <circle cx="11.9" cy="7.6" r="0.95" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "training",
    label: "训练日志",
    description: "日历与逐组明细",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect
          x="2.6"
          y="4"
          width="12.8"
          height="11.4"
          rx="3.2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M2.9 7.7h12.2M6.1 2.6v2.6M11.9 2.6v2.6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="6.4" cy="11" r="1" fill="currentColor" />
        <circle cx="9" cy="11" r="1" fill="currentColor" />
        <circle cx="11.6" cy="11" r="1" fill="currentColor" />
      </svg>
    ),
  },
];

/** 收起态才挂 tooltip：展开时条目自带文字，窄屏抽屉同理用不上 */
function SideHint({
  label,
  side,
  children,
}: {
  label: string;
  side: "top" | "bottom";
  children: React.ReactNode;
}) {
  const { state, isMobile } = useSidebar();
  if (state === "expanded" || isMobile) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

function NavRow({
  entry,
  active,
  onNavigate,
}: {
  entry: NavEntry;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <SideHint label={entry.label} side="bottom">
      <a
        href={routeHref(entry.id)}
        data-active={active}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className="sidebar-menu-button focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <span className="sidebar-nav-icon">{entry.icon}</span>
        <span className="sidebar-label min-w-0 flex-1">
          <span className="block truncate text-[13.5px] leading-[1.3]">
            {entry.label}
          </span>
          <span className="sidebar-label-desc mt-0.5 block truncate text-[10.5px] leading-[1.3] text-muted-foreground">
            {entry.description}
          </span>
        </span>
        {active && <span className="sidebar-label sidebar-dot" aria-hidden="true" />}
      </a>
    </SideHint>
  );
}

export function AppSidebar() {
  const route = useRoute();
  const { open, setOpen, state, isMobile, openMobile, setOpenMobile } = useSidebar();
  const { modelLabel, setOpen: setOpenSettings } = useChatSettings();
  const menuRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const geoRef = useRef<{ x: number; y: number; width: number; height: number } | null>(
    null
  );
  const prevRoute = useRef(route);
  const prevState = useRef(state);
  const headingId = useId();

  /* 选中指示器：换页滑动；折叠时跟栏宽同一条缓动走 */
  useLayoutEffect(() => {
    let frame = 0;
    let tries = 0;

    const place = () => {
      const menu = menuRef.current;
      const indicator = indicatorRef.current;
      const active = menu?.querySelector<HTMLElement>('[data-active="true"]');
      /* 抽屉首次挂载比 effect 晚一帧，等 DOM 就位再量 */
      if (!menu || !indicator || !active) {
        if (tries++ < 12) frame = requestAnimationFrame(place);
        return;
      }

      const menuBox = menu.getBoundingClientRect();
      const box = active.getBoundingClientRect();
      /* 栏宽由 GSAP 补间，这一刻读到的仍是旧宽度；目标宽度按状态算 */
      const innerWidth =
        (isMobile
          ? SIDEBAR_WIDTH_MOBILE
          : state === "collapsed"
            ? SIDEBAR_WIDTH_ICON
            : SIDEBAR_WIDTH) -
        SIDEBAR_PADDING -
        2; /* 玻璃面板左右各 1px 描边 */
      const target = {
        x: 0,
        y: box.top - menuBox.top,
        width: innerWidth,
        height: box.height,
      };
      const previous = geoRef.current;
      geoRef.current = target;

      const routeChanged = prevRoute.current !== route;
      const stateChanged = prevState.current !== state;
      prevRoute.current = route;
      prevState.current = state;

      if (!previous || prefersReducedMotion()) {
        gsap.set(indicator, { ...target, autoAlpha: 1 });
        return;
      }

      gsap.to(indicator, {
        ...target,
        scaleX: 1,
        scaleY: 1,
        autoAlpha: 1,
        duration: 0.46,
        ease: stateChanged ? "power3.inOut" : "back.out(1.5)",
        overwrite: true,
      });

      if (routeChanged) {
        gsap.fromTo(
          indicator,
          { scaleX: 1.035, scaleY: 0.94 },
          {
            scaleX: 1,
            scaleY: 1,
            duration: 0.5,
            ease: "elastic.out(1, 0.6)",
            delay: 0.06,
          }
        );
      }
    };

    place();
    return () => {
      cancelAnimationFrame(frame);
      if (indicatorRef.current) gsap.killTweensOf(indicatorRef.current);
    };
  }, [route, state, isMobile, openMobile]);

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar aria-labelledby={headingId}>
      <div className="sidebar-brand-row flex items-center gap-2.5 px-2 pb-2 pt-1">
        <div className="sidebar-label min-w-0 flex-1">
          <p
            id={headingId}
            className="truncate text-[14.5px] leading-[1.25] font-semibold tracking-[-0.01em]"
          >
            街健日志
          </p>
          <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Calisthenics
          </p>
        </div>
        {isMobile ? (
          <GlassButton
            variant="quiet"
            aria-label="关闭导航"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            onClick={() => setOpenMobile(false)}
          >
            <Close />
          </GlassButton>
        ) : (
          <SideHint label="展开侧栏 · ⌘B" side="bottom">
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-expanded={open}
              aria-label={open ? "收起侧栏" : "展开侧栏"}
              className="sidebar-icon-btn grid h-9 w-9 shrink-0 place-items-center rounded-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect
                  x="2.4"
                  y="3.4"
                  width="13.2"
                  height="11.2"
                  rx="3.2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path d="M7 3.8v10.4" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M11.4 7.2 9.8 9l1.6 1.8"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="sidebar-collapse-arrow"
                />
              </svg>
            </button>
          </SideHint>
        )}
      </div>

      <nav
        ref={menuRef}
        aria-label="主导航"
        className="relative mt-5 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden"
      >
        <span ref={indicatorRef} className="nav-indicator" aria-hidden="true" />
        {NAV.map((entry) => (
          <NavRow
            key={entry.id}
            entry={entry}
            active={route === entry.id}
            onNavigate={closeOnMobile}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 px-1 pt-2">
        <SideHint
          label={modelLabel ? `模型配置 · ${modelLabel}` : "模型配置"}
          side="top"
        >
          <button
            id="model-settings-trigger"
            type="button"
            onClick={() => {
              closeOnMobile();
              setOpenSettings(true);
            }}
            aria-haspopup="dialog"
            aria-label={`模型配置，当前 ${modelLabel ?? "尚未加载"}`}
            className="sidebar-menu-button focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <span className="sidebar-nav-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M19.1 12c0-.5-.06-1-.16-1.46l1.7-1.3-1.9-3.3-2.02.8a7.3 7.3 0 0 0-2.53-1.47L13.9 3h-3.8l-.29 2.27A7.3 7.3 0 0 0 7.28 6.7l-2.02-.8-1.9 3.3 1.7 1.3a7.5 7.5 0 0 0 0 2.92l-1.7 1.3 1.9 3.3 2.02-.8a7.3 7.3 0 0 0 2.53 1.47L10.1 21h3.8l.29-2.27a7.3 7.3 0 0 0 2.53-1.47l2.02.8 1.9-3.3-1.7-1.3c.1-.46.16-.95.16-1.46Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="sidebar-label min-w-0 flex-1">
              <span className="block truncate text-[13.5px] leading-[1.3]">
                模型配置
              </span>
              <span className="sidebar-label-desc mt-0.5 block truncate text-[10.5px] leading-[1.3] text-muted-foreground">
                {modelLabel ?? "尚未加载"}
              </span>
            </span>
          </button>
        </SideHint>
      </div>
    </Sidebar>
  );
}
