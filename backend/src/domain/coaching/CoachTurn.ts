/** 对话轮次值对象与入参校验 */

export type CoachTurnRole = "user" | "assistant";

export interface CoachTurn {
  readonly role: CoachTurnRole;
  readonly content: string;
}

/** 带上游模型的历史轮数上限 */
export const MAX_TURNS = 12;

/** 单条输入上限 */
export const MAX_INPUT = 2000;

export class CoachTurnInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachTurnInvalidError";
  }
}

function isRole(value: unknown): value is CoachTurnRole {
  return value === "user" || value === "assistant";
}

/** 把 HTTP 请求体解析成合法轮次；非法直接抛 CoachTurnInvalidError */
export function parseTurns(raw: unknown): CoachTurn[] {
  if (!raw || typeof raw !== "object") {
    throw new CoachTurnInvalidError("请求体必须是对象");
  }
  const payload = raw as Record<string, unknown>;
  if (!Array.isArray(payload.messages)) {
    throw new CoachTurnInvalidError("messages 必须是数组");
  }

  const turns: CoachTurn[] = [];
  for (const item of payload.messages) {
    if (!item || typeof item !== "object") continue;
    const message = item as Record<string, unknown>;
    if (!isRole(message.role) || typeof message.content !== "string") continue;
    const content = message.content.slice(0, MAX_INPUT);
    if (!content.trim()) continue;
    turns.push({ role: message.role, content });
  }

  const recent = turns.slice(-MAX_TURNS);
  if (recent.length === 0) {
    throw new CoachTurnInvalidError("没有可用的消息");
  }
  if (recent[recent.length - 1].role !== "user") {
    throw new CoachTurnInvalidError("最后一条必须是用户消息");
  }
  return recent;
}
