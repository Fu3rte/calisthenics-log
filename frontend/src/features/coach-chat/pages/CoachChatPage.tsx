import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  RAIL_WIDTH_MAX,
  RAIL_WIDTH_MIN,
} from "@/features/coach-chat/api/sessionPrefs";
import { ChatComposer } from "@/features/coach-chat/components/ChatComposer";
import { ChatMessages } from "@/features/coach-chat/components/ChatMessages";
import { SessionRail } from "@/features/coach-chat/components/SessionRail";
import { useChatRail } from "@/features/coach-chat/hooks/useChatRail";
import { useChatSettings } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import { useCoachChat } from "@/features/coach-chat/hooks/useCoachChat";
import { Chevron, PanelLeft, SquarePen } from "@/shared/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/* 空态建议问题：点击只填进输入框，发送与否交给用户 */
const SUGGESTIONS = [
  "引体卡在 8 个怎么突破",
  "组间歇留多久合适",
  "今天状态差，要不要减量",
];

const FOOT_NOTE = "回答仅供参考，训练安排以身体感受为准。";

export function CoachChatPage() {
  const { model } = useChatSettings();
  const chat = useCoachChat(model);
  /* 窄容器：会话列表仍走浮层，与宽容器的侧栏互不影响 */
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  /* 空态与对话态共用同一个输入框引用，焦点由页面控制 */
  const heroInputRef = useRef<HTMLTextAreaElement>(null);
  const rail = useChatRail(surfaceRef);
  const restoreRailFocus = useRef(false);
  const toggleRail = useCallback(() => {
    restoreRailFocus.current = true;
    rail.toggle();
  }, [rail.toggle]);

  useLayoutEffect(() => {
    if (!restoreRailFocus.current) return;
    restoreRailFocus.current = false;
    surfaceRef.current?.querySelector<HTMLButtonElement>(
      rail.open ? ".chat-rail-toggle" : ".chat-rail-open"
    )?.focus();
  }, [rail.open]);

  useEffect(() => {
    if (rail.wide) setPopoverOpen(false);
  }, [rail.wide]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "o" ||
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey
      ) {
        return;
      }
      event.preventDefault();

      /* 窄容器没有侧栏，快捷键落到同一份列表的浮层上 */
      if (rail.wide) toggleRail();
      else setPopoverOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rail.wide, toggleRail]);

  const sessionRail = (
    <SessionRail
      sessions={chat.sessions}
      activeId={chat.activeId}
      error={chat.sessionsError}
      onCreate={() => {
        chat.newSession();
        setPopoverOpen(false);
      }}
      onSelect={(id) => {
        chat.selectSession(id);
        setPopoverOpen(false);
      }}
      onRename={chat.renameSession}
      onRemove={chat.removeSession}
      onToggle={toggleRail}
      railOpen={rail.open}
    />
  );

  /* 侧栏宽度走 CSS 变量，拖动只改这一个值；收起时归零交给列宽补间 */
  const surfaceStyle = {
    "--rail-w": rail.open ? `${rail.width}px` : "0px",
  } as CSSProperties;

  const activeSession = chat.sessions.find(
    (session) => session.id === chat.activeId
  );
  const conversationTitle =
    activeSession?.name?.trim() || activeSession?.preview?.trim() || "新对话";
  const hero = chat.messages.length === 0 && !chat.pending;

  /* 挂载与空态/对话态切换时把焦点交给输入框，与旧版 composer 自动聚焦一致 */
  useEffect(() => {
    heroInputRef.current?.focus();
  }, [hero]);

  const composer = (
    <ChatComposer
      value={chat.input}
      pending={chat.pending}
      inputRef={heroInputRef}
      onChange={chat.setInput}
      onSend={() => chat.send()}
      onStop={chat.stop}
    />
  );

  return (
    <div className="chat-page">
      <div className="chat-shell" data-rail={rail.open ? "open" : "closed"}>
        <div
          ref={surfaceRef}
          className="chat-surface"
          data-resizing={rail.resizing ? "true" : undefined}
          style={surfaceStyle}
        >
          <div id="chat-rail-slot" className="chat-rail-slot" inert={!rail.open}>
            {sessionRail}
          </div>

          {/* 拖拽条：宽容器且展开时才存在，双击复位 */}
          {rail.wide && rail.open && (
            <div
              className="chat-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整会话列表宽度"
              aria-valuenow={rail.width}
              aria-valuemin={RAIL_WIDTH_MIN}
              aria-valuemax={RAIL_WIDTH_MAX}
              tabIndex={0}
              onPointerDown={rail.beginResize}
              onDoubleClick={rail.resetWidth}
              onKeyDown={rail.handleKeyDown}
            />
          )}

          <div className="chat-conversation">
            {/* 顶栏在对话列自己的头部行：左操作区、中会话名、右占位 */}
            <div className="chat-topbar">
              <div className="chat-topbar-side">
                {rail.wide && !rail.open && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="chat-topbar-button chat-rail-open"
                          aria-label="展开会话列表"
                          aria-expanded={false}
                          aria-controls="chat-rail-slot"
                          onClick={toggleRail}
                        >
                          <PanelLeft size={18} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">展开会话列表</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="chat-topbar-button"
                          aria-label="新建对话"
                          onClick={() => chat.newSession()}
                        >
                          <SquarePen size={18} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">新建对话</TooltipContent>
                    </Tooltip>
                  </>
                )}

                {/* 窄容器：会话列表收进对话框上方的浮层。
                    Radix 的 Trigger 直接渲染原生按钮，
                    这里复用同一套 lg-surface / lg-glass 材质。 */}
                <Popover open={popoverOpen && !rail.wide} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger className="lg-surface lg-glass chat-session-trigger text-foreground/80 hover:text-foreground">
                    <span>会话</span>
                    <Chevron dir="down" className="chat-session-caret" />
                  </PopoverTrigger>
                  <PopoverContent
                    ref={popoverRef}
                    tabIndex={-1}
                    align="start"
                    sideOffset={8}
                    className="chat-rail-pop no-shine"
                    onCloseAutoFocus={(event) => {
                      if (!rail.wide) return;
                      event.preventDefault();
                      surfaceRef.current?.querySelector<HTMLButtonElement>(
                        rail.open ? ".chat-rail-toggle" : ".chat-rail-open"
                      )?.focus();
                    }}
                    onOpenAutoFocus={(event) => {
                      /* 默认会落到「新建对话」上，黑焦点环很抢眼；
                         改成聚焦面板本身，Tab 再进列表 */
                      event.preventDefault();
                      popoverRef.current?.focus();
                    }}
                  >
                    {sessionRail}
                  </PopoverContent>
                </Popover>
              </div>

              {chat.messages.length > 0 && (
                <span className="chat-title">{conversationTitle}</span>
              )}
              <span aria-hidden="true" />
            </div>

            {hero ? (
              <>
                {/* 空态 hero：标题、副文案、输入胶囊与建议问题整块居中 */}
                <div className="chat-hero-wrap">
                  <div className="chat-hero">
                    <h1 className="chat-hero-title">今天想问点什么？</h1>
                    <p className="chat-hero-sub">
                      问训练上的问题，会话保存在本机，关掉页面也能接着聊。
                    </p>
                    {composer}
                    <div className="chat-suggest-row">
                      {SUGGESTIONS.map((text) => (
                        <button
                          key={text}
                          type="button"
                          className="chat-suggest"
                          onClick={() => {
                            chat.setInput(text);
                            heroInputRef.current?.focus();
                          }}
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="chat-foot">{FOOT_NOTE}</p>
              </>
            ) : (
              <>
                <ChatMessages
                  messages={chat.messages}
                  pending={chat.pending}
                  error={chat.error}
                />
                <div className="chat-composer-zone">{composer}</div>
                <p className="chat-foot">{FOOT_NOTE}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
