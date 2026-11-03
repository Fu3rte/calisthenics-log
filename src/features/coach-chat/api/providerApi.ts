/**
 * provider 选取层与自定义端点的读写。
 * 自定义端点的定义落服务端 providers.json，密钥一律走连接区，不进这个文件。
 */
import type {
  CustomProviderInput,
  PickerEntry,
} from "@/features/coach-chat/model/chat";

const PROVIDERS_ENDPOINT = `${import.meta.env.BASE_URL}api/settings/providers`;
const CUSTOM_ENDPOINT = `${import.meta.env.BASE_URL}api/settings/providers/custom`;

interface Payload {
  providers?: PickerEntry[];
  error?: string;
}

async function read<T>(response: Response): Promise<T[]> {
  const payload = (await response.json().catch(() => null)) as Payload | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `请求失败（HTTP ${response.status}）`);
  }
  return (payload?.providers ?? []) as T[];
}

export async function fetchPicker(): Promise<PickerEntry[]> {
  const response = await fetch(PROVIDERS_ENDPOINT, { cache: "no-cache" });
  return read<PickerEntry>(response);
}

export async function addCustomProvider(
  input: CustomProviderInput
): Promise<PickerEntry[]> {
  const response = await fetch(CUSTOM_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return read<PickerEntry>(response);
}

export async function removeCustomProvider(id: string): Promise<PickerEntry[]> {
  const response = await fetch(
    `${CUSTOM_ENDPOINT}?id=${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
  return read<PickerEntry>(response);
}
