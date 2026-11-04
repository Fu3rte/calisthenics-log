/**
 * provider 配置读写：选取层清单、自定义端点定义、密钥连接。
 * 定义落服务端 providers.json，密钥落 backend/.env，浏览器只拿掩码。
 */
import type {
  CustomProviderInput,
  PickerEntry,
  ProviderCredential,
} from "@/features/coach-chat/model/chat";

const PROVIDERS_ENDPOINT = `${import.meta.env.BASE_URL}api/settings/providers`;
const CUSTOM_ENDPOINT = `${import.meta.env.BASE_URL}api/settings/providers/custom`;
const CONNECTION_ENDPOINT = `${import.meta.env.BASE_URL}api/settings/connection`;

/** 四个动作都回一份 provider 清单；失败时优先用服务端给的 error 文案 */
async function readProviders<T>(response: Response, fail: string): Promise<T[]> {
  const payload = (await response.json().catch(() => null)) as {
    providers?: T[];
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `${fail}（HTTP ${response.status}）`);
  }
  return payload?.providers ?? [];
}

export async function fetchPicker(): Promise<PickerEntry[]> {
  const response = await fetch(PROVIDERS_ENDPOINT, { cache: "no-cache" });
  return readProviders<PickerEntry>(response, "读取 Provider 清单失败");
}

export async function addCustomProvider(
  input: CustomProviderInput
): Promise<PickerEntry[]> {
  const response = await fetch(CUSTOM_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readProviders<PickerEntry>(response, "保存端点定义失败");
}

export async function removeCustomProvider(id: string): Promise<PickerEntry[]> {
  const response = await fetch(
    `${CUSTOM_ENDPOINT}?id=${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
  return readProviders<PickerEntry>(response, "删除端点失败");
}

/** apiKey 传空串表示断开（服务端抹掉 .env 里那一行） */
export async function putConnection(
  provider: string,
  apiKey: string
): Promise<ProviderCredential[]> {
  const response = await fetch(CONNECTION_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey }),
  });
  return readProviders<ProviderCredential>(response, "写入连接配置失败");
}
