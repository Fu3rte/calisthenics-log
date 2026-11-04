/**
 * 用例：给 UI 供模型清单、provider 选取层与连接状态，并写密钥与自定义端点。
 *
 * 清单只下发已配置 provider 的模型（全量 1200+ 条没必要每次带走）；
 * 选取层用注册表的分组视图，未配置与不可用的家都在那里解释。
 */
import {
  parseCustomProvider,
  type CustomProvider,
} from "../domain/coaching/CustomProviders.js";
import { BadRequestError } from "../domain/BadRequest.js";
import type { CoachSettings } from "../domain/coaching/CoachSettings.js";
import type {
  CoachCredentials,
  ProviderCredential,
} from "./ports/CoachCredentials.js";
import type { CustomProviderStore } from "./ports/CustomProviderStore.js";
import type {
  CoachModel,
  CoachModelOption,
  CoachProviderOption,
} from "./ports/CoachModel.js";
import type {
  ProviderCatalog,
  ProviderSpec,
} from "./ports/ProviderCatalog.js";

export interface CoachCatalog {
  readonly providers: readonly CoachProviderOption[];
  readonly models: readonly CoachModelOption[];
  readonly credentials: readonly ProviderCredential[];
  readonly defaults: { readonly model: string; readonly maxTokens: number };
}

export interface PickerEntry extends ProviderSpec {
  readonly configured: boolean;
}

export interface CoachSetupDeps {
  readonly coachModel: CoachModel;
  readonly credentials: CoachCredentials;
  readonly registry: ProviderCatalog;
  readonly customStore: CustomProviderStore;
  readonly defaults: CoachSettings;
}

export class CoachSetup {
  constructor(private readonly deps: CoachSetupDeps) {}

  async catalog(): Promise<CoachCatalog> {
    const credentials = await this.deps.credentials.list();
    const configured = new Set(
      credentials.filter((item) => item.configured).map((item) => item.provider)
    );

    return {
      providers: this.deps.coachModel.providers(),
      models: this.deps.coachModel
        .catalog()
        .filter((option) => configured.has(option.provider)),
      credentials,
      defaults: {
        model: this.deps.defaults.modelId,
        maxTokens: this.deps.defaults.maxTokens,
      },
    };
  }

  async picker(): Promise<PickerEntry[]> {
    const configured = new Set(
      (await this.deps.credentials.list())
        .filter((item) => item.configured)
        .map((item) => item.provider)
    );
    return this.deps.registry
      .specs()
      .map((spec) => ({ ...spec, configured: configured.has(spec.id) }));
  }

  /** 空字符串表示断开该 provider（抹掉 .env 里那一行） */
  async updateConnection(
    provider: string,
    apiKey: string
  ): Promise<readonly ProviderCredential[]> {
    return apiKey.trim()
      ? this.deps.credentials.save(provider, apiKey)
      : this.deps.credentials.remove(provider);
  }

  /** 新增或覆盖同名自定义 provider；密钥仍走 .env，不进 providers.json */
  async addCustom(raw: unknown): Promise<PickerEntry[]> {
    const parsed = parseCustomProvider(raw);
    const customs = await this.deps.customStore.load();
    if (this.deps.registry.builtinIds().has(parsed.id)) {
      throw new BadRequestError(`id ${parsed.id} 与内置 provider 重名`);
    }

    const next = [...customs.filter((item) => item.id !== parsed.id), parsed];
    this.apply(next);
    return this.picker();
  }

  /** 删除自定义 provider，顺带抹掉它在 .env 里的密钥行 */
  async removeCustom(id: string): Promise<PickerEntry[]> {
    const customs = await this.deps.customStore.load();
    if (!customs.some((item) => item.id === id)) {
      throw new BadRequestError(`没有 id 为 ${id} 的自定义 provider`);
    }

    /* 先抹密钥再注销：注销后注册表里就找不到这个写入目标了 */
    await this.deps.credentials.remove(id);
    this.apply(customs.filter((item) => item.id !== id));
    return this.picker();
  }

  private apply(list: readonly CustomProvider[]): void {
    this.deps.customStore.save(list);
    this.deps.registry.setCustomProviders(list);
    this.deps.coachModel.reload();
  }
}
