import { useId, useLayoutEffect } from "react";
import type { RefObject } from "react";
import { MAX_INPUT } from "@/features/coach-chat/model/chat";
import { ArrowUp, StopSquare } from "@/shared/ui/icons";

interface ChatComposerProps {
  value: string;
  pending: boolean;
  /** 焦点归页面管：空态与对话态共用同一份引用 */
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export function ChatComposer({
  value,
  pending,
  inputRef,
  onChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const inputId = useId();
  const empty = value.trim().length === 0;

  /* 单行起步随内容长高，封顶 168 后交给内部滚动 */
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value, inputRef]);

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
          rows={1}
          maxLength={MAX_INPUT}
          placeholder="问点具体的，比如「引体该不该加组」"
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
        <div className="chat-input-actions">
          {pending ? (
            <button
              type="button"
              className="chat-stop-circle"
              aria-label="停止生成"
              onClick={onStop}
            >
              <StopSquare />
            </button>
          ) : (
            <button
              type="button"
              className="chat-send-circle"
              aria-label="发送"
              disabled={empty}
              onClick={onSend}
            >
              <ArrowUp />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
