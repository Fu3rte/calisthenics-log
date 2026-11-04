/**
 * 入站适配器之外的凭证适配器：密钥写进 backend/.env，读时只出掩码。
 * 来源只有两处：本项目 .env 与系统环境变量，前者优先。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { BadRequestError } from "../../domain/BadRequest.js";
import type {
  CoachCredentials,
  ProviderCredential,
} from "../../application/ports/CoachCredentials.js";
import type {
  CredentialTarget,
  ProviderCatalog,
} from "../../application/ports/ProviderCatalog.js";

export interface EnvCredentialsOptions {
  readonly envPath: string;
  readonly registry: ProviderCatalog;
}

/** 掩码：只保留末 4 位，其余打点；短于 8 位的全打点 */
function mask(apiKey: string): string {
  if (apiKey.length < 8) return "••••";
  return `••••${apiKey.slice(-4)}`;
}

export class EnvCredentials implements CoachCredentials {
  /** 由本项目 .env 提供的环境变量名；用于区分来源 */
  private readonly fromFile = new Set<string>();

  constructor(private readonly options: EnvCredentialsOptions) {}

  /** 启动时把 backend/.env 灌进 process.env；文件不存在就跳过 */
  load(): void {
    if (!existsSync(this.options.envPath)) return;
    process.loadEnvFile(this.options.envPath);
    for (const { envVar } of this.options.registry.credentialTargets()) {
      if (process.env[envVar] !== undefined) this.fromFile.add(envVar);
    }
  }

  private mustTarget(provider: string): CredentialTarget {
    const target = this.options.registry
      .credentialTargets()
      .find((item) => item.provider === provider);
    if (!target) {
      throw new BadRequestError(
        `不支持的 provider ${provider}：订阅登录与多字段端点在本机版本里不可填`
      );
    }
    return target;
  }

  async list(): Promise<readonly ProviderCredential[]> {
    return this.options.registry.credentialTargets().map((target) => {
      const value = process.env[target.envVar]?.trim();
      return {
        provider: target.provider,
        providerLabel: target.label,
        envVar: target.envVar,
        configured: Boolean(value),
        masked: value ? mask(value) : null,
        source: value ? (this.fromFile.has(target.envVar) ? "file" : "system") : null,
        custom: target.custom,
      } satisfies ProviderCredential;
    });
  }

  async save(provider: string, apiKey: string): Promise<readonly ProviderCredential[]> {
    const target = this.mustTarget(provider);
    const value = apiKey.trim();
    if (!value) {
      throw new BadRequestError("密钥不能为空");
    }
    if (value.length > 400 || /[\r\n"']/.test(value)) {
      throw new BadRequestError("密钥含换行或引号，长度也不超过 400");
    }

    this.upsertEnvFile(target.envVar, value);
    process.env[target.envVar] = value;
    this.fromFile.add(target.envVar);
    return this.list();
  }

  async remove(provider: string): Promise<readonly ProviderCredential[]> {
    const { envVar } = this.mustTarget(provider);

    this.upsertEnvFile(envVar, null);
    this.fromFile.delete(envVar);
    delete process.env[envVar];
    return this.list();
  }

  async resolveApiKey(provider: string): Promise<string | undefined> {
    const envVar = this.options.registry
      .credentialTargets()
      .find((item) => item.provider === provider)?.envVar;
    return envVar ? process.env[envVar]?.trim() || undefined : undefined;
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
}
