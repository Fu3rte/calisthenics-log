/**
 * Sidebar —— shadcn/ui sidebar 的裁剪版。
 *
 * 保留官方结构与 API：SidebarProvider / Sidebar / SidebarInset /
 * SidebarHeader / SidebarContent / SidebarGroup / SidebarMenu /
 * SidebarMenuButton / SidebarFooter / SidebarTrigger。
 *
 * 差异：
 * - 桌面宽度用 GSAP 补间，而不是 CSS transition，便于和路由/指示器共用一条时间线。
 * - 移动端抽屉直接复用 radix-ui 的 Dialog 原语，不额外引 sheet/tooltip 依赖。
 * - 展开状态写 localStorage，不写 cookie。
 */
import * as React from "react";
import { Dialog as DialogPrimitive, Slot } from "radix-ui";
import { gsap } from "gsap";
import { cn } from "@/shared/lib/utils";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { prefersReducedMotion } from "@/shared/hooks/useCountUp";
import { GlassButton } from "@/shared/ui/glass-button";

export const SIDEBAR_WIDTH = 252;
export const SIDEBAR_WIDTH_ICON = 76;
export const SIDEBAR_WIDTH_MOBILE = 292;
/** 侧栏内边距 p-3，内容宽度 = 栏宽 - 24 */
export const SIDEBAR_PADDING = 24;
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
const SIDEBAR_STORAGE_KEY = "calisthenics:sidebar";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

export function useSidebar(): SidebarContextProps {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar 必须在 SidebarProvider 内使用");
  }
  return context;
}

function readStoredOpen(fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "open") return true;
    if (stored === "closed") return false;
  } catch {
    /* 隐私模式读不到，用默认值 */
  }
  return fallback;
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [uncontrolled, setUncontrolled] = React.useState(() =>
    readStoredOpen(defaultOpen)
  );

  const open = openProp ?? uncontrolled;

  const setOpen = React.useCallback<SidebarContextProps["setOpen"]>(
    (value) => {
      const next = typeof value === "function" ? value(open) : value;
      if (onOpenChange) onOpenChange(next);
      else setUncontrolled(next);
      try {
        window.localStorage.setItem(
          SIDEBAR_STORAGE_KEY,
          next ? "open" : "closed"
        );
      } catch {
        /* 存不下就只在本次会话里生效 */
      }
    },
    [onOpenChange, open]
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((current) => !current);
    else setOpen((current) => !current);
  }, [isMobile, setOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        className={cn(
          "group/sidebar-wrapper flex h-dvh w-full overflow-hidden",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function MobileSidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const { openMobile, setOpenMobile } = useSidebar();

  return (
    <DialogPrimitive.Root open={openMobile} onOpenChange={setOpenMobile}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="sidebar-overlay"
          className="fixed inset-0 z-50 bg-[rgba(29,29,31,0.26)] backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          data-slot="sidebar"
          data-state="expanded"
          data-mobile="true"
          className={cn(
            "glass-panel glass-drawer fixed inset-y-3 left-3 z-50 flex flex-col outline-none",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left",
            className
          )}
          style={{ width: SIDEBAR_WIDTH_MOBILE }}
          {...props}
        >
          <DialogPrimitive.Title className="sr-only">主导航</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            在训练日志与训练问答之间切换
          </DialogPrimitive.Description>
          <div className="flex h-full min-h-0 w-full flex-col p-3">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DesktopSidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"aside">) {
  const { open, state } = useSidebar();
  const ref = React.useRef<HTMLElement>(null);
  const width = React.useRef(open ? SIDEBAR_WIDTH : SIDEBAR_WIDTH_ICON);
  const first = React.useRef(true);

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const target = open ? SIDEBAR_WIDTH : SIDEBAR_WIDTH_ICON;

    if (first.current) {
      first.current = false;
      element.style.width = `${target}px`;
      width.current = target;
      if (!prefersReducedMotion()) {
        gsap.fromTo(
          element,
          { autoAlpha: 0, x: -12 },
          {
            autoAlpha: 1,
            x: 0,
            duration: 0.52,
            ease: "power3.out",
            clearProps: "opacity,visibility,transform",
          }
        );
      }
      return;
    }

    if (prefersReducedMotion()) {
      element.style.width = `${target}px`;
      width.current = target;
      return;
    }

    const proxy = { value: width.current };
    const tween = gsap.to(proxy, {
      value: target,
      duration: 0.46,
      ease: "power3.inOut",
      onUpdate: () => {
        element.style.width = `${proxy.value}px`;
        width.current = proxy.value;
      },
    });

    return () => {
      tween.kill();
    };
  }, [open]);

  return (
    <aside
      ref={ref}
      data-slot="sidebar"
      data-state={state}
      data-collapsible={state === "collapsed" ? "icon" : ""}
      className={cn(
        "sidebar-shell glass-panel group/sidebar relative z-10 my-3 ml-3 hidden shrink-0 flex-col bg-white/55 md:flex",
        className
      )}
      {...props}
    >
      <div
        data-sidebar="sidebar"
        data-slot="sidebar-inner"
        className="flex h-full min-h-0 w-full flex-col overflow-hidden p-3"
      >
        {children}
      </div>
    </aside>
  );
}

export function Sidebar({
  className,
  children,
  collapsible = "icon",
  ...props
}: React.ComponentProps<"div"> & {
  collapsible?: "icon" | "none";
}) {
  const { isMobile } = useSidebar();

  if (isMobile) {
    return (
      <MobileSidebar className={className} {...props}>
        {children}
      </MobileSidebar>
    );
  }

  if (collapsible === "none") {
    return (
      <aside
        data-slot="sidebar"
        className={cn("flex h-full flex-col", className)}
        {...props}
      >
        {children}
      </aside>
    );
  }

  return (
    <DesktopSidebar className={className} {...props}>
      {children}
    </DesktopSidebar>
  );
}

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof GlassButton>) {
  const { toggleSidebar, isMobile, open } = useSidebar();

  return (
    <GlassButton
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      aria-label={isMobile ? "打开导航" : open ? "收起侧栏" : "展开侧栏"}
      aria-expanded={isMobile ? undefined : open}
      intensity={0.06}
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-full",
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
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
    </GlassButton>
  );
}

export function SidebarInset({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-1 flex-col",
        className
      )}
      {...props}
    />
  );
}

export function SidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex flex-col gap-2 px-1 pb-2", className)}
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-hidden", className)}
      {...props}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("mt-auto flex flex-col gap-2 px-1 pt-2", className)}
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      data-sidebar-label=""
      className={cn("sidebar-label px-3 pb-1", className)}
      {...props}
    />
  );
}

export function SidebarMenu({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu"
      className={cn("relative flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  tooltip,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
}) {
  const Comp = asChild ? Slot.Root : "a";

  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      aria-current={isActive ? "page" : undefined}
      title={tooltip}
      className={cn("sidebar-menu-button", className)}
      {...props}
    />
  );
}

export function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-separator"
      className={cn("mx-2 h-px bg-[rgba(29,29,31,0.08)]", className)}
      {...props}
    />
  );
}
