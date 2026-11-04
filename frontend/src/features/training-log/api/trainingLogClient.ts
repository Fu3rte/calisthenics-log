/**
 * 训练日志读取适配器（浏览器）。
 *
 * 同源 fetch 训练日志.json：dev 由 vite 中间件从 backend/ 读，build 拷进 dist，
 * 线上改完 JSON 刷新即生效。
 */
import {
  isValidTrainingData,
  type TrainingData,
} from "@/features/training-log/model/trainingLog";

export async function fetchTrainingLog(): Promise<TrainingData> {
  if (cache) return cache;
  cache = await load();
  return cache;
}

let cache: TrainingData | null = null;

/** 已加载过的数据：切回页面时直接出内容，不闪 loading */
export function peekTrainingLog(): TrainingData | null {
  return cache;
}

async function load(): Promise<TrainingData> {
  const url = `${import.meta.env.BASE_URL}训练日志.json`;
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`无法加载训练日志（HTTP ${response.status}）`);
  }
  const data: unknown = await response.json();
  if (!isValidTrainingData(data)) {
    throw new Error("训练日志格式不符合 schema");
  }
  cache = data;
  return data;
}
