/**
 * 会话导轨：新建、切换、重命名、删除。
 * 列表部分单独抽出，窄屏 Popover 复用同一份渲染与交互。
 */
import { useEffect, useRef, useState } from "react";
import type { SessionSummary } from "@/features/coach-chat/model/chat";
import { PanelLeft, Pencil, SquarePen, Trash } from "@/shared/ui/icons";

export interface SessionListProps {
  sessions: SessionSummary[];
  activeId: string | null;
  error: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
}

export interface SessionRailProps extends SessionListProps {
  onCreate: () => void;
  /** 宽容器传入：导轨头部渲染收起按钮 */
  onToggle?: () => void;
  railOpen?: boolean;
}

function SessionRailItem({
  session,
  active,
  onSelect,
  onRename,
  onRemove,
}: {
  session: SessionSummary;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const committing = useRef(false);
  const cancelled = useRef(false);
  const confirmTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  useEffect(
    () => () => {
      if (confirmTimer.current !== null) {
        window.clearTimeout(confirmTimer.current);
      }
    },
    []
  );

  const displayName = session.name?.trim() || session.preview?.trim() || "新对话";

  const startRename = () => {
    committing.current = false;
    cancelled.current = false;
    setDraft(session.name ?? "");
    setEditing(true);
  };

  const commitRename = () => {
    if (committing.current) return;
    committing.current = true;
    setEditing(false);

    const next = draft.trim();
    if (next !== (session.name ?? "").trim()) {
      void onRename(session.id, next);
    }
  };

  const cancelRename = () => {
    cancelled.current = true;
    setEditing(false);
  };

  const resetConfirm = () => {
    if (confirmTimer.current !== null) {
      window.clearTimeout(confirmTimer.current);
      confirmTimer.current = null;
    }
    setConfirming(false);
  };

  const startConfirm = () => {
    setConfirming(true);
    if (confirmTimer.current !== null) {
      window.clearTimeout(confirmTimer.current);
    }
    /* 3 秒没点第二下就收起确认态 */
    confirmTimer.current = window.setTimeout(() => {
      confirmTimer.current = null;
      setConfirming(false);
    }, 3000);
  };

  const handleRemove = () => {
    resetConfirm();
    void onRemove(session.id);
  };

  if (editing) {
    return (
      <li className={`chat-rail-item is-editing${active ? " is-active" : ""}`}>
        <input
          ref={inputRef}
          value={draft}
          aria-label="会话名称"
          placeholder="留空则用摘要作名称"
          className="chat-rail-rename"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitRename();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelRename();
            }
          }}
          onBlur={() => {
            if (cancelled.current) {
              cancelled.current = false;
              return;
            }
            commitRename();
          }}
        />
      </li>
    );
  }

  return (
    <li className={`chat-rail-item${active ? " is-active" : ""}`}>
      <button
        type="button"
        className="chat-rail-select"
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(session.id)}
      >
        <span className="chat-rail-name">{displayName}</span>
      </button>

      <div className="chat-rail-actions">
        <button
          type="button"
          className="chat-rail-action"
          aria-label="重命名会话"
          title="重命名"
          onClick={startRename}
        >
          <Pencil />
        </button>
        <button
          type="button"
          className={`chat-rail-action chat-rail-remove${
            confirming ? " is-confirming" : ""
          }`}
          aria-label={confirming ? "确认删除会话" : "删除会话"}
          title={confirming ? "再次点击确认删除" : "删除"}
          onBlur={resetConfirm}
          onClick={confirming ? handleRemove : startConfirm}
        >
          {confirming ? <span className="chat-rail-confirm">删除？</span> : <Trash />}
        </button>
      </div>
    </li>
  );
}

export function SessionList({
  sessions,
  activeId,
  error,
  onSelect,
  onRename,
  onRemove,
}: SessionListProps) {
  return (
    <div className="chat-rail-body">
      {error && (
        <p className="chat-rail-error" role="status">
          {error}
        </p>
      )}

      {sessions.length === 0 ? (
        !error && <p className="chat-rail-empty">还没有会话，发第一句就开始。</p>
      ) : (
        <>
          {/* 与 GPT 一样给列表一个分组标题；空列表或只有错误提示时不占位 */}
          <p className="chat-rail-group">最近</p>
          <ul className="chat-rail-list">
            {sessions.map((session) => (
              <SessionRailItem
                key={session.id}
                session={session}
                active={session.id === activeId}
                onSelect={onSelect}
                onRename={onRename}
                onRemove={onRemove}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function SessionRail({
  onCreate,
  onToggle,
  railOpen,
  ...list
}: SessionRailProps) {
  return (
    <aside className="chat-rail" aria-label="会话列表">
      {/* 头部行：左侧安静的新建按钮，右侧收起开关（浮层里由 CSS 隐藏） */}
      <div className="chat-rail-head">
        <button type="button" className="chat-rail-new" onClick={onCreate}>
          <SquarePen size={16} />
          <span>新建对话</span>
        </button>
        {onToggle && (
          <button
            type="button"
            className="chat-rail-toggle"
            aria-label="隐藏会话列表"
            aria-expanded={railOpen}
            aria-controls="chat-rail-slot"
            onClick={onToggle}
          >
            <PanelLeft size={17} />
          </button>
        )}
      </div>
      <SessionList {...list} />
    </aside>
  );
}
