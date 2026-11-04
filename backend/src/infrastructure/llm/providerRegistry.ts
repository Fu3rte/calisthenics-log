/**
 * provider 注册表：把 pi-ai 出厂的 42 家整理成面板可用的清单，并按定义构造自定义 provider。
 *
 * 环境变量名不硬编码：对每家的 auth.apiKey.resolve() 喂一个只记录名字的假 ctx，
 * 让它把候选变量名报回来（实测 41/42 家可离线问出）。
 */
import { createProvider, envApiKeyAuth, type Provider } from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import {
  stream as anthropicStream,
  streamSimple as anthropicStreamSimple,
} from "@earendil-works/pi-ai/api/anthropic-messages";
import {
  stream as openaiStream,
  streamSimple as openaiStreamSimple,
} from "@earendil-works/pi-ai/api/openai-completions";
import {
  customProviderEnvVar,
  type CustomProvider,
} from "../../domain/coaching/CustomProviders.js";
import type {
  CredentialTarget,
  ProviderCatalog,
  ProviderSpec,
} from "../../application/ports/ProviderCatalog.js";

/**
 * 需要 region / resource / account 等额外字段的几家，本机版本先不列；
 * 零模型的家由 modelCount > 0 挡掉。
 */
const NOT_LISTED = new Set([
  "amazon-bedrock",
  "azure",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "google-vertex",
]);

const API_IMPLS = {
  "openai-completions": { stream: openaiStream, streamSimple: openaiStreamSimple },
  "anthropic-messages": { stream: anthropicStream, streamSimple: anthropicStreamSimple },
} as const;

/** 候选里优先取 *_API_KEY 结尾的那个，作为写 .env 的规范名 */
function canonicalEnvVar(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return names.find((name) => name.endsWith("_API_KEY")) ?? names[0];
}

async function probeEnvVars(
  provider: Provider
): Promise<string[]> {
  const apiKey = provider.auth.apiKey;
  if (!apiKey) return [];

  const names: string[] = [];
  const ctx = {
    env: async (name: string) => {
      names.push(name);
      return undefined;
    },
    fileExists: async () => false,
  };
  try {
    await apiKey.resolve({
      ctx,
      credential: undefined,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* 问不出变量名的家按不可配置处理 */
  }
  return names;
}

export class ProviderRegistry implements ProviderCatalog {
  private builtins: Provider[] = [];
  private builtinSpecs: ProviderSpec[] = [];
  private customs: CustomProvider[] = [];

  /** 启动时跑一次：构造出厂 provider 对象并问出各家的环境变量名 */
  async init(): Promise<void> {
    const specs: ProviderSpec[] = [];
    const builtins: Provider[] = [];

    for (const provider of builtinProviders()) {
      const modelCount = provider.getModels().length;
      const hasApiKey = Boolean(provider.auth.apiKey);
      const hasOAuth = Boolean(provider.auth.oauth);
      const envVar = canonicalEnvVar(await probeEnvVars(provider));
      const listed = !NOT_LISTED.has(provider.id) && modelCount > 0;

      if (hasApiKey && listed && envVar) {
        builtins.push(provider);
      }

      /* 双认证的家在两组各出现一次，与 pi-web 的列法一致 */
      if (hasOAuth) {
        specs.push({
          id: provider.id,
          label: `${provider.name}（订阅）`,
          group: "oauth",
          envVar: null,
          modelCount,
          custom: false,
          selectable: false,
        });
      }
      if (hasApiKey) {
        specs.push({
          id: provider.id,
          label: provider.name,
          group: "apikey",
          envVar,
          modelCount,
          custom: false,
          selectable: listed && Boolean(envVar),
        });
      }
    }

    this.builtins = builtins;
    this.builtinSpecs = specs;
  }

  setCustomProviders(customs: readonly CustomProvider[]): void {
    this.customs = [...customs];
  }

  specs(): ProviderSpec[] {
    const customSpecs: ProviderSpec[] = this.customs.map((item) => ({
      id: item.id,
      label: item.name,
      group: "apikey",
      envVar: customProviderEnvVar(item.id),
      modelCount: item.models.length,
      custom: true,
      selectable: true,
    }));
    return [...this.builtinSpecs, ...customSpecs];
  }

  /** 面板可填密钥的家：selectable 等于「内置已注册」或「自定义」 */
  credentialTargets(): CredentialTarget[] {
    return this.specs()
      .filter((spec) => spec.selectable)
      .map((spec) => ({
        provider: spec.id,
        label: spec.label,
        envVar: spec.envVar as string,
        custom: spec.custom,
      }));
  }

  /** 交给 createModels().setProvider() 的完整集合 */
  buildProviders(): Provider[] {
    const customs = this.customs.map((item) =>
      createProvider({
        id: item.id,
        name: item.name,
        baseUrl: item.baseUrl,
        auth: {
          apiKey: envApiKeyAuth(
            `${item.name} API key`,
            [customProviderEnvVar(item.id)]
          ),
        },
        api: API_IMPLS[item.api],
        models: item.models.map((model) => ({
          id: model.id,
          name: model.name,
          api: item.api,
          provider: item.id,
          baseUrl: item.baseUrl,
          input: ["text"],
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          reasoning: false,
          contextWindow: 128000,
          maxTokens: 4096,
        })),
      })
    );

    return [...this.builtins, ...customs];
  }

  /** 内置 id 与自定义 id 的区分，用于拒绝重名 */
  builtinIds(): Set<string> {
    return new Set(this.builtinSpecs.map((spec) => spec.id));
  }
}
