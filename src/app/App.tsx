/**
 * 应用外壳：侧栏 + 内容区，两个路由共用一个入口。
 */
import { useEffect } from "react";
import { AppSidebar } from "@/app/AppSidebar";
import { RouteStage } from "@/app/RouteStage";
import { useRoute } from "@/app/router";
import { CoachSettingsHost } from "@/features/coach-chat/components/ModelSettingsDialog";
import { ChatSettingsProvider } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import { SidebarInset, SidebarProvider } from "@/shared/ui/sidebar";
import { TooltipProvider } from "@/shared/ui/tooltip";

const TITLES = {
  training: "街健日志 · 训练记录",
  chat: "训练问答 · 街健日志",
} as const;

export default function App() {
  const route = useRoute();

  useEffect(() => {
    document.title = TITLES[route];
  }, [route]);

  return (
    <SidebarProvider className="app-frame">
      <div className="bed" aria-hidden="true">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <TooltipProvider>
        <ChatSettingsProvider>
          <AppSidebar />

          <SidebarInset className="app-view">
            <RouteStage route={route} />
          </SidebarInset>

          {/* 入口在侧栏底部，两个路由共用一个面板，挂在壳层而不是聊天页 */}
          <CoachSettingsHost />
        </ChatSettingsProvider>
      </TooltipProvider>
    </SidebarProvider>
  );
}
