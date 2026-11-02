import { useEffect, useMemo, useState } from "react";
import { DayRecord } from "@/components/DayRecord";
import { TrainingCalendar } from "@/components/TrainingCalendar";
import { Card } from "@/components/ui/card";
import {
  currentMonthKey,
  loadTrainingData,
  monthParts,
  type Session,
} from "@/data/train";

const ERROR_MSG =
  "训练日志读不出来。确认 训练日志.json 在同目录，格式符合 schema。";
const EMPTY_MSG = "还没有训练记录。写下第一组，这里会出现你的训练日历。";
const LOADING_MSG = "正在加载训练记录…";

export default function App() {
  const [data, setData] = useState<{ sessions: Session[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadTrainingData()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-[960px] px-5 py-12">
        <p className="text-[14.5px] leading-[1.8]">{ERROR_MSG}</p>
        <p className="mt-2 text-[13px] text-muted-foreground">{error}</p>
      </main>
    );
  }

  if (data === null) {
    return (
      <main className="mx-auto max-w-[960px] px-5 py-12">
        <p className="text-[14.5px] leading-[1.8] text-muted-foreground">
          {LOADING_MSG}
        </p>
      </main>
    );
  }

  return <Dashboard sessions={data.sessions} />;
}

function Dashboard({ sessions: rawSessions }: { sessions: Session[] }) {
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
    <>
      <div className="bed" aria-hidden="true">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <div className="app-shell">
        <div className="app-scroll">
          <main className="app-main">
            <header>
              <h1 className="display-text text-[30px] leading-[1.2] font-[650] tracking-[-0.02em] min-[960px]:text-[34px]">
                街健日志
              </h1>
              <p className="mt-1.5 text-[14.5px] text-muted-foreground">
                {sessions.length ? `${year} 年 ${month} 月 · 训练记录` : "训练记录"}
              </p>
            </header>

            {sessions.length === 0 ? (
              <div className="glass-panel px-6 py-10">
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
      </div>
    </>
  );
}
