/**
 * provider 连接配置读写：密钥只存服务端 backend/.env，前端只拿掩码，绝不回显明文。
 */
import type { ProviderCredential } from "@/features/coach-chat/model/chat";

const ENDPOINT = `${import.meta.env.BASE_URL}api/settings/connection`;

interface ConnectionResponse {
  providers?: ProviderCredential[];
  error?: string;
}

async function read(response: Response): Promise<ProviderCredential[]> {
  const payload = (await response.json().catch(() => null)) as ConnectionResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `写入连接配置失败（HTTP ${response.status}）`);
  }
  return payload?.providers ?? [];
}

export async function fetchConnection(): Promise<ProviderCredential[]> {
  const response = await fetch(ENDPOINT, { cache: "no-cache" });
  return read(response);
}

/** apiKey 传空串表示断开（服务端抹掉 .env 里那一行） */
export async function putConnection(
  provider: string,
  apiKey: string
): Promise<ProviderCredential[]> {
  const response = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey }),
  });
  return read(response);
}
