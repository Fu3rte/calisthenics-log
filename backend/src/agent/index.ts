/**
 * Agent 层的公开入口：主入口注入模型解析函数，挂上 HTTP 请求处理器。
 */
export { createAgentRequestHandler } from "./http/routes.js";
export type { AgentRequestHandler, AgentRequestHandlerOptions } from "./http/routes.js";
export type { AgentModelSelection, ResolveModelSelection } from "./application/ports.js";
export { createChatRunner, COACH_PROMPT } from "./application/chat.js";
export type { ChatRunInput, ChatFrameEmitter, ChatRunner, ChatRunnerOptions } from "./application/chat.js";
export { createSessionService } from "./application/sessions.js";
export type { SessionService, SessionServiceOptions } from "./application/sessions.js";
export {
  resolveAgentPaths,
  ensureAgentDirs,
  AGENT_DIR_ENV,
  SESSIONS_DIR_NAME,
  PI_DIR_NAME,
  WORKSPACE_DIR_NAME,
} from "./infrastructure/paths.js";
export type { AgentPaths } from "./infrastructure/paths.js";
export { AgentError } from "./domain/types.js";
export type { ChatStreamFrame, SessionSummary, ToolActivity, TranscriptMessage } from "./domain/types.js";
export { buildTranscript, buildTranscriptFromMessages, summarizeDetail } from "./domain/transcript.js";
