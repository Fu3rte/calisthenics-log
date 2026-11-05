import { useEffect, useRef } from "react";
import {
  SUGGESTIONS,
  type ChatMessage,
  type ToolActivity,
} from "@/features/coach-chat/model/chat";
import { GlassButton } from "@/shared/ui/glass-button";
import { Message, MessageContent } from "@/shared/ui/message";

interface ChatMessagesProps {
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
  onPick: (text: string) => void;
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

export function ChatMessages({
  messages,
  pending,
  error,
  onPick,
}: ChatMessagesProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  return (
    <div ref={listRef} role="log" aria-live="polite" className="chat-log">
      {messages.length === 0 && (
        <div className="chat-empty">
          <p className="chat-empty-lead">
            问训练记录里的细节。日志每轮重新读取，改完数据下一句就生效。
          </p>
          <div className="chat-empty-actions">
            {SUGGESTIONS.map((item) => (
              <GlassButton
                key={item}
                onClick={() => onPick(item)}
                className="inline-flex min-h-11 max-w-full items-center rounded-full px-4 py-2 text-[13px] leading-[1.5]"
              >
                {item}
              </GlassButton>
            ))}
          </div>
        </div>
      )}

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
                    <ToolActivityRow
                      key={activity.id}
                      activity={activity}
                    />
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
