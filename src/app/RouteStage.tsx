/**
 * 页面切换台：旧页淡出、新页抬升进场。
 * 两层动画分开写，reduced-motion 下直接换页。
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { CoachChatPage } from "@/features/coach-chat/pages/CoachChatPage";
import { TrainingLogPage } from "@/app/TrainingLogPage";
import { prefersReducedMotion } from "@/shared/hooks/useCountUp";
import type { AppRoute } from "@/app/router";

export function RouteStage({ route }: { route: AppRoute }) {
  const [shown, setShown] = useState<AppRoute>(route);
  const hostRef = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (route === shown) {
      /* 切回当前页时，取消还没走完的淡出，避免迟到的 setShown 覆盖路由 */
      if (leaving.current) {
        timeline.current?.kill();
        timeline.current = null;
        leaving.current = false;
        if (host) gsap.set(host, { autoAlpha: 1, y: 0 });
      }
      return;
    }
    if (!host || prefersReducedMotion()) {
      timeline.current?.kill();
      leaving.current = false;
      if (host) gsap.set(host, { clearProps: "opacity,visibility,transform" });
      setShown(route);
      return;
    }

    timeline.current?.kill();
    leaving.current = true;
    timeline.current = gsap
      .timeline()
      .to(host, {
        autoAlpha: 0,
        y: 6,
        duration: 0.16,
        ease: "power2.in",
      })
      .call(() => {
        leaving.current = false;
        setShown(route);
      });

    return () => {
      timeline.current?.kill();
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
      {shown === "chat" ? <CoachChatPage /> : <TrainingLogPage />}
    </div>
  );
}
