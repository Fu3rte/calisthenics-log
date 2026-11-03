import { useMemo, useState } from "react";
import { DayRecord } from "@/features/training-log/components/DayRecord";
import { TrainingCalendar } from "@/features/training-log/components/TrainingCalendar";
import { Card } from "@/shared/ui/card";
import { SidebarTrigger } from "@/shared/ui/sidebar";
import {
  currentMonthKey,
  monthParts,
  type Session,
} from "@/features/training-log/model/trainingLog";

const EMPTY_MSG = "还没有训练记录。写下第一组，这里会出现你的训练日历。";

export function Dashboard({ sessions: rawSessions }: { sessions: Session[] }) {
  const sessions = useMemo(
    () => [...rawSessions].sort((a, b) => a.date.localeCompare(b.date)),
    [rawSessions]
  );

  /* 可选月范围：最早记录月 ~ 当前自然月；记录落在未来月时以记录为界 */
  const months = useMemo(() => {
    const now = currentMonthKey();
    const first = sessions[0]?.date.slice(0, 7);
    const last = sessions[sessions.length - 1]?.date.slice(0, 7);
    const max = last && last > now ? last : now;
    return { min: first && first < max ? first : max, max, initial: last ?? max };
  }, [sessions]);

  const [viewMonth, setViewMonth] = useState(months.initial);
  const [selected, setSelected] = useState<string | null>(
    sessions[sessions.length - 1]?.date ?? null
  );

  /* 换月后落到该月最近一次训练；空月清空选中 */
  const changeMonth = (monthKey: string) => {
    setViewMonth(monthKey);
    const inMonth = sessions.filter((s) => s.date.startsWith(monthKey));
    setSelected(inMonth.length ? inMonth[inMonth.length - 1].date : null);
  };

  const { year, month } = monthParts(viewMonth);
  const monthSessions = sessions.filter((s) => s.date.startsWith(viewMonth));
  const selectedSession = selected
    ? sessions.find((s) => s.date === selected) ?? null
    : null;

  return (
    <div className="app-scroll h-full">
      <main className="app-main">
        <header className="flex items-start gap-3">
          <SidebarTrigger className="mt-1 md:hidden" />
          <div className="min-w-0 flex-1">
            <h1 className="display-text whitespace-nowrap text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] min-[960px]:text-[32px]">
              训练日志
            </h1>
            <p className="mt-1 text-[14.5px] leading-[1.6] text-muted-foreground">
              {sessions.length ? `${year} 年 ${month} 月 · 训练记录` : "训练记录"}
            </p>
          </div>
        </header>

        {sessions.length === 0 ? (
          <div className="glass-panel is-text px-6 py-10">
            <p className="text-[14.5px] leading-[1.8] text-muted-foreground">
              {EMPTY_MSG}
            </p>
          </div>
        ) : (
          <div className="app-grid">
            <div className="app-col">
              <TrainingCalendar
                monthKey={viewMonth}
                minMonth={months.min}
                maxMonth={months.max}
                onMonthChange={changeMonth}
                sessions={monthSessions}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
            <div className="app-col">
              {selectedSession ? (
                <DayRecord session={selectedSession} />
              ) : (
                <Card className="glass-panel day-panel self-start">
                  <p className="day-note is-empty">
                    {year} 年 {month} 月还没有训练记录。
                  </p>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
