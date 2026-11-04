/**
 * 一家 provider 的密钥写入：掩码占位、显示切换、保存、断开、删掉自定义端点。
 * 密钥只进服务端 backend/.env，浏览器拿到的永远是掩码。
 */
import { useEffect, useRef, useState } from "react";
import { FieldHint, SectionTitle } from "@/features/coach-chat/components/SettingsAtoms";
import { useChatSettings } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import { Eye } from "@/shared/ui/icons";

interface ProviderKeyFormProps {
  provider: string;
  /** 密钥写完或端点删掉后回模型列表 */
  onDone: () => void;
}

export function ProviderKeyForm({ provider, onDone }: ProviderKeyFormProps) {
  const { credentials, updateKey, removeCustom } = useChatSettings();
  const credential = credentials.find((item) => item.provider === provider);
  const [draft, setDraft] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (!credential) {
    return (
      <p className="settings-empty">还没拿到 {provider} 的连接信息，重开面板试试。</p>
    );
  }

  const run = async (task: () => Promise<void>, then?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      then?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const saveKey = () =>
    void run(() => updateKey(provider, draft), () => {
      setDraft("");
      onDone();
    });

  return (
    <div className="settings-field">
      <div className="flex items-center gap-2">
        <SectionTitle>{credential.providerLabel}</SectionTitle>
        {credential.custom && <span className="model-group-flag">自定义</span>}
        <span className="settings-count">
          {credential.configured ? "已配置" : "未配置"}
        </span>
      </div>

      <div className="secret-field">
        <input
          ref={inputRef}
          type={visible ? "text" : "password"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim()) saveKey();
          }}
          placeholder={credential.masked ?? credential.envVar}
          autoComplete="off"
          spellCheck={false}
          aria-label={`${credential.providerLabel} 密钥`}
          aria-invalid={error ? true : undefined}
          className="settings-input settings-input-secret"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "隐藏密钥" : "显示密钥"}
          className="secret-toggle"
        >
          <Eye off={visible} />
        </button>
      </div>

      <FieldHint>
        写进服务端的 <code className="settings-code">{credential.envVar}</code>，这台浏览器只留掩码。
      </FieldHint>

      <div className="connection-actions">
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={saveKey}
          className="connection-save"
        >
          {busy ? "保存中" : "保存密钥"}
        </button>
        {credential.configured && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => updateKey(provider, ""))}
            className="connection-remove"
          >
            断开连接
          </button>
        )}
        {credential.custom && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => removeCustom(provider), onDone)}
            className="connection-remove"
          >
            删除端点
          </button>
        )}
      </div>

      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
