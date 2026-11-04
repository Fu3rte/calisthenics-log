/**
 * 出站端口：provider 目录视图。实现是 infrastructure/llm/providerRegistry。
 * 应用层只认这些形状，不认识 pi-ai 的 Provider 对象。
 */
import type { CustomProvider } from "../../domain/coaching/CustomProviders.js";

export type ProviderGroup = "apikey" | "oauth";

export interface ProviderSpec {
  readonly id: string;
  readonly label: string;
  readonly group: ProviderGroup;
  /** 写入用的规范变量名；OAuth 组没有可写的 key */
  readonly envVar: string | null;
  readonly modelCount: number;
  readonly custom: boolean;
  /** false 表示面板上只读展示（订阅登录、多字段型、零模型） */
  readonly selectable: boolean;
}

export interface CredentialTarget {
  readonly provider: string;
  readonly label: string;
  readonly envVar: string;
  readonly custom: boolean;
}

export interface ProviderCatalog {
  init(): Promise<void>;
  specs(): ProviderSpec[];
  credentialTargets(): CredentialTarget[];
  setCustomProviders(list: readonly CustomProvider[]): void;
  builtinIds(): Set<string>;
}
