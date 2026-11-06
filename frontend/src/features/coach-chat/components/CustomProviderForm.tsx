/**
 * 自定义兼容端点表单：手填 baseUrl 与模型 id。
 * 目前只支持 OpenAI Chat Completions 兼容接口。
 * 定义写服务端 providers.json，密钥写 .env，两个动作一次提交完成。
 */
import { useState } from "react";
import { FieldHint, SectionTitle } from "@/features/coach-chat/components/SettingsAtoms";
import type { CustomProviderApi } from "@/features/coach-chat/model/chat";

const CUSTOM_API: CustomProviderApi = "openai-completions";

interface CustomProviderFormProps {
  providerId: string;
  onCancel: () => void;
  /** 保存定义；apiKey 为空则只存定义 */
  onSubmit: (input: {
    id: string;
    name: string;
    baseUrl: string;
    api: CustomProviderApi;
    models: { id: string; name?: string }[];
  }, apiKey: string) => Promise<void>;
}

/** 一行一个模型，写成 id 或 id|显示名 */
function parseModelLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, name] = line.split("|").map((part) => part.trim());
      return name ? { id, name } : { id };
    });
}

export function CustomProviderForm({
  providerId,
  onCancel,
  onSubmit,
}: CustomProviderFormProps) {
  const [id, setId] = useState(providerId);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedModels = parseModelLines(models);
  const canSubmit =
    !busy && id.trim() && name.trim() && baseUrl.trim() && parsedModels.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(
        { id: id.trim(), name: name.trim(), baseUrl: baseUrl.trim(), api: CUSTOM_API, models: parsedModels },
        apiKey.trim()
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <div className="custom-form">
      <SectionTitle>自定义 provider</SectionTitle>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="custom-id">
          id（同时决定密钥变量名）
        </label>
        <input
          id="custom-id"
          value={id}
          onChange={(event) => setId(event.target.value)}
          placeholder="local-gateway"
          spellCheck={false}
          className="settings-input"
        />
        <FieldHint>以小写字母开头，可含小写字母、数字与连字符，密钥写进 <code className="settings-code">{id.trim() ? `${id.trim().replace(/-/g, "_").toUpperCase()}_API_KEY` : "…_API_KEY"}</code>。</FieldHint>
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="custom-name">
          显示名
        </label>
        <input
          id="custom-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="本地网关"
          className="settings-input"
        />
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="custom-base">
          Base URL
        </label>
        <input
          id="custom-base"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="http://127.0.0.1:8080/v1"
          spellCheck={false}
          className="settings-input"
        />
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="custom-models">
          模型 id（一行一个，可写 id|显示名）
        </label>
        <textarea
          id="custom-models"
          value={models}
          onChange={(event) => setModels(event.target.value)}
          rows={3}
          spellCheck={false}
          placeholder={"claude-opus-5\nqwen3-32b|通义千问 32B"}
          className="settings-input settings-input-area"
        />
        <FieldHint>
          {parsedModels.length > 0
            ? `已识别 ${parsedModels.length} 个模型。`
            : "至少填一个模型 id。"}
        </FieldHint>
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="custom-key">
          密钥（可稍后在连接区填）
        </label>
        <input
          id="custom-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="settings-input"
        />
      </div>

      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}

      <div className="connection-actions">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="connection-save"
        >
          {busy ? "保存中" : "保存端点"}
        </button>
        <button type="button" onClick={onCancel} className="connection-remove">
          取消
        </button>
      </div>
    </div>
  );
}
