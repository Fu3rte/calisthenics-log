/**
 * 把领域里的 ModelDefinition 组装成 pi-ai 可直接对话的 Model<"openai-completions">。
 * 纯函数，不做任何 IO。
 */
import type { Model } from "@earendil-works/pi-ai";
import { CHAT_API, type ChatApi, type ModelDefinition } from "./types.js";

export function buildModel(
  definition: ModelDefinition,
  providerId: string
): Model<ChatApi> {
  const model: Model<ChatApi> = {
    id: definition.id,
    name: definition.name,
    api: CHAT_API,
    provider: providerId,
    baseUrl: definition.baseUrl,
    input: [...definition.input],
    cost: { ...definition.cost },
    reasoning: definition.reasoning,
    contextWindow: definition.contextWindow,
    maxTokens: definition.maxTokens,
  };
  if (definition.compat) model.compat = definition.compat;
  if (definition.thinkingLevelMap) model.thinkingLevelMap = definition.thinkingLevelMap;
  if (definition.inputLimits) model.inputLimits = definition.inputLimits;
  return model;
}
