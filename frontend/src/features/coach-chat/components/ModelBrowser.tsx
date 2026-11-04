/**
 * 配置面板主体：左栏 provider 列表 + 底部添加入口，右栏随左栏与添加流程切内容。
 *
 * 清单只含已配置的 provider，一家都没有时指向左栏底部的添加入口。
 */
import { useMemo, useState } from "react";
import { fetchPicker } from "@/features/coach-chat/api/providerApi";
import { CustomProviderForm } from "@/features/coach-chat/components/CustomProviderForm";
import { ModelList } from "@/features/coach-chat/components/ModelList";
import { ProviderKeyForm } from "@/features/coach-chat/components/ProviderKeyForm";
import { ProviderPicker } from "@/features/coach-chat/components/ProviderPicker";
import { SectionTitle } from "@/features/coach-chat/components/SettingsAtoms";
import { useChatSettings } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import { groupByProvider } from "@/features/coach-chat/model/catalogView";
import type { PickerEntry } from "@/features/coach-chat/model/chat";

const CUSTOM_ID = "my-gateway";

type Detail =
  | { kind: "models" }
  | { kind: "key"; provider: string }
  | { kind: "custom" };

interface ModelBrowserProps {
  /** 草稿模型 id，保存才落地 */
  model: string;
  onPick: (model: string) => void;
}

export function ModelBrowser({ model, onPick }: ModelBrowserProps) {
  const { catalog, addCustom, updateKey } = useChatSettings();
  const [picked, setPicked] = useState("");
  const [detail, setDetail] = useState<Detail>({ kind: "models" });
  const [entries, setEntries] = useState<PickerEntry[]>([]);
  const [picking, setPicking] = useState(false);

  const groups = useMemo(() => groupByProvider(catalog?.models ?? []), [catalog]);
  const currentProvider = model.split("/")[0] ?? "";
  /* 没手动选过就落在草稿模型那家，那家不在清单里时落第一家 */
  const active =
    picked ||
    (groups.some((group) => group.provider === currentProvider)
      ? currentProvider
      : "") ||
    (groups[0]?.provider ?? "");

  const openPicker = async () => {
    try {
      setEntries(await fetchPicker());
      setPicking(true);
    } catch {
      /* 拉不到就不开层，右栏维持现状 */
    }
  };

  const group = groups.find((item) => item.provider === active);

  return (
    <div className="model-picker">
      <div className="model-rail" role="group" aria-label="Provider">
        {groups.map((entry) => (
          <button
            key={entry.provider}
            type="button"
            aria-pressed={detail.kind !== "custom" && entry.provider === active}
            onClick={() => {
              setPicked(entry.provider);
              setDetail({ kind: "models" });
            }}
            className="model-rail-item"
          >
            <span className="model-rail-name">{entry.label}</span>
            <span className="settings-count">{entry.models.length}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => void openPicker()}
          className="model-rail-item model-rail-add"
        >
          <span aria-hidden="true">+</span>
          <span className="model-rail-name">添加 Provider</span>
        </button>
      </div>

      <div className="model-detail">
        {detail.kind === "key" && (
          <ProviderKeyForm
            provider={detail.provider}
            onDone={() => setDetail({ kind: "models" })}
          />
        )}

        {detail.kind === "custom" && (
          <CustomProviderForm
            providerId={CUSTOM_ID}
            onCancel={() => setDetail({ kind: "models" })}
            onSubmit={async (input, apiKey) => {
              await addCustom(input);
              if (apiKey) await updateKey(input.id, apiKey);
              setPicked(input.id);
              setDetail({ kind: "models" });
            }}
          />
        )}

        {detail.kind === "models" &&
          (group ? (
            <>
              <div className="settings-section-head">
                <SectionTitle>{group.label}</SectionTitle>
                <span className="settings-count">{group.models.length} 个</span>
                <button
                  type="button"
                  onClick={() => setDetail({ kind: "key", provider: group.provider })}
                  className="settings-manage"
                >
                  管理连接
                </button>
              </div>
              <ModelList key={group.provider} models={group.models} value={model} onChange={onPick} />
            </>
          ) : (
            <p className="settings-empty">
              还没有可用的模型：一家 provider 都没配置，用左栏底部的「添加 Provider」接入。
            </p>
          ))}
      </div>

      {picking && (
        <ProviderPicker
          entries={entries}
          onPickApiKey={(provider) => {
            setPicking(false);
            setPicked(provider);
            setDetail({ kind: "key", provider });
          }}
          onPickCustom={() => {
            setPicking(false);
            setDetail({ kind: "custom" });
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
