/**
 * 对话与历史记录的领域类型：会话摘要、transcript 消息、工具活动与 SSE 帧。
 * 不触碰文件系统，也不含 HTTP 细节。
 */

/** 可直接映射成 HTTP 状态码的 agent 错误 */
export class AgentError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentError";
    this.status = status;
  }
}

/** 会话列表的一行；时间统一为 ISO 字符串 */
export interface SessionSummary {
  id: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

/** 一次工具调用或结果的展示数据 */
export interface ToolActivity {
  id: string;
  name: string;
  detail: string;
  state: "call" | "result";
  isError?: boolean;
  durationMs?: number;
}

/** 历史记录里的一条消息 */
export interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
  activities?: ToolActivity[];
  /** assistant 未正常收尾（用户中止或出错） */
  stopped?: boolean;
}

/** POST /api/chat 的 SSE 帧 */
export type ChatStreamFrame =
  | { sessionId: string }
  | { delta: string }
  | { tool: ToolActivity }
  | { error: string }
  | { done: true; aborted: boolean };
