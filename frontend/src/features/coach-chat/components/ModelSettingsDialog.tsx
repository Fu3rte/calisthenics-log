/**
 * 模型配置面板：provider 左栏 + 模型右栏 + 页脚保存。
 *
 * 入口在侧栏底部，两个路由共用，所以由壳层挂载而不是聊天页。
 */
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import { GlassButton } from "@/shared/ui/glass-button";
import { Close } from "@/shared/ui/icons";
import { ModelBrowser } from "@/features/coach-chat/components/ModelBrowser";
import { useChatSettings } from "@/features/coach-chat/hooks/ChatSettingsProvider";
import { useModelProbe } from "@/features/coach-chat/hooks/useModelProbe";

interface SettingsPanelProps {
  /** 已保存的模型，面板里改的是草稿 */
  initialModel: string;
  onSave: (model: string) => void;
  onReset: () => void;
  onClose: () => void;
}

function SettingsPanel({
  initialModel,
  onSave,
  onReset,
  onClose,
}: SettingsPanelProps) {
  const [model, setModel] = useState(initialModel);
  const probe = useModelProbe(model);

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <DialogTitle>模型配置</DialogTitle>
          <DialogDescription>
            选哪个模型存这台浏览器，回复上限与密钥存服务端。
          </DialogDescription>
        </div>
        <GlassButton
          variant="quiet"
          onClick={onClose}
          aria-label="关闭"
          className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full"
        >
          <Close size={16} />
        </GlassButton>
      </header>

      <div className="mt-5">
        <ModelBrowser model={model} onPick={setModel} />
      </div>

      {(probe.running || probe.result) && (
        <p className="settings-probe" role="status">
          {probe.running && (
            <span>
              正在请求 <span className="num">{model}</span>…
            </span>
          )}
          {probe.result?.ok && (
            <span>
              <span className="num">{(probe.result.ms / 1000).toFixed(1)}s</span> ·{" "}
              {probe.result.text || "（空回复）"}
            </span>
          )}
          {probe.result && !probe.result.ok && (
            <span className="settings-probe-error">{probe.result.message}</span>
          )}
        </p>
      )}

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
            onClick={probe.toggle}
            disabled={!model}
            className="inline-flex h-11 items-center rounded-full px-4 text-[13px]"
          >
            {probe.running ? "停止" : "测试连接"}
          </GlassButton>
          <GlassButton
            variant="quiet"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-full px-4 text-[13px]"
          >
            取消
          </GlassButton>
          <GlassButton
            variant="ink"
            onClick={() => onSave(model)}
            disabled={!model || model === initialModel}
            className="inline-flex h-11 items-center rounded-full px-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-35"
          >
            保存
          </GlassButton>
        </div>
      </footer>
    </>
  );
}

export function CoachSettingsHost() {
  const { model, open, setOpen, save, reset } = useChatSettings();
  /* 打开时记下触发元素，关闭后焦点回到原处 */
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) openerRef.current = active;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="w-[min(680px,calc(100vw-32px))]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = openerRef.current;
          const target = opener?.isConnected
            ? opener
            : document.getElementById("model-settings-trigger");
          target?.focus();
        }}
      >
        <SettingsPanel
          initialModel={model ?? ""}
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
