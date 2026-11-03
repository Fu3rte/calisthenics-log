/**
 * 入站适配器之外的凭证适配器：密钥写进 backend/.env，读时只出掩码。
 * 本机 pi 的登录态（auth.json）作为兜底来源，顺序：.env → 系统环境变量 → pi。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  CredentialKeyInvalidError,
  CredentialProviderUnknownError,
  type CoachCredentials,
  type ProviderCredential,
} from "../../application/ports/CoachCredentials.js";
import type {
  CredentialTarget,
  ProviderCatalog,
} from "../../application/ports/ProviderCatalog.js";

export interface EnvCredentialsOptions {
  readonly envPath: string;
  readonly piAuthPath: string;
  readonly registry: ProviderCatalog;
}

interface PiAuthFile {
  readonly [providerId: string]: { readonly key?: unknown } | undefined;
}

/** 掩码：只保留末 4 位，其余打点；短于 8 位的全打点 */
function mask(apiKey: string): string {
  if (apiKey.length < 8) return "••••";
  return `••••${apiKey.slice(-4)}`;
}

function isUsableKeyValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export class EnvCredentials implements CoachCredentials {
  /** 由本项目 .env 提供的环境变量名；用于区分来源与删除时还原系统值 */
  private readonly fromFile = new Set<string>();
  /** 加载 .env 之前这些变量的系统值，删除时还原回去 */
  private readonly systemFallback = new Map<string, string | undefined>();

  constructor(private readonly options: EnvCredentialsOptions) {}

  /** 启动时把 backend/.env 灌进 process.env；文件不存在就跳过 */
  load(): void {
    if (!existsSync(this.options.envPath)) return;
    for (const { envVar } of this.options.registry.credentialTargets()) {
      if (process.env[envVar] !== undefined) {
        this.systemFallback.set(envVar, process.env[envVar]);
      }
    }
    process.loadEnvFile(this.options.envPath);
    for (const { envVar } of this.options.registry.credentialTargets()) {
      if (process.env[envVar] !== undefined) this.fromFile.add(envVar);
    }
  }

  private target(provider: string): CredentialTarget {
    const found = this.options.registry
      .credentialTargets()
      .find((item) => item.provider === provider);
    if (!found) {
      throw new CredentialProviderUnknownError(
        `不支持的 provider ${provider}：订阅登录与多字段端点在本机版本里不可填`
      );
    }
    return found;
  }

  async list(): Promise<readonly ProviderCredential[]> {
    const auth = await this.readPiAuth();
    return this.options.registry.credentialTargets().map((target) => {
      const fromEnv = process.env[target.envVar]?.trim();
      const piKey = auth[target.provider]?.key;
      const fromPi = isUsableKeyValue(piKey) ? piKey.trim() : undefined;
      const value = fromEnv || fromPi;
      return {
        provider: target.provider,
        providerLabel: target.label,
        envVar: target.envVar,
        configured: Boolean(value),
        masked: value ? mask(value) : null,
        source: fromEnv
          ? this.fromFile.has(target.envVar)
            ? "file"
            : "system"
          : fromPi
            ? "pi"
            : null,
        custom: this.options.registry
          .customProviders()
          .some((item) => item.id === target.provider),
      } satisfies ProviderCredential;
    });
  }

  async save(provider: string, apiKey: string): Promise<readonly ProviderCredential[]> {
    const { envVar } = this.target(provider);
    const value = apiKey.trim();
    if (!value) {
      throw new CredentialKeyInvalidError("密钥不能为空");
    }
    if (value.length > 400 || /[\r\n"']/.test(value)) {
      throw new CredentialKeyInvalidError("密钥含换行或引号，长度也不超过 400");
    }

    this.upsertEnvFile(envVar, value);
    process.env[envVar] = value;
    this.fromFile.add(envVar);
    return this.list();
  }

  async remove(provider: string): Promise<readonly ProviderCredential[]> {
    const { envVar } = this.target(provider);

    this.upsertEnvFile(envVar, null);
    this.fromFile.delete(envVar);
    /* 系统环境变量里原本就有同名值时还原，不能顺手抹掉别人的配置 */
    const fallback = this.systemFallback.get(envVar);
    if (fallback === undefined) delete process.env[envVar];
    else process.env[envVar] = fallback;
    return this.list();
  }

  async resolveApiKey(provider: string): Promise<string | undefined> {
    const targets = this.options.registry.credentialTargets();
    const target = targets.find((item) => item.provider === provider);
    if (!target) return undefined;

    const fromEnv = process.env[target.envVar]?.trim();
    if (fromEnv) return fromEnv;

    const auth = await this.readPiAuth();
    const fromPi = auth[target.provider]?.key;
    return isUsableKeyValue(fromPi) ? fromPi.trim() : undefined;
  }

  /** 就地改 .env：命中同名键则替换那一行，没有则追加；传 null 表示删除该行。其余行与注释原样保留 */
  private upsertEnvFile(envVar: string, value: string | null): void {
    const { envPath } = this.options;
    const lines = existsSync(envPath)
      ? readFileSync(envPath, "utf8").split(/\r?\n/)
      : [];
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${envVar}\\s*=`);
    const index = lines.findIndex((line) => pattern.test(line));

    if (value === null) {
      if (index < 0) return;
      lines.splice(index, 1);
    } else if (index >= 0) {
      lines[index] = `${envVar}=${value}`;
    } else {
      while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
      lines.push(`${envVar}=${value}`);
    }

    writeFileSync(envPath, `${lines.join("\n")}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  private async readPiAuth(): Promise<PiAuthFile> {
    const raw = await readFile(this.options.piAuthPath, "utf8").catch(() => null);
    if (raw === null) return {};
    try {
      return JSON.parse(raw) as PiAuthFile;
    } catch {
      return {};
    }
  }
}
