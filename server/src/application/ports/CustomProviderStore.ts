/**
 * 出站端口：自定义 provider 定义的读写。实现落在 infrastructure/persistence。
 */
import type { CustomProvider } from "../../domain/coaching/CustomProviders.js";

export interface CustomProviderStore {
  load(): Promise<CustomProvider[]>;
  save(list: readonly CustomProvider[]): void;
}
