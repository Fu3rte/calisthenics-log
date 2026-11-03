import { ChatComposer } from "@/features/coach-chat/components/ChatComposer";
import { ChatHeader } from "@/features/coach-chat/components/ChatHeader";
import { ChatMessages } from "@/features/coach-chat/components/ChatMessages";
import { useChatSettings } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import { useCoachChat } from "@/features/coach-chat/hooks/useCoachChat";

export function CoachChatPage() {
  const { settings, modelLabel } = useChatSettings();
  const chat = useCoachChat(settings ?? undefined);

  return (
    <div className="chat-page">
      <div className="chat-column">
        <ChatHeader modelLabel={modelLabel} />
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
