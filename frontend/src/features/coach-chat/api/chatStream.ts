/**
 * 对话传输适配器：POST /api/chat，逐帧读 SSE 的 data 段。
 * 会话 id 由服务端第一帧给出，正文与工具活动随后增量到达。
 * 出错抛异常，取消靠 AbortSignal。
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
  sessionId?: string;
  delta?: string;
  tool?: ToolFrame;
  error?: string;
  done?: boolean;
  aborted?: boolean;
}

export type ChatStreamEvent =
  | { type: "session"; id: string }
  | { type: "delta"; text: string }
  | { type: "tool_call"; id: string; name: string; detail: string }
  | {
      type: "tool_result";
      id: string;
      name: string;
      detail: string;
      isError: boolean;
      durationMs: number;
    }
  | { type: "done"; aborted: boolean };

export interface CoachReplyInput {
  /** null 表示开一段新会话，服务端在 session 帧里回 id */
  sessionId: string | null;
  message: string;
  model: string | null;
  /** 探针用：服务端不落盘、不建会话 */
  ephemeral?: boolean;
}

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

function lastUserText(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return messages[index].content;
  }
  return "";
}

/** model 为 null 时不带 model 字段，由服务端用它的默认模型 */
export function streamCoachReply(
  input: CoachReplyInput,
  signal: AbortSignal
): AsyncGenerator<ChatStreamEvent, void, void>;
/**
 * 兼容模型设置里的连通性探针（useModelProbe 仍在旧调用上）：
 * 取最后一条 user 文本，以临时运行发送，服务端不建会话也不落盘。
 */
export function streamCoachReply(
  messages: ChatMessage[],
  model: string | null,
  signal: AbortSignal
): AsyncGenerator<ChatStreamEvent, void, void>;
export async function* streamCoachReply(
  inputOrMessages: CoachReplyInput | ChatMessage[],
  modelOrSignal: string | null | AbortSignal,
  legacySignal?: AbortSignal
): AsyncGenerator<ChatStreamEvent, void, void> {
  const legacy = Array.isArray(inputOrMessages);
  const input: CoachReplyInput = legacy
    ? {
        sessionId: null,
        message: lastUserText(inputOrMessages),
        model: (modelOrSignal as string | null) ?? null,
        ephemeral: true,
      }
    : (inputOrMessages as CoachReplyInput);
  const signal = legacy
    ? (legacySignal as AbortSignal)
    : (modelOrSignal as AbortSignal);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        message: input.message,
        ...(input.model ? { model: input.model } : {}),
        ...(input.ephemeral ? { ephemeral: true } : {}),
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

        /* 错误帧是终止帧，先抛出去，后面的增量不再处理 */
        if (frame.error) throw new Error(frame.error);

        if (frame.sessionId) {
          yield { type: "session", id: frame.sessionId };
        }
        if (typeof frame.delta === "string" && frame.delta.length > 0) {
          yield { type: "delta", text: frame.delta };
        }
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
        if (frame.done) {
          yield { type: "done", aborted: frame.aborted ?? false };
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
