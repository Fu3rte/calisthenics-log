/**
 * 会话读写：列表、单会话 transcript、改名与删除。
 * 服务端 Pi JSONL session tree 是唯一历史来源，这里不做任何浏览器缓存。
 */
import type {
  ChatMessage,
  SessionSummary,
} from "@/features/coach-chat/model/chat";

const SESSIONS_ENDPOINT = `${import.meta.env.BASE_URL}api/sessions`;

/** fetch 直接 reject 时通常就是本机服务没起来 */
const NOT_RUNNING = "本地问答服务没起来，跑 npm run dev 一起启动。";

async function request(
  url: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    throw new Error(NOT_RUNNING, { cause });
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === "object" && payload !== null && "error" in payload) {
      return String((payload as { error: unknown }).error);
    }
  } catch {
    /* 不是 JSON 就用状态码 */
  }
  return `${fallback}（HTTP ${response.status}）`;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const response = await request(SESSIONS_ENDPOINT, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(await readError(response, "读取会话列表失败"));
  }
  const payload = (await response.json().catch(() => null)) as {
    sessions?: SessionSummary[];
  } | null;
  return payload?.sessions ?? [];
}

export async function fetchSessionMessages(id: string): Promise<ChatMessage[]> {
  const response = await request(
    `${SESSIONS_ENDPOINT}/${encodeURIComponent(id)}/messages`,
    { cache: "no-cache" }
  );
  if (!response.ok) {
    throw new Error(await readError(response, "读取会话内容失败"));
  }
  const payload = (await response.json().catch(() => null)) as {
    messages?: ChatMessage[];
  } | null;
  return payload?.messages ?? [];
}

/** name 传空串表示清掉名称，服务端回落到 preview */
export async function renameSession(
  id: string,
  name: string
): Promise<SessionSummary> {
  const response = await request(`${SESSIONS_ENDPOINT}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(await readError(response, "重命名会话失败"));
  }
  const payload = (await response.json().catch(() => null)) as {
    session?: SessionSummary;
  } | null;
  if (!payload?.session) throw new Error("服务端没有返回会话信息。");
  return payload.session;
}

export async function deleteSession(id: string): Promise<void> {
  const response = await request(`${SESSIONS_ENDPOINT}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readError(response, "删除会话失败"));
  }
}
