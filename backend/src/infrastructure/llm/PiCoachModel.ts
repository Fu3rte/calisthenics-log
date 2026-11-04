/**
 * 出站适配器：用 pi-ai 的 provider 集合做流式生成，支持注册表里的全部 provider 与自定义端点。
 * pi 的消息结构与模型注册表只在这一层出现，领域与应用层看不到。
 * 密钥逐请求向 CoachCredentials 端口取，换密钥不用重启进程；自定义端点增删后调 reload 重注册。
 */
import {
  createModels,
  type Api,
  type AssistantMessage,
  type Message,
  type Model,
  type MutableModels,
  type Usage,
} from "@earendil-works/pi-ai";
import type { CoachCredentials } from "../../application/ports/CoachCredentials.js";
import type {
  CoachModel,
  CoachModelOption,
  CoachProviderOption,
  CoachRequest,
} from "../../application/ports/CoachModel.js";
import type { CoachTurn } from "../../domain/coaching/CoachTurn.js";
import type { ProviderRegistry } from "./providerRegistry.js";

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function toLlmMessage(
  model: Model<Api>,
  turn: CoachTurn,
  timestamp: number
): Message {
  if (turn.role === "user") {
    return { role: "user", content: turn.content, timestamp };
  }

  const assistant: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: turn.content }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: ZERO_USAGE,
    stopReason: "stop",
    timestamp,
  };
  return assistant;
}

/** provider/model 形式的引用；OpenRouter 这类 id 自带斜杠，只切第一段 */
function splitModelRef(modelRef: string): [string, string] {
  const slash = modelRef.indexOf("/");
  if (slash < 1) return ["", ""];
  return [modelRef.slice(0, slash), modelRef.slice(slash + 1)];
}

export class PiCoachModel implements CoachModel {
  private models: MutableModels = createModels();
  private registered: { id: string; label: string }[] = [];

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly credentials: CoachCredentials
  ) {
    this.reload();
  }

  /** 自定义 provider 增删后重注册 */
  reload(): void {
    const models = createModels();
    const providers = this.registry.buildProviders();
    for (const provider of providers) models.setProvider(provider);
    this.models = models;
    this.registered = providers.map((provider) => ({
      id: provider.id,
      label: provider.name,
    }));
  }

  providers(): readonly CoachProviderOption[] {
    return this.registered;
  }

  catalog(): readonly CoachModelOption[] {
    return this.registered.flatMap((provider) =>
      this.models
        .getModels(provider.id)
        .map((model) => ({
          id: `${provider.id}/${model.id}`,
          label: model.name,
          provider: provider.id,
          providerLabel: provider.label,
        }))
    );
  }

  async *stream({
    systemPrompt,
    turns,
    settings,
    signal,
  }: CoachRequest): AsyncGenerator<string, void, void> {
    const [providerId, modelId] = splitModelRef(settings.modelId);
    const registered = this.registered.find((item) => item.id === providerId);
    if (!registered) {
      throw new Error(
        `不支持的 provider：${providerId || "空"}（订阅登录与多字段端点在本机版本里不可用）`
      );
    }

    const model = this.models.getModel(providerId, modelId);
    if (!model) {
      throw new Error(`未知模型 ${settings.modelId}`);
    }

    const apiKey = await this.credentials.resolveApiKey(providerId);
    if (!apiKey) {
      throw new Error(
        `未配置 ${registered.label} 密钥：在侧栏「模型配置 › 连接」填入，或写进 backend/.env`
      );
    }

    const base = Date.now();
    const messages = turns.map((turn, index) =>
      toLlmMessage(model, turn, base + index)
    );

    const stream = this.models.streamSimple(
      model,
      { systemPrompt, messages },
      { maxTokens: settings.maxTokens, signal, apiKey }
    );

    for await (const event of stream) {
      if (event.type === "text_delta") {
        yield event.delta;
      } else if (event.type === "error") {
        throw new Error(event.error?.errorMessage ?? "模型返回错误");
      }
    }
  }
}
