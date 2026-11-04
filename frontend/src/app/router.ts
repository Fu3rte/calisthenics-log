/**
 * 极简哈希路由：两个页面共用一套外壳，侧栏切换不刷新。
 * 用 hash 而不是 history，静态托管与 file:// 预览都能直接打开。
 */
import { useEffect, useState } from "react";

export type AppRoute = "training" | "chat";

export function readRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return hash === "training" ? "training" : "chat";
}

export function routeHref(route: AppRoute): string {
  return `#/${route}`;
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
