/**
 * 运行时模型解析：按 providers.json 默认值 / 明示 ref / 第一家已配置的 provider 定稿。
 * 这是对话发送方唯一需要的入口。
 */
import type { Model } from "@earendil-works/pi-ai";
import { createAiServices } from "../application/services.js";
import { resolveAiPaths } from "../infrastructure/paths.js";
import { createProvidersStore } from "../infrastructure/providersFile.js";
import { createEnvSecretStore } from "../infrastructure/envFile.js";

export async function resolveModelSelection(
  modelRef?: string
): Promise<{ model: Model<"openai-completions">; apiKey: string }> {
  const paths = resolveAiPaths();
  const services = createAiServices({
    providers: createProvidersStore(paths.providersFile),
    secrets: createEnvSecretStore(paths.envFile),
  });
  return services.resolve(modelRef);
}
