/**
 * 应用外壳：侧栏 + 内容区，两个路由共用一个入口。
 */
import { useEffect } from "react";
import { AppSidebar } from "@/app/AppSidebar";
import { RouteStage } from "@/app/RouteStage";
import { useRoute } from "@/app/router";
import { CoachSettingsHost } from "@/features/coach-chat/components/ModelSettingsDialog";
import { ChatSettingsProvider } from "@/features/coach-chat/hooks/ChatSettingsProvider";
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
    <div className="app-frame flex h-dvh w-full overflow-hidden">
      <TooltipProvider>
        <ChatSettingsProvider>
          <AppSidebar />

          <main className="app-view flex min-w-0 flex-1 flex-col">
            <RouteStage route={route} />
          </main>

          {/* 入口在侧栏底部，两个路由共用一个面板，挂在壳层而不是聊天页 */}
          <CoachSettingsHost />
        </ChatSettingsProvider>
      </TooltipProvider>
    </div>
  );
}
