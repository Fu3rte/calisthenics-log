/**
 * 模型清单读取：可用模型、默认值与密钥状态都由服务端给出，前端不硬编码。
 */
import type {
  ModelCatalog,
  ModelOption,
  ProviderCredential,
} from "@/features/coach-chat/model/chat";

const CATALOG_ENDPOINT = `${import.meta.env.BASE_URL}api/models`;

export async function fetchModelCatalog(): Promise<ModelCatalog> {
  const response = await fetch(CATALOG_ENDPOINT, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`读取模型清单失败（HTTP ${response.status}）`);
  }

  const payload = (await response.json()) as {
    models?: Record<string, unknown>[];
    credentials?: ProviderCredential[];
    defaults?: { model?: string };
  };

  const models: ModelOption[] = (payload.models ?? [])
    .filter((item) => typeof item?.id === "string")
    .map((item) => ({
      id: item.id as string,
      label: typeof item.label === "string" ? item.label : (item.id as string),
      provider:
        typeof item.provider === "string"
          ? item.provider
          : ((item.id as string).split("/")[0] ?? ""),
      providerLabel: typeof item.providerLabel === "string" ? item.providerLabel : "",
    }));

  return {
    models,
    credentials: payload.credentials ?? [],
    defaults: {
      model: payload.defaults?.model || models[0]?.id || "",
    },
  };
}
