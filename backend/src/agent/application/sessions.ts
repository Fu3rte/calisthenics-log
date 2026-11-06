/**
 * 会话用例：列表、transcript、改名、删除。
 * 全部以 Pi 的 JSONL 会话文件为事实源，删除前校验路径必须落在会话目录内。
 */
import { unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { buildTranscript, extractMessageText } from "../domain/transcript.js";
import { AgentError, type SessionSummary, type TranscriptMessage } from "../domain/types.js";

const MAX_PREVIEW_LENGTH = 120;

export interface SessionServiceOptions {
  sessionDir: string;
  workspaceDir: string;
}

export interface SessionService {
  list(): Promise<SessionSummary[]>;
  transcript(id: string): Promise<TranscriptMessage[]>;
  rename(id: string, name: string): Promise<SessionSummary>;
  remove(id: string): Promise<void>;
}

function previewOf(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (!singleLine) return "";
  if (singleLine.length <= MAX_PREVIEW_LENGTH) return singleLine;
  return `${singleLine.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
}

function toIso(value: number | string | Date, fallback: Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return (Number.isNaN(date.getTime()) ? fallback : date).toISOString();
}

/** 只接受会话目录内的文件，防止 id 里带出目录穿越 */
function assertWithin(baseDir: string, target: string): void {
  const rel = relative(resolve(baseDir), resolve(target));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new AgentError("会话路径不合法。", 400);
  }
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  const { sessionDir, workspaceDir } = options;

  function locate(id: string): string {
    const path = SessionManager.findById(workspaceDir, id, sessionDir);
    if (!path) throw new AgentError("会话不存在。", 404);
    assertWithin(sessionDir, path);
    return path;
  }

  function summarize(manager: SessionManager): SessionSummary {
    const header = manager.getHeader();
    const now = new Date();
    const entries = manager.getEntries();

    let messageCount = 0;
    let preview = "";
    let lastActivity = 0;
    for (const entry of entries) {
      if (entry.type !== "message") continue;
      const message = entry.message;
      /* 只统计能出现在 transcript 里的消息，system / toolResult 不计入 */
      if (message.role !== "user" && message.role !== "assistant") continue;
      messageCount += 1;
      if (typeof message.timestamp === "number") {
        lastActivity = Math.max(lastActivity, message.timestamp);
      }
      if (!preview && message.role === "user") {
        preview = extractMessageText(message);
      }
    }

    const createdAt = toIso(header?.timestamp ?? now, now);
    return {
      id: manager.getSessionId(),
      name: manager.getSessionName() ?? null,
      createdAt,
      updatedAt: toIso(lastActivity || createdAt, now),
      messageCount,
      preview: previewOf(preview),
    };
  }

  return {
    async list() {
      const infos = await SessionManager.list(workspaceDir, sessionDir);
      const summaries: SessionSummary[] = [];
      for (const info of infos) {
        let messageCount = info.messageCount;
        try {
          const manager = SessionManager.open(info.path, sessionDir, workspaceDir);
          messageCount = manager
            .getEntries()
            .filter(
              (entry) =>
                entry.type === "message" &&
                (entry.message.role === "user" || entry.message.role === "assistant")
            ).length;
        } catch {
          /* 文件读不动时退回 SDK 的统计，至少列表还能显示 */
        }
        summaries.push({
          id: info.id,
          name: info.name?.trim() || null,
          createdAt: toIso(info.created, new Date()),
          updatedAt: toIso(info.modified, new Date()),
          messageCount,
          preview: previewOf(info.firstMessage === "(no messages)" ? "" : info.firstMessage),
        });
      }
      return summaries;
    },

    async transcript(id) {
      const manager = SessionManager.open(locate(id), sessionDir, workspaceDir);
      /* 只取当前叶子所在的分支，被放弃的分支不出现在对话里 */
      return buildTranscript(manager.getBranch());
    },

    async rename(id, name) {
      const manager = SessionManager.open(locate(id), sessionDir, workspaceDir);
      manager.appendSessionInfo(name);
      return summarize(manager);
    },

    async remove(id) {
      const path = locate(id);
      try {
        await unlink(path);
      } catch (error) {
        /* 并发删除时文件可能已经不在，视为成功 */
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
