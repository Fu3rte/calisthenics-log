/**
 * 训练日志加载状态机：loading / ready / error 三态互斥。
 * hook 无条件在组件顶层调用，早返回交给调用方，保证 hook 顺序恒定。
 */
import { useEffect, useState } from "react";
import {
  fetchTrainingLog,
  peekTrainingLog,
} from "@/features/training-log/api/trainingLogClient";
import type { Session } from "@/features/training-log/model/trainingLog";

export type TrainingLogState =
  | { status: "loading" }
  | { status: "ready"; sessions: Session[] }
  | { status: "error"; message: string };

export function useTrainingLog(): TrainingLogState {
  const [state, setState] = useState<TrainingLogState>(() => {
    const cached = peekTrainingLog();
    return cached
      ? { status: "ready", sessions: cached.sessions }
      : { status: "loading" };
  });

  useEffect(() => {
    let alive = true;
    fetchTrainingLog()
      .then((data) => {
        if (alive) setState({ status: "ready", sessions: data.sessions });
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setState({
          status: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
