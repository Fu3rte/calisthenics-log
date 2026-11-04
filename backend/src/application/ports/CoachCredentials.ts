/**
 * 出站端口：provider 密钥的读写与解析。
 * 密钥只活在服务端进程与 backend/.env 里，HTTP 层只允许拿掩码。
 */

export interface ProviderCredential {
  readonly provider: string;
  readonly providerLabel: string;
  /** 该 provider 的规范环境变量名，也是 .env 里写入的键 */
  readonly envVar: string;
  readonly configured: boolean;
  /** 已配置时的掩码，未配置为 null；任何情况下都不是明文 */
  readonly masked: string | null;
  /** 命中的来源：项目 .env / 系统环境变量 */
  readonly source: "file" | "system" | null;
  /** 自定义兼容端点（providers.json 里的家），面板上可删 */
  readonly custom: boolean;
}

export interface CoachCredentials {
  list(): Promise<readonly ProviderCredential[]>;
  /** 写入 backend/.env 并让当前进程立刻生效 */
  save(provider: string, apiKey: string): Promise<readonly ProviderCredential[]>;
  remove(provider: string): Promise<readonly ProviderCredential[]>;
  /** 发起请求时取明文密钥；没有则 undefined */
  resolveApiKey(provider: string): Promise<string | undefined>;
}
