/**
 * 添加 Provider：独立 modal，搜索 + 自定义 / API KEY 两组卡片。
 * 结构照 pi-web 的 AddProviderPicker；图标位用 monogram 方块（pi-web 对未知 provider 也是这个回退）。
 * 已配置的家不在这里出现，它们已经在左栏的 provider 列表里。
 */
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import type { PickerEntry } from "@/features/coach-chat/model/chat";

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
  );
}

export function ProviderPicker({
  entries,
  onPickApiKey,
  onPickCustom,
  onClose,
}: ProviderPickerProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const needle = query.trim().toLowerCase();
  const matches = (id: string, label: string) =>
    !needle || label.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);

  const apiKeys = entries.filter(
    (entry) =>
      !entry.configured &&
      entry.group === "apikey" &&
      entry.selectable &&
      !entry.custom &&
      matches(entry.id, entry.label)
  );
  const showCustom =
    !needle ||
    "custom openai anthropic compatible 自定义 端点".includes(needle);
  const total = apiKeys.length + (showCustom ? 1 : 0);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[min(72vh,calc(100dvh-32px))] w-[min(760px,calc(100vw-32px))] flex-col overflow-hidden p-0">
        <DialogTitle className="sr-only">添加 Provider</DialogTitle>
        <DialogDescription className="sr-only">
          搜索并选择要接入的 provider，选中后在右侧填密钥。
        </DialogDescription>

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
      </DialogContent>
    </Dialog>
  );
}
