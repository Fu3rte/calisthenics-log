/**
 * 连接区：已配置的 provider 列表 + 「添加 Provider」浮层 + 自定义端点表单。
 * 密钥写服务端 backend/.env，接口只回掩码；列表只显示已配置的家与刚选中待填的那一家。
 */
import { useEffect, useRef, useState } from "react";
import { CustomProviderForm } from "@/features/coach-chat/components/CustomProviderForm";
import { ProviderPicker } from "@/features/coach-chat/components/ProviderPicker";
import { FieldHint, SectionTitle } from "@/features/coach-chat/components/SettingsAtoms";
import { useChatSettings } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import type { ProviderCredential } from "@/features/coach-chat/model/chat";
import { Hint } from "@/shared/ui/hint";

const SOURCE_TEXT = {
  file: "backend/.env",
  system: "系统环境变量",
  pi: "本机 pi 登录态",
} as const;

export function ConnectionSection() {
  const { credentials, picker, loadPicker, updateKey, addCustom, removeCustom } =
    useChatSettings();
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [customFor, setCustomFor] = useState<string | null>(null);

  const rows = credentials.filter(
    (item) => item.configured || item.provider === pending
  );

  const openPicker = async () => {
    setPicking(true);
    try {
      await loadPicker();
    } catch {
      /* 拉不到选取层就在浮层里显示空列表 */
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <SectionTitle>连接</SectionTitle>
        <span className="settings-count">已配置 {rows.filter((r) => r.configured).length} 家</span>
      </div>
      <FieldHint>
        密钥存在服务端的 <code className="settings-code">.env</code> 里，浏览器不保存，接口也只回掩码。
      </FieldHint>

      <div className="settings-list">
        {rows.length === 0 ? (
          <p className="settings-empty">
            还没有已配置的 provider，下面添加一家。
          </p>
        ) : (
          rows.map((credential) => (
            <ConnectionRow
              key={credential.provider}
              credential={credential}
              focused={credential.provider === pending}
              onSave={async (apiKey) => {
                await updateKey(credential.provider, apiKey);
                if (apiKey.trim()) setPending(null);
              }}
              onRemove={
                credential.custom
                  ? async () => {
                      await removeCustom(credential.provider);
                      if (pending === credential.provider) setPending(null);
                    }
                  : undefined
              }
            />
          ))
        )}
      </div>

      {customFor ? (
        <CustomProviderForm
          providerId={customFor}
          onCancel={() => setCustomFor(null)}
          onSubmit={async (input, apiKey) => {
            await addCustom(input);
            if (apiKey) await updateKey(input.id, apiKey);
            setCustomFor(null);
            setPending(input.id);
          }}
        />
      ) : (
        <div className="connection-add">
          <button
            type="button"
            onClick={() => void openPicker()}
            className="connection-add-btn"
          >
            <span aria-hidden="true">+</span> 添加 Provider
          </button>
        </div>
      )}

      {picking && picker && (
        <ProviderPicker
          entries={picker}
          onPickApiKey={(provider) => {
            setPicking(false);
            setPending(provider);
          }}
          onPickCustom={() => {
            setPicking(false);
            setCustomFor("my-gateway");
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function ConnectionRow({
  credential,
  focused,
  onSave,
  onRemove,
}: {
  credential: ProviderCredential;
  focused: boolean;
  onSave: (apiKey: string) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focused) inputRef.current?.focus();
  }, [focused]);

  const submit = async (apiKey: string) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(apiKey);
      setDraft("");
      setVisible(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="connection-row">
      <div className="connection-head">
        <span className="connection-name">{credential.providerLabel}</span>
        <span className="connection-status" data-on={credential.configured}>
          <span className="status-dot" aria-hidden="true" />
          {credential.configured ? "已配置" : "未配置"}
        </span>
        <span className="settings-count">
          {credential.source ? SOURCE_TEXT[credential.source] : credential.envVar}
        </span>
        {credential.custom && <span className="model-group-flag">自定义</span>}
      </div>

      <div className="secret-field">
        <input
          ref={inputRef}
          type={visible ? "text" : "password"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim()) void submit(draft);
          }}
          placeholder={credential.masked ?? credential.envVar}
          autoComplete="off"
          spellCheck={false}
          aria-label={`${credential.providerLabel} 密钥`}
          aria-invalid={error ? true : undefined}
          className="settings-input settings-input-secret"
        />
        <Hint label={visible ? "隐藏密钥" : "显示密钥"} side="left">
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "隐藏密钥" : "显示密钥"}
            className="secret-toggle"
          >
            {visible ? (
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M2.6 12.4C1.9 11.4 1.5 10.2 1.5 9c0-1.2.4-2.4 1.1-3.4A7.6 7.6 0 0 1 9 2.6a7.6 7.6 0 0 1 6.4 3c.7 1 1.1 2.2 1.1 3.4s-.4 2.4-1.1 3.4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
                <path d="M3 15 15 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M2.6 12.4C1.9 11.4 1.5 10.2 1.5 9c0-1.2.4-2.4 1.1-3.4A7.6 7.6 0 0 1 9 2.6a7.6 7.6 0 0 1 6.4 3c.7 1 1.1 2.2 1.1 3.4s-.4 2.4-1.1 3.4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            )}
          </button>
        </Hint>
      </div>

      <div className="connection-actions">
        <button
          type="button"
          disabled={busy || !draft.trim() || saved}
          onClick={() => void submit(draft)}
          className="connection-save"
        >
          {saved ? "已保存" : busy ? "保存中" : "保存密钥"}
        </button>
        {credential.configured && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit("")}
            className="connection-remove"
          >
            断开
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRemove()}
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
