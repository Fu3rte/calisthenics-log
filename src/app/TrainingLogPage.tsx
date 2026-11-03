/**
 * 训练日志页：加载中 / 错误 / 就绪三态，就绪后交给 Dashboard。
 */
import { Dashboard } from "@/app/Dashboard";
import { useTrainingLog } from "@/features/training-log/hooks/useTrainingLog";
import { SidebarTrigger } from "@/shared/ui/sidebar";

const ERROR_MSG =
  "训练日志读不出来。确认 训练日志.json 在同目录，格式符合 schema。";

export function TrainingLogPage() {
  const state = useTrainingLog();

  if (state.status === "loading") {
    return (
      <div className="grid h-full place-items-center px-6">
        <p className="text-[14px] text-muted-foreground">正在加载训练记录…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="app-scroll h-full">
        <div className="app-main">
          <header className="flex items-start gap-3">
            <SidebarTrigger className="mt-1 md:hidden" />
            <h1 className="display-text whitespace-nowrap text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] min-[960px]:text-[32px]">
              训练日志
            </h1>
          </header>
          <div className="glass-panel px-6 py-8">
            <p className="text-[14.5px] leading-[1.8]">{ERROR_MSG}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {state.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <Dashboard sessions={state.sessions} />;
}
