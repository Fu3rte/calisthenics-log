/**
 * 测试连接：用草稿模型发一句话，量耗时、收回复、拿错误。
 * 走 /api/chat 同一条流式通道，不进任何会话。
 */
import { useEffect, useRef, useState } from "react";
import { streamCoachReply } from "@/features/coach-chat/api/chatStream";

const PROBE = {
  role: "user" as const,
  content: "只回复「可用」两个字，不要解释。",
};

export type ProbeResult =
  | { ok: true; text: string; ms: number }
  | { ok: false; message: string };

export function useModelProbe(draft: string) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async (model: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setResult(null);

    const start = performance.now();
    const parts: string[] = [];
    try {
      for await (const event of streamCoachReply([PROBE], model, controller.signal)) {
        if (event.type === "delta") parts.push(event.text);
      }
      setResult({ ok: true, text: parts.join(""), ms: performance.now() - start });
    } catch (cause) {
      if (!controller.signal.aborted) {
        setResult({
          ok: false,
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  };

  return {
    running,
    result,
    /** 空闲即测，测中即停 */
    toggle: () => {
      if (running) abortRef.current?.abort();
      else if (draft) void run(draft);
    },
  };
}
