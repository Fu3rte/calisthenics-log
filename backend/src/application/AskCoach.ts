/**
 * 用例：回答一次训练提问。
 *
 * 顺序固定：校验轮次与设置 → 读训练日志 → 拼系统提示 → 调模型 → 逐段吐出。
 * 无状态：不保存会话，历史与设置由调用方每次带上来，缺省时用服务端默认。
 */
import { buildSystemPrompt } from "../domain/coaching/CoachPrompt.js";
import {
  parseSettings,
  type CoachSettings,
} from "../domain/coaching/CoachSettings.js";
import { parseTurns, type CoachTurn } from "../domain/coaching/CoachTurn.js";
import { BadRequestError } from "../domain/BadRequest.js";
import type { TrainingLogRepository } from "../domain/training/TrainingLogRepository.js";
import type { CoachModel } from "./ports/CoachModel.js";

export type CoachEvent =
  | { readonly type: "delta"; readonly text: string }
  | { readonly type: "done" }
  | { readonly type: "error"; readonly message: string };

export interface AskCoachDeps {
  readonly trainingLogs: TrainingLogRepository;
  readonly coachModel: CoachModel;
  readonly defaults: CoachSettings;
}

export interface PreparedRequest {
  readonly turns: CoachTurn[];
  readonly settings: CoachSettings;
}

export class AskCoach {
  constructor(private readonly deps: AskCoachDeps) {}

  get defaults(): CoachSettings {
    return this.deps.defaults;
  }

  /**
   * 同步校验请求体：轮次、设置、模型是否在清单内。
   * 非法时抛 BadRequestError，HTTP 层据此回 400。
   */
  prepare(raw: unknown): PreparedRequest {
    const turns = parseTurns(raw);
    const settings = parseSettings(
      (raw as { settings?: unknown }).settings,
      this.deps.defaults
    );

    const known = this.deps.coachModel
      .catalog()
      .some((option) => option.id === settings.modelId);
    if (!known) {
      throw new BadRequestError(`未知模型 ${settings.modelId}`);
    }

    return { turns, settings };
  }

  async *execute(
    turns: readonly CoachTurn[],
    settings: CoachSettings,
    signal: AbortSignal
  ): AsyncGenerator<CoachEvent, void, void> {
    try {
      const log = await this.deps.trainingLogs.load();
      const systemPrompt = buildSystemPrompt(log, new Date());

      for await (const text of this.deps.coachModel.stream({
        systemPrompt,
        turns,
        settings,
        signal,
      })) {
        yield { type: "delta", text };
      }
      yield { type: "done" };
    } catch (cause) {
      if (signal.aborted) return;
      yield {
        type: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }
}
