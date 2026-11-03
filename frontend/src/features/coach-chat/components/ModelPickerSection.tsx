/**
 * 模型分区：provider 分组 + 筛选 + 当前/全部范围切换。
 * 清单只含已配置的 provider，所以这里不再判断可用与否；一家都没有时指向连接区。
 */
import { useMemo, useState } from "react";
import { CheckMark, SectionTitle } from "@/features/coach-chat/components/SettingsAtoms";
import {
  MODEL_FILTER_THRESHOLD,
  groupModels,
} from "@/features/coach-chat/model/catalogView";
import type { ModelCatalog } from "@/features/coach-chat/model/chat";

interface ModelPickerSectionProps {
  catalog: ModelCatalog | null;
  /** 草稿值，保存才落地 */
  value: string;
  onChange: (model: string) => void;
  onOpenConnection: () => void;
}

export function ModelPickerSection({
  catalog,
  value,
  onChange,
  onOpenConnection,
}: ModelPickerSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");

  const currentProvider = value.split("/")[0] ?? "";
  const models = useMemo(() => {
    const all = catalog?.models ?? [];
    return showAll ? all : all.filter((model) => model.provider === currentProvider);
  }, [catalog, showAll, currentProvider]);

  const groups = useMemo(() => groupModels(models, query), [models, query]);

  if ((catalog?.models.length ?? 0) === 0) {
    return (
      <div className="settings-section">
        <SectionTitle>模型</SectionTitle>
        <p className="rounded-[14px] border border-black/[0.06] px-3 py-3 text-[12.5px] leading-[1.6] text-muted-foreground">
          还没有可用的模型：服务端没返回清单，或一家 provider 都没配置。
          <button
            type="button"
            onClick={onOpenConnection}
            className="underline underline-offset-4 transition-colors hover:text-foreground"
          >
            去连接
          </button>
          添加一家。
        </p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <SectionTitle>模型</SectionTitle>
        <span className="settings-count">{models.length} 个</span>
        <div className="settings-segment" role="group" aria-label="模型范围">
          <button
            type="button"
            aria-pressed={!showAll}
            onClick={() => setShowAll(false)}
            className="settings-segment-btn"
          >
            当前 provider
          </button>
          <button
            type="button"
            aria-pressed={showAll}
            onClick={() => setShowAll(true)}
            className="settings-segment-btn"
          >
            全部
          </button>
        </div>
      </div>

      {models.length > MODEL_FILTER_THRESHOLD && (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`筛选 ${models.length} 个模型…`}
          aria-label="筛选模型"
          className="settings-filter"
        />
      )}

      {groups.length === 0 ? (
        <p className="settings-empty">没有匹配的模型。</p>
      ) : (
        <div className="settings-list">
          {groups.map((group) => (
            <section key={group.provider}>
              <p className="model-group-title">
                <span>{group.label}</span>
                <span className="settings-count">{group.models.length}</span>
              </p>
              {group.models.map((model) => {
                const active = model.id === value;
                return (
                  <button
                    key={model.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange(model.id)}
                    className={`model-row ${active ? "text-foreground" : "text-foreground/70"}`}
                  >
                    <CheckMark active={active} />
                    <span className="model-row-name">{model.label}</span>
                    <span className="model-row-id">{model.id}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
