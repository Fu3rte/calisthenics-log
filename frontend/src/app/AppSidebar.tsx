import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { routeHref, useRoute, type AppRoute } from "@/app/router";
import { useChatSettings } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import { prefersReducedMotion } from "@/shared/hooks/prefersReducedMotion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

interface NavEntry {
  id: AppRoute;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavEntry[] = [
  {
    id: "chat",
    label: "训练问答",
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

function SideHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavRow({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <SideHint label={entry.label}>
      <a
        href={routeHref(entry.id)}
        data-active={active}
        aria-current={active ? "page" : undefined}
        aria-label={entry.label}
        className="sidebar-menu-button"
      >
        <span className="sidebar-nav-icon">{entry.icon}</span>
      </a>
    </SideHint>
  );
}

export function AppSidebar() {
  const route = useRoute();
  const { modelLabel, setOpen: setOpenSettings } = useChatSettings();
  const menuRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const indicator = indicatorRef.current;
    const active = menu?.querySelector<HTMLElement>('[data-active="true"]');
    if (!menu || !indicator || !active) return;

    const tween = gsap.to(indicator, {
      x: active.offsetLeft,
      y: active.offsetTop,
      width: active.offsetWidth,
      height: active.offsetHeight,
      autoAlpha: 1,
      duration: placed.current && !prefersReducedMotion() ? 0.3 : 0,
      ease: "power3.out",
      overwrite: true,
    });
    placed.current = true;
    return () => { tween.kill(); };
  }, [route]);

  return (
    <aside className="sidebar-shell" aria-label="街健日志">

      <nav ref={menuRef} aria-label="主导航" className="relative flex flex-col gap-2">
        <span ref={indicatorRef} className="nav-indicator" aria-hidden="true" />
        {NAV.map((entry) => (
          <NavRow key={entry.id} entry={entry} active={route === entry.id} />
        ))}
      </nav>

      <div className="mt-auto pt-2">
        <SideHint label={modelLabel ? `模型配置 · ${modelLabel}` : "模型配置"}>
          <button
            id="model-settings-trigger"
            type="button"
            onClick={() => setOpenSettings(true)}
            aria-haspopup="dialog"
            aria-label={`模型配置，当前 ${modelLabel ?? "尚未加载"}`}
            className="sidebar-menu-button"
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
          </button>
        </SideHint>
      </div>
    </aside>
  );
}
