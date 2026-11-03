/**
 * 极简哈希路由：两个页面共用一套外壳，侧栏切换不刷新。
 * 用 hash 而不是 history，静态托管与 file:// 预览都能直接打开。
 */
import { useEffect, useState } from "react";

export const ROUTES = ["training", "chat"] as const;
export type AppRoute = (typeof ROUTES)[number];

export const ROUTE_LABEL: Record<AppRoute, string> = {
  training: "训练日志",
  chat: "训练问答",
};

export function readRoute(): AppRoute {
  if (typeof window === "undefined") return "training";
  const hash = window.location.hash.replace(/^#\/?/, "");
  return hash === "chat" ? "chat" : "training";
}

export function routeHref(route: AppRoute): string {
  return `#/${route}`;
}

export function navigate(route: AppRoute): void {
  const next = routeHref(route);
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export function useRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(readRoute);

  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}
