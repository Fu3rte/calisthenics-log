/**
 * 页面切换台：旧页淡出、新页抬升进场。
 * 两层动画分开写，reduced-motion 下直接换页。
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { CoachChatPage } from "@/features/coach-chat/pages/CoachChatPage";
import { TrainingLogPage } from "@/app/TrainingLogPage";
import { prefersReducedMotion } from "@/shared/hooks/prefersReducedMotion";
import type { AppRoute } from "@/app/router";

export function RouteStage({ route }: { route: AppRoute }) {
  const [shown, setShown] = useState<AppRoute>(route);
  const hostRef = useRef<HTMLDivElement>(null);
  const fade = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    const host = hostRef.current;

    if (route === shown) {
      /* 切回当前页：取消还没走完的淡出，避免迟到的 setShown 覆盖路由 */
      if (fade.current) {
        fade.current.kill();
        fade.current = null;
        if (host) gsap.set(host, { autoAlpha: 1, y: 0 });
      }
      return;
    }

    if (!host || prefersReducedMotion()) {
      setShown(route);
      return;
    }

    fade.current = gsap.to(host, {
      autoAlpha: 0,
      y: 6,
      duration: 0.16,
      ease: "power2.in",
      onComplete: () => {
        fade.current = null;
        setShown(route);
      },
    });

    return () => {
      fade.current?.kill();
      fade.current = null;
    };
  }, [route, shown]);

  /* 新页进场；首屏也走一次，和侧栏的入场错开 */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (prefersReducedMotion()) {
      gsap.set(host, { clearProps: "opacity,visibility,transform" });
      return;
    }
    const tween = gsap.fromTo(
      host,
      { autoAlpha: 0, y: 14, scale: 0.994 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.46,
        ease: "power3.out",
        delay: 0.04,
        clearProps: "transform",
      }
    );
    return () => {
      tween.kill();
    };
  }, [shown]);

  return (
    <div ref={hostRef} className="h-full min-h-0">
      {shown === "training" ? <TrainingLogPage /> : <CoachChatPage />}
    </div>
  );
}
