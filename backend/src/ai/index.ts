/**
 * AI 模型配置层的公开入口：对话发送方解析模型，主入口挂请求处理器。
 */
export { resolveModelSelection } from "./model/resolve.js";
export { createAiRequestHandler } from "./http/routes.js";
export type { AiRequestHandler, AiRequestHandlerOptions } from "./http/routes.js";
export { resolveAiPaths, AI_DIR_ENV, ENV_FILE_NAME, PROVIDERS_FILE_NAME } from "./infrastructure/paths.js";
export type { AiPaths } from "./infrastructure/paths.js";
export type {
  CatalogSnapshot,
  ChatApi,
  CredentialStatus,
  CustomProviderDraft,
  ModelDefinition,
  ModelOption,
  PickerEntry,
  ProviderDefinition,
  ProvidersDocument,
} from "./domain/types.js";
export { AiConfigError } from "./domain/types.js";
