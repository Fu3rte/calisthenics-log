/**
 * transcript 纯函数：把 Pi 的 SessionEntry / AgentMessage 映射成前端可渲染的消息。
 * 只保留 user 与 assistant 的正文与工具活动，系统消息、扩展消息、bash 记录一律跳过。
 */
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { ToolActivity, TranscriptMessage } from "./types.js";

const MAX_DETAIL_LENGTH = 120;

/** 把任意值压成单行摘要，供工具活动展示；超长按字符截断 */
export function summarizeDetail(value: unknown): string {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value) ?? "";
    } catch {
      text = String(value);
    }
  }
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= MAX_DETAIL_LENGTH) return singleLine;
  return `${singleLine.slice(0, MAX_DETAIL_LENGTH - 1)}…`;
}

function textOfContent(
  content: string | readonly { type: string; text?: string }[]
): string {
  if (typeof content === "string") return content;
  let text = "";
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") text += block.text;
  }
  return text;
}

/** 取一条消息的纯文本，用于列表预览；取不到返回空串 */
export function extractMessageText(message: AgentMessage): string {
  if (message.role === "user") return textOfContent(message.content);
  if (message.role === "assistant") {
    let text = "";
    for (const block of message.content) {
      if (block.type === "text") text += block.text;
    }
    return text;
  }
  return "";
}

/** 只在消息条目里找 transcript，其它条目（改名、压缩、扩展状态）不参与 */
export function buildTranscript(entries: readonly SessionEntry[]): TranscriptMessage[] {
  const messages: AgentMessage[] = [];
  for (const entry of entries) {
    if (entry.type === "message") messages.push(entry.message);
  }
  return buildTranscriptFromMessages(messages);
}

/** 按时间顺序折叠消息；toolResult 按 toolCallId 回填到对应活动上 */
export function buildTranscriptFromMessages(
  messages: readonly AgentMessage[]
): TranscriptMessage[] {
  const transcript: TranscriptMessage[] = [];
  const activitiesById = new Map<string, ToolActivity>();

  for (const message of messages) {
    if (message.role === "user") {
      const content = textOfContent(message.content);
      if (content.trim()) transcript.push({ role: "user", content });
      continue;
    }

    if (message.role === "assistant") {
      let content = "";
      const activities: ToolActivity[] = [];
      for (const block of message.content) {
        if (block.type === "text") {
          content += block.text;
        } else if (block.type === "toolCall") {
          const activity: ToolActivity = {
            id: block.id,
            name: block.name,
            detail: summarizeDetail(block.arguments),
            state: "call",
          };
          activities.push(activity);
          activitiesById.set(activity.id, activity);
        }
      }

      /* 正文与活动都空的 assistant 没有展示价值 */
      if (!content.trim() && activities.length === 0) continue;

      const item: TranscriptMessage = { role: "assistant", content };
      if (activities.length > 0) item.activities = activities;
      if (message.stopReason === "aborted" || message.stopReason === "error") {
        item.stopped = true;
      }
      transcript.push(item);
      continue;
    }

    if (message.role === "toolResult") {
      const activity = activitiesById.get(message.toolCallId);
      if (!activity) continue;
      activity.state = "result";
      activity.isError = message.isError;
      if (typeof message.durationMs === "number") {
        activity.durationMs = message.durationMs;
      }
    }
  }

  return transcript;
}
