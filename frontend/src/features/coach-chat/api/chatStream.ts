/**
 * 对话传输适配器：POST /api/chat，逐帧读 SSE 的 data 段。
 * 产出纯文本增量，出错抛异常，取消靠 AbortSignal。
 */
import {
  MAX_INPUT,
  trimTurns,
  type ChatMessage,
  type ChatSettings,
} from "@/features/coach-chat/model/chat";

const ENDPOINT = `${import.meta.env.BASE_URL}api/chat`;

interface ChatFrame {
  delta?: string;
  error?: string;
  done?: boolean;
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

export async function* streamCoachReply(
  messages: ChatMessage[],
  settings: ChatSettings | undefined,
  signal: AbortSignal
): AsyncGenerator<string, void, void> {
  const payload = trimTurns(messages).map((message) => ({
    role: message.role,
    content: message.content.slice(0, MAX_INPUT),
  }));

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: payload,
      ...(settings
        ? { settings: { model: settings.model, maxTokens: settings.maxTokens } }
        : {}),
    }),
    signal,
  });

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

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const line = chunk.split("\n").find((row) => row.startsWith("data: "));
        if (line) {
          const frame = JSON.parse(line.slice(6)) as ChatFrame;
          if (frame.error) throw new Error(frame.error);
          if (frame.delta) yield frame.delta;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
