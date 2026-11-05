/**
 * 对话传输适配器：POST /api/chat，逐帧读 SSE 的 data 段。
 * 产出正文增量与工具活动，出错抛异常，取消靠 AbortSignal。
 */
import type { ChatMessage } from "@/features/coach-chat/model/chat";

const ENDPOINT = `${import.meta.env.BASE_URL}api/chat`;

/** 本机服务没起来时 fetch 直接 reject，这里换成照着能做的提示 */
export const NOT_RUNNING = "本地问答服务没起来，跑 npm run dev 一起启动。";

interface ToolFrame {
  state: "call" | "result";
  id: string;
  name: string;
  detail: string;
  isError?: boolean;
  durationMs?: number;
}

interface ChatFrame {
  delta?: string;
  tool?: ToolFrame;
  error?: string;
  done?: boolean;
}

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool_call"; id: string; name: string; detail: string }
  | {
      type: "tool_result";
      id: string;
      name: string;
      detail: string;
      isError: boolean;
      durationMs: number;
    };

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === "object" && data !== null && "error" in data) {
      return String((data as { error: unknown }).error);
    }
  } catch {
    /* 不是 JSON 就用状态码 */
  }
  return `服务返回 ${response.status}`;
}

/** model 为 null 时不带 settings，由服务端用它的默认模型 */
export async function* streamCoachReply(
  messages: ChatMessage[],
  model: string | null,
  signal: AbortSignal
): AsyncGenerator<ChatStreamEvent, void, void> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        ...(model ? { settings: { model } } : {}),
      }),
      signal,
    });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new Error(NOT_RUNNING, { cause });
  }

  if (!response.ok || !response.body) {
    throw new Error(await readErrorMessage(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const chunk of frames) {
        const line = chunk.split("\n").find((row) => row.startsWith("data: "));
        if (!line) continue;
        const frame = JSON.parse(line.slice(6)) as ChatFrame;
        if (frame.error) throw new Error(frame.error);
        if (frame.delta) yield { type: "delta", text: frame.delta };
        if (frame.tool?.state === "call") {
          yield {
            type: "tool_call",
            id: frame.tool.id,
            name: frame.tool.name,
            detail: frame.tool.detail,
          };
        } else if (frame.tool?.state === "result") {
          yield {
            type: "tool_result",
            id: frame.tool.id,
            name: frame.tool.name,
            detail: frame.tool.detail,
            isError: frame.tool.isError ?? false,
            durationMs: frame.tool.durationMs ?? 0,
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
