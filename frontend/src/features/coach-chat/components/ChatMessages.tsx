import { useEffect, useRef } from "react";
import type { ChatMessage, ToolActivity } from "@/features/coach-chat/model/chat";
import { Message, MessageContent } from "@/shared/ui/message";

interface ChatMessagesProps {
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
}

function ToolActivityRow({ activity }: { activity: ToolActivity }) {
  const running = activity.state === "call";
  const className = [
    "chat-tool",
    running ? "is-running" : "",
    activity.isError ? "is-error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <span className="chat-tool-name">{activity.name}</span>
      <span className="chat-tool-detail" title={activity.detail}>
        {activity.detail || "执行中"}
      </span>
      <span className="chat-tool-meta">
        {running ? "进行中" : `${activity.durationMs ?? 0} ms`}
      </span>
    </div>
  );
}

export function ChatMessages({ messages, pending, error }: ChatMessagesProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  return (
    <div ref={listRef} role="log" aria-live="polite" className="chat-log">
      {messages.map((message, index) => {
        const last = index === messages.length - 1;
        const streaming = pending && last;

        if (message.role === "user") {
          return (
            <Message key={index} align="end">
              <MessageContent>
                <p className="chat-bubble">{message.content}</p>
              </MessageContent>
            </Message>
          );
        }

        const activities = message.activities ?? [];
        if (!message.content && !streaming && activities.length === 0) return null;

        return (
          <Message key={index}>
            <MessageContent>
              {activities.length > 0 && (
                <div className="chat-tools" aria-label="工具活动">
                  {activities.map((activity) => (
                    <ToolActivityRow key={activity.id} activity={activity} />
                  ))}
                </div>
              )}
              {(message.content || (streaming && activities.length === 0)) && (
                <div
                  className={`chat-answer${streaming && !message.content ? " is-pending" : ""}`}
                >
                  {message.content || "正在生成回答"}
                  {streaming && (
                    <span className="chat-pending-dot" aria-hidden="true" />
                  )}
                  {message.stopped && (
                    <span className="chat-stopped">已停止</span>
                  )}
                </div>
              )}
            </MessageContent>
          </Message>
        );
      })}

      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
