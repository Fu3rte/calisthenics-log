/**
 * 模型配置面板：分区（模型 / 参数 / 连接）+ 页脚保存。
 *
 * 结构照 pi-web 的 Settings：顶部 section tabs、选中态用背景加深与字重、说明文字常驻。
 * 入口在侧栏底部，两个路由共用，所以由壳层挂载而不是聊天页。
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import { GlassButton } from "@/shared/ui/glass-button";
import { Hint } from "@/shared/ui/hint";
import { ConnectionSection } from "@/features/coach-chat/components/ConnectionSection";
import { ModelPickerSection } from "@/features/coach-chat/components/ModelPickerSection";
import { FieldHint, SectionTitle } from "@/features/coach-chat/components/SettingsAtoms";
import { useChatSettings } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import {
  clampMaxTokens,
  MAX_MAX_TOKENS,
  MIN_MAX_TOKENS,
  sameSettings,
  type ChatSettings,
  type ModelCatalog,
} from "@/features/coach-chat/model/chat";

type SectionId = "model" | "params" | "connection";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "model", label: "模型" },
  { id: "params", label: "参数" },
  { id: "connection", label: "连接" },
];

interface SettingsPanelProps {
  catalog: ModelCatalog | null;
  settings: ChatSettings | null;
  onSave: (next: ChatSettings) => void;
  onReset: () => void;
  onClose: () => void;
}

function SettingsPanel({
  catalog,
  settings,
  onSave,
  onReset,
  onClose,
}: SettingsPanelProps) {
  const [section, setSection] = useState<SectionId>("model");

  const initial: ChatSettings = settings ?? catalog?.defaults ?? {
    model: "",
    maxTokens: 900,
  };
  const [model, setModel] = useState(initial.model);
  const [tokens, setTokens] = useState(String(initial.maxTokens));

  const parsed = Number(tokens);
  const invalid =
    !Number.isInteger(parsed) ||
    parsed < MIN_MAX_TOKENS ||
    parsed > MAX_MAX_TOKENS;
  const dirty = !sameSettings(
    { model, maxTokens: invalid ? initial.maxTokens : parsed },
    initial
  );

  const commit = () => {
    if (invalid) return;
    onSave({ model, maxTokens: clampMaxTokens(parsed) });
  };

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <DialogTitle>模型配置</DialogTitle>
          <DialogDescription>
            模型与回复上限存这台浏览器，密钥存服务端 .env。
          </DialogDescription>
        </div>
        <Hint label="关闭" side="bottom">
          <GlassButton
            variant="quiet"
            onClick={onClose}
            aria-label="关闭"
            intensity={0.06}
            className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full"
          >
            <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path
                d="M3 3l9 9M12 3l-9 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </GlassButton>
        </Hint>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="配置分区">
        {SECTIONS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={section === entry.id}
            onClick={() => setSection(entry.id)}
            className="settings-tab focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-5">
        {section === "model" && (
          <ModelPickerSection
            catalog={catalog}
            value={model}
            onChange={setModel}
            onOpenConnection={() => setSection("connection")}
          />
        )}

        {section === "params" && (
          <div className="settings-section">
            <div className="settings-section-head">
              <SectionTitle>回复上限</SectionTitle>
              <span className="settings-count">
                默认 {catalog?.defaults.maxTokens ?? 900}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={MIN_MAX_TOKENS}
                max={MAX_MAX_TOKENS}
                step={64}
                value={tokens}
                aria-invalid={invalid || undefined}
                aria-label="单次回复 token 上限"
                onChange={(event) => setTokens(event.target.value)}
                className={`settings-input flex-1 ${
                  invalid ? "settings-input-invalid" : ""
                }`}
              />
              <span className="shrink-0 text-[12px] text-muted-foreground">tokens</span>
            </div>
            <FieldHint invalid={invalid}>
              {invalid
                ? `${MIN_MAX_TOKENS}–${MAX_MAX_TOKENS} 之间的整数。`
                : `范围 ${MIN_MAX_TOKENS}–${MAX_MAX_TOKENS}。数值越大回答越长，也越贵。`}
            </FieldHint>
          </div>
        )}

        {section === "connection" && <ConnectionSection />}
      </div>

      {section !== "connection" && (
        <footer className="settings-footer">
          <button
            type="button"
            onClick={onReset}
            className="text-[12.5px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            恢复默认
          </button>
          <div className="flex items-center gap-2">
            <GlassButton
              variant="quiet"
              onClick={onClose}
              intensity={0.05}
              className="inline-flex h-11 items-center rounded-full px-4 text-[13px]"
            >
              取消
            </GlassButton>
            <GlassButton
              variant="ink"
              onClick={commit}
              disabled={invalid || !dirty || !model}
              intensity={0.05}
              className="inline-flex h-11 items-center rounded-full px-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-35"
            >
              保存
            </GlassButton>
          </div>
        </footer>
      )}
    </>
  );
}

export function CoachSettingsHost() {
  const { catalog, settings, open, setOpen, save, reset } = useChatSettings();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="w-[min(680px,calc(100vw-32px))]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("model-settings-trigger")?.focus();
        }}
      >
        <SettingsPanel
          catalog={catalog}
          settings={settings}
          onSave={(next) => {
            save(next);
            setOpen(false);
          }}
          onReset={() => {
            reset();
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
