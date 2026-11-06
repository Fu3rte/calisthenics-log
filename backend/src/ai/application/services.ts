/**
 * 模型配置用例：清单、目录、自定义端点增删、密钥连接与运行时解析。
 * 依赖注入 ports，自身不碰文件、不发 HTTP。
 */
import { buildModel } from "../domain/buildModel.js";
import {
  BUILTIN_PROVIDER_IDS,
  envVarForProvider,
  maskSecret,
  modelRef,
  parseModelRef,
  resolveProviders,
  validateCustomProviderInput,
} from "../domain/registry.js";
import {
  AiConfigError,
  type CatalogSnapshot,
  type CredentialStatus,
  type ModelOption,
  type PickerEntry,
  type ProvidersDocument,
  type ProviderDefinition,
  type ResolvedSelection,
} from "../domain/types.js";
import type { AiPorts } from "./ports.js";

interface LoadedState {
  doc: ProvidersDocument;
  providers: ProviderDefinition[];
  /** provider id → 明文密钥；未配置为 null */
  secrets: Map<string, string | null>;
}

export interface AiServices {
  listPicker(): Promise<PickerEntry[]>;
  listCatalog(): Promise<CatalogSnapshot>;
  listCredentials(): Promise<CredentialStatus[]>;
  upsertCustomProvider(input: unknown): Promise<PickerEntry[]>;
  removeCustomProvider(providerId: string): Promise<PickerEntry[]>;
  setConnection(providerId: string, apiKey: string): Promise<CredentialStatus[]>;
  resolve(ref?: string): Promise<ResolvedSelection>;
}

export function createAiServices(ports: AiPorts): AiServices {
  async function load(): Promise<LoadedState> {
    const doc = await ports.providers.read();
    const providers = resolveProviders(doc);
    const secrets = new Map<string, string | null>();
    for (const provider of providers) {
      const raw = await ports.secrets.read(provider.envVar);
      secrets.set(provider.id, raw && raw.trim() ? raw.trim() : null);
    }
    return { doc, providers, secrets };
  }

  function isConfigured(state: LoadedState, providerId: string): boolean {
    return Boolean(state.secrets.get(providerId));
  }

  function credentialsOf(state: LoadedState): CredentialStatus[] {
    return state.providers.map((provider) => {
      const secret = state.secrets.get(provider.id) ?? null;
      return {
        provider: provider.id,
        providerLabel: provider.label,
        envVar: provider.envVar,
        configured: Boolean(secret),
        masked: maskSecret(secret),
        custom: provider.custom,
      };
    });
  }

  function pickerOf(state: LoadedState): PickerEntry[] {
    return state.providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      group: "apikey" as const,
      modelCount: provider.models.length,
      custom: provider.custom,
      selectable: provider.models.length > 0,
      configured: isConfigured(state, provider.id),
    }));
  }

  /** 已配置 provider 的模型；id 统一成 provider/modelId */
  function availableModels(state: LoadedState): ModelOption[] {
    const models: ModelOption[] = [];
    for (const provider of state.providers) {
      if (!isConfigured(state, provider.id)) continue;
      for (const model of provider.models) {
        models.push({
          id: modelRef(provider.id, model.id),
          label: model.name,
          provider: provider.id,
          providerLabel: provider.label,
        });
      }
    }
    return models;
  }

  function selectionOf(
    state: LoadedState,
    provider: ProviderDefinition,
    modelId: string
  ): ResolvedSelection {
    const model = provider.models.find((item) => item.id === modelId);
    if (!model) {
      const available = provider.models.map((item) => item.id).join("、");
      throw new AiConfigError(
        `provider「${provider.id}」下没有模型「${modelId}」。可用模型：${available || "（无）"}。`,
        404
      );
    }
    const apiKey = state.secrets.get(provider.id);
    if (!apiKey) {
      throw new AiConfigError(`provider「${provider.id}」还没有配置 API Key。`);
    }
    return { model: buildModel(model, provider.id), apiKey };
  }

  function firstAvailable(state: LoadedState): ResolvedSelection | null {
    for (const provider of state.providers) {
      const apiKey = state.secrets.get(provider.id);
      const model = provider.models[0];
      if (apiKey && model) {
        return { model: buildModel(model, provider.id), apiKey };
      }
    }
    return null;
  }

  return {
    async listPicker() {
      return pickerOf(await load());
    },

    async listCredentials() {
      return credentialsOf(await load());
    },

    async listCatalog() {
      const state = await load();
      const models = availableModels(state);
      const wanted = state.doc.default?.trim();
      const picked =
        wanted && models.some((model) => model.id === wanted) ? wanted : models[0]?.id ?? "";
      return {
        models,
        credentials: credentialsOf(state),
        defaults: { model: picked },
      };
    },

    async upsertCustomProvider(input: unknown) {
      const doc = await ports.providers.read();
      resolveProviders(doc); // 先确认现有文件可解析，避免坏文件被覆盖
      const draft = validateCustomProviderInput(input);
      const models = draft.models.map((model) =>
        model.name ? { id: model.id, name: model.name } : { id: model.id }
      );
      doc.providers[draft.id] = {
        name: draft.name,
        baseUrl: draft.baseUrl,
        api: draft.api,
        models,
      };
      await ports.providers.write(doc);
      return pickerOf(await load());
    },

    async removeCustomProvider(providerId: string) {
      const id = providerId.trim();
      if (BUILTIN_PROVIDER_IDS.includes(id)) {
        throw new AiConfigError(`provider「${id}」是内置 provider，不能删除。`);
      }
      const doc = await ports.providers.read();
      if (!doc.providers[id]) {
        throw new AiConfigError("没有这个自定义 provider。", 404);
      }
      delete doc.providers[id];
      await ports.providers.write(doc);
      await ports.secrets.delete(envVarForProvider(id));
      return pickerOf(await load());
    },

    async setConnection(providerId: string, apiKey: string) {
      const id = providerId.trim();
      if (!id) throw new AiConfigError("缺少 provider 参数。");
      const doc = await ports.providers.read();
      const providers = resolveProviders(doc);
      const provider = providers.find((item) => item.id === id);
      if (!provider) throw new AiConfigError(`未找到 provider「${id}」。`, 404);

      const key = apiKey.trim();
      if (key) {
        if (/[\r\n]/.test(key)) throw new AiConfigError("API Key 不能包含换行符。");
        await ports.secrets.set(provider.envVar, key);
      } else {
        await ports.secrets.delete(provider.envVar);
      }
      return credentialsOf(await load());
    },

    async resolve(ref?: string) {
      const state = await load();
      const wanted = ref?.trim() ?? "";
      if (wanted) {
        const parsed = parseModelRef(wanted);
        const provider = state.providers.find((item) => item.id === parsed.provider);
        if (!provider) {
          throw new AiConfigError(`未找到 provider「${parsed.provider}」。`, 404);
        }
        return selectionOf(state, provider, parsed.modelId);
      }

      const preferred = state.doc.default?.trim();
      if (preferred) {
        const parsed = parseModelRef(preferred);
        const provider = state.providers.find((item) => item.id === parsed.provider);
        if (provider && provider.models.some((model) => model.id === parsed.modelId)) {
          const apiKey = state.secrets.get(provider.id);
          if (apiKey) return selectionOf(state, provider, parsed.modelId);
        }
      }

      const fallback = firstAvailable(state);
      if (!fallback) {
        throw new AiConfigError(
          "还没有可用的模型：先在模型配置里接入 provider 并填好密钥。"
        );
      }
      return fallback;
    },
  };
}
