/**
 * 应用层端口：provider 定义的持久化与密钥的读写。
 * 用例只依赖这两个接口，具体落在哪个文件由基础设施决定。
 */
import type { ProvidersDocument } from "../domain/types.js";

export interface ProvidersStore {
  read(): Promise<ProvidersDocument>;
  write(doc: ProvidersDocument): Promise<void>;
}

export interface SecretStore {
  /** 优先读 .env 文件，未命中回落 process.env */
  read(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

export interface AiPorts {
  providers: ProvidersStore;
  secrets: SecretStore;
}
