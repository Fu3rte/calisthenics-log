/**
 * 领域服务：把训练日志变成助教的系统提示。
 * 训练判断规则属于领域知识，写在这里，不进 HTTP 层也不进模型适配器。
 */
import type { TrainingLog } from "../training/TrainingLog.js";

const RULES = `## 规则
1. 只依据上面的日志回答。日志里没有的数字、日期、动作，直接说没有记录。
2. sets 数组的顺序就是组序。元素是数字时是次数；是对象时 reps 是次数、note 是该组备注。
3. 判断状态用逐组备注里的掉速点、RIR、力竭，比 session.note 的总结更准。
4. 术语照这个用法：RIR 是余力次数，RIR 0 即力竭；容量按组数×次数算。
5. 给建议落到动作、组数、次数，给具体数字，不写训练哲学。
6. 默认 160 字以内，用短句。用户明确要分析时再展开，最多 5 条要点。`;

function isoDate(today: Date): string {
  return today.toISOString().slice(0, 10);
}

export function buildSystemPrompt(log: TrainingLog, today: Date): string {
  const data = log.isEmpty ? "（暂无训练记录）" : log.toPayload();
  return `你是街健训练助教，只服务同一个人。今天是 ${isoDate(today)}。

## 训练日志（唯一事实源）
${data}

${RULES}`;
}
