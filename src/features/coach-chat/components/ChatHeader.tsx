import { MAX_TURNS } from "@/features/coach-chat/model/chat";
import { SidebarTrigger } from "@/shared/ui/sidebar";

interface ChatHeaderProps {
  /** 当前模型显示名，空则表示还没拿到清单；入口已移到侧栏底部，这里只读 */
  modelLabel: string | null;
}

export function ChatHeader({ modelLabel }: ChatHeaderProps) {
  return (
    <header className="chat-head">
      <div className="flex shrink-0 items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <div className="chat-head-title">
          <h1 className="display-text shrink-0 whitespace-nowrap text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] min-[960px]:text-[32px]">
            训练问答
          </h1>
          <p className="chat-head-sub hidden truncate sm:block">
            只读训练日志 · 保留最近 {MAX_TURNS} 轮
          </p>
        </div>
      </div>

      <p className="chat-model-chip">
        <span className="shrink-0 text-[10.5px] uppercase tracking-[0.14em]">
          模型
        </span>
        <span className="chat-model-name">{modelLabel ?? "尚未加载"}</span>
      </p>
    </header>
  );
}
