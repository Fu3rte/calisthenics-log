import { useEffect, useId, useRef } from "react";
import { MAX_INPUT } from "@/features/coach-chat/model/chat";
import { GlassButton } from "@/shared/ui/glass-button";

interface ChatComposerProps {
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

const ACTION =
  "chat-input-action inline-flex h-11 min-w-[76px] items-center justify-center rounded-full px-4 text-[13.5px] font-medium";

export function ChatComposer({
  value,
  pending,
  onChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const empty = value.trim().length === 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="chat-composer">
      <label htmlFor={inputId} className="sr-only">
        输入问题
      </label>
      <div className="chat-input-wrap">
        <textarea
          id={inputId}
          ref={inputRef}
          value={value}
          rows={2}
          maxLength={MAX_INPUT}
          placeholder="问点具体的，比如「上周引体总次数」"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              onSend();
            }
          }}
          className="chat-input"
        />
        {pending ? (
          <GlassButton
            onClick={onStop}
            aria-label="停止生成"
            className={ACTION}
          >
            停止
          </GlassButton>
        ) : (
          <GlassButton
            variant="ink"
            onClick={onSend}
            disabled={empty}
            className={`${ACTION} chat-send`}
          >
            发送
          </GlassButton>
        )}
      </div>
    </div>
  );
}
