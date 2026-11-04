/**
 * 一家 provider 的模型列表：条数过阈值才出筛选框，选中只写草稿值。
 */
import { useState } from "react";
import { CheckMark } from "@/features/coach-chat/components/SettingsAtoms";
import {
  MODEL_FILTER_THRESHOLD,
  filterModels,
} from "@/features/coach-chat/model/catalogView";
import type { ModelOption } from "@/features/coach-chat/model/chat";

interface ModelListProps {
  models: ModelOption[];
  /** 草稿值，保存才落地 */
  value: string;
  onChange: (model: string) => void;
}

export function ModelList({ models, value, onChange }: ModelListProps) {
  const [query, setQuery] = useState("");
  const shown = filterModels(models, query);

  return (
    <>
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

      {shown.length === 0 ? (
        <p className="settings-empty">没有匹配的模型。</p>
      ) : (
        <div className="settings-list">
          {shown.map((model) => {
            const on = model.id === value;
            return (
              <button
                key={model.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(model.id)}
                className={`model-row ${on ? "text-foreground" : "text-foreground/70"}`}
              >
                <CheckMark active={on} />
                <span className="model-row-name">{model.label}</span>
                <span className="model-row-id">{model.id}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
