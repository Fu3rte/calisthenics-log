/**
 * Sidebar —— shadcn/ui sidebar 的裁剪版。
 *
 * 保留官方结构与 API：SidebarProvider / Sidebar / SidebarTrigger。
 *
 * 差异：
 * - 桌面宽度用 GSAP 补间，而不是 CSS transition，便于和路由/指示器共用一条时间线。
 * - 移动端抽屉直接复用 radix-ui 的 Dialog 原语，不额外引 sheet/tooltip 依赖。
 * - 展开状态写 localStorage，不写 cookie。
 */
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { gsap } from "gsap";
import { cn } from "@/shared/lib/utils";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { prefersReducedMotion } from "@/shared/hooks/prefersReducedMotion";
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

export function SidebarProvider({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [open, setOpenState] = React.useState(
    () => window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "closed"
  );

  const setOpen = React.useCallback<SidebarContextProps["setOpen"]>(
    (value) => {
      const next = typeof value === "function" ? value(open) : value;
      setOpenState(next);
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "open" : "closed");
    },
    [open]
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
        className={cn(
          "flex h-dvh w-full overflow-hidden",
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(29,29,31,0.26)] backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
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
      data-state={state}
      className={cn(
        "sidebar-shell glass-panel relative z-10 my-3 ml-3 hidden shrink-0 flex-col bg-white/55 md:flex",
        className
      )}
      {...props}
    >
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden p-3">
        {children}
      </div>
    </aside>
  );
}

export function Sidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const { isMobile } = useSidebar();

  if (isMobile) {
    return (
      <MobileSidebar className={className} {...props}>
        {children}
      </MobileSidebar>
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
      aria-label={isMobile ? "打开导航" : open ? "收起侧栏" : "展开侧栏"}
      aria-expanded={isMobile ? undefined : open}
      className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", className)}
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
