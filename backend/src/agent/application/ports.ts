/**
 * 应用层注入端口：对话用例只依赖解析模型这一个函数，
 * 具体实现（读 providers.json 与 .env）留在 AI 配置层，由主入口注入。
 */
import type { Model } from "@earendil-works/pi-ai";

/** 一次对话需要的成品模型与明文密钥，密钥只留在进程内存 */
export interface AgentModelSelection {
  model: Model<"openai-completions">;
  apiKey: string;
}

/** modelRef 形如 provider/modelId；省略时用 AI 配置层的默认选择 */
export type ResolveModelSelection = (modelRef?: string) => Promise<AgentModelSelection>;
