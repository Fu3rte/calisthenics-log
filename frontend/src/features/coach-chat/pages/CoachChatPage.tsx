import { ChatComposer } from "@/features/coach-chat/components/ChatComposer";
import { ChatMessages } from "@/features/coach-chat/components/ChatMessages";
import { useChatSettings } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import { useCoachChat } from "@/features/coach-chat/hooks/useCoachChat";
import { SidebarTrigger } from "@/shared/ui/sidebar";

export function CoachChatPage() {
  const { model } = useChatSettings();
  const chat = useCoachChat(model);

  return (
    <div className="chat-page">
      <div className="chat-column">
        {/* 移动端抽屉只有这一个开启入口 */}
        <SidebarTrigger className="md:hidden" />
        <section className="glass-panel chat-panel no-shine flex min-h-0 flex-1 flex-col">
          <ChatMessages
            messages={chat.messages}
            pending={chat.pending}
            error={chat.error}
            onPick={chat.send}
          />
          <ChatComposer
            value={chat.input}
            pending={chat.pending}
            onChange={chat.setInput}
            onSend={() => chat.send()}
            onStop={chat.stop}
          />
        </section>
      </div>
    </div>
  );
}
