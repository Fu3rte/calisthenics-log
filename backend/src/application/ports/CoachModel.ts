import type { CoachSettings } from "../../domain/coaching/CoachSettings.js";
import type { CoachTurn } from "../../domain/coaching/CoachTurn.js";

/** 出站端口：大模型流式生成 + 可用模型清单 */

export interface CoachModelOption {
  /** provider/model 形式的引用，OpenRouter 这类 id 自带斜杠时只切第一段 */
  readonly id: string;
  readonly label: string;
  readonly provider: string;
  readonly providerLabel: string;
}

export interface CoachProviderOption {
  readonly id: string;
  readonly label: string;
}

export interface CoachRequest {
  readonly systemPrompt: string;
  readonly turns: readonly CoachTurn[];
  readonly settings: CoachSettings;
  readonly signal: AbortSignal;
}

export interface CoachModel {
  /** 服务端支持的模型清单，UI 只读这里 */
  catalog(): readonly CoachModelOption[];

  /** 白名单 provider，顺序即 UI 分组顺序 */
  providers(): readonly CoachProviderOption[];

  /** 自定义 provider 增删后重注册，清单与请求路径同步跟上 */
  reload(): void;

  /**
   * 逐段产出正文增量。失败抛异常；取消走 signal。
   */
  stream(request: CoachRequest): AsyncIterable<string>;
}
