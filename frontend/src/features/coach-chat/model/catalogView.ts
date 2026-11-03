/**
 * 模型清单的展示视图：按 provider 分组、大小写不敏感过滤。
 * 分组顺序沿用服务端清单顺序，客户端不重排。
 */
import type { ModelOption } from "@/features/coach-chat/model/chat";

/** 超过这个条数才出现过滤框，与 pi-web 的阈值一致 */
export const MODEL_FILTER_THRESHOLD = 8;

export interface ModelGroup {
  provider: string;
  label: string;
  models: ModelOption[];
}

export function groupModels(
  models: readonly ModelOption[],
  query: string
): ModelGroup[] {
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? models.filter(
        (model) =>
          model.label.toLowerCase().includes(needle) ||
          model.id.toLowerCase().includes(needle)
      )
    : models;

  const groups = new Map<string, ModelGroup>();
  for (const model of matched) {
    const group = groups.get(model.provider);
    if (group) group.models.push(model);
    else {
      groups.set(model.provider, {
        provider: model.provider,
        label: model.providerLabel || model.provider,
        models: [model],
      });
    }
  }
  return [...groups.values()];
}
