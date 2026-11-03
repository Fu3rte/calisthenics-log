/**
 * 添加 Provider 浮层：搜索 + 自定义 / 订阅服务 / API KEY 三组卡片。
 * 结构照 pi-web 的 AddProviderPicker；图标位用 monogram 方块（pi-web 对未知 provider 也是这个回退）。
 * 已配置的家不在这里出现，它们在连接区的列表里。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { PickerEntry } from "@/features/coach-chat/model/chat";
import { Hint } from "@/shared/ui/hint";

const CUSTOM_ID = "__custom__";

interface ProviderPickerProps {
  entries: PickerEntry[];
  onPickApiKey: (provider: string) => void;
  onPickCustom: () => void;
  onClose: () => void;
}

/** 按 [-_] 切段取首字母，最多两段，与 pi-web 的 monogram 规则一致 */
function monogram(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Card({
  id,
  label,
  subtitle,
  onClick,
  added = false,
}: {
  id: string;
  label: string;
  subtitle: string;
  onClick: () => void;
  added?: boolean;
}) {
  return (
    <Hint label={`${label} · ${subtitle}`} side="top">
      <button
        type="button"
        onClick={onClick}
        className="picker-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <span className="picker-card-text">
          <span className="picker-card-name">{label}</span>
          <span className="picker-card-sub">{subtitle}</span>
        </span>
        {added ? (
          <span className="picker-card-plus" aria-hidden="true">
            +
          </span>
        ) : (
          <span className="picker-card-mark" aria-hidden="true">
            {monogram(id)}
          </span>
        )}
      </button>
    </Hint>
  );
}

export function ProviderPicker({
  entries,
  onPickApiKey,
  onPickCustom,
  onClose,
}: ProviderPickerProps) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    /* 外层弹层也在听 Esc，先在这里截住，一次按键只关最上层 */
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onClose]);

  const needle = query.trim().toLowerCase();
  const matches = (id: string, label: string) =>
    !needle || label.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);

  const available = useMemo(
    () => entries.filter((entry) => !entry.configured),
    [entries]
  );
  const apiKeys = available.filter(
    (entry) => entry.group === "apikey" && entry.selectable && !entry.custom && matches(entry.id, entry.label)
  );
  const oauth = available.filter(
    (entry) => entry.group === "oauth" && matches(entry.id, entry.label)
  );
  const showCustom =
    !needle ||
    "custom openai anthropic compatible 自定义 端点".includes(needle);
  const total = apiKeys.length + oauth.length + (showCustom ? 1 : 0);

  return (
    <div
      className="picker-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="添加 Provider"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="picker-panel">
        <div className="picker-search">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="6.2" cy="6.2" r="4.4" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.6 9.6 12.4 12.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 Provider…"
            aria-label="搜索 Provider"
            className="picker-search-input"
          />
        </div>

        <div className="picker-body">
          {total === 0 ? (
            <p className="settings-empty">没有匹配的 Provider。</p>
          ) : (
            <div className="picker-grid">
              {showCustom && (
                <>
                  <p className="picker-group-title">自定义</p>
                  <Card
                    id={CUSTOM_ID}
                    label="OpenAI / Anthropic compatible"
                    subtitle="自定义端点格式"
                    added
                    onClick={onPickCustom}
                  />
                </>
              )}

              {oauth.length > 0 && (
                <>
                  <p className="picker-group-title">订阅服务</p>
                  {oauth.map((entry) => (
                    <Card
                      key={`oauth-${entry.id}`}
                      id={entry.id}
                      label={entry.label}
                      subtitle="OAuth"
                      onClick={() =>
                        setNotice(
                          `${entry.label} 走订阅登录，本机版本没有接这条路；要用密钥就在下面 API KEY 组里选同名的家。`
                        )
                      }
                    />
                  ))}
                </>
              )}

              {apiKeys.length > 0 && (
                <>
                  <p className="picker-group-title">API KEY</p>
                  {apiKeys.map((entry) => (
                    <Card
                      key={`apikey-${entry.id}`}
                      id={entry.id}
                      label={entry.label}
                      subtitle={`${entry.modelCount} 个模型`}
                      onClick={() => onPickApiKey(entry.id)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {notice && (
          <p className="picker-notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
