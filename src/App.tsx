import { useMemo, useState } from "react";
import { DayRecord } from "@/components/DayRecord";
import { TrainingCalendar } from "@/components/TrainingCalendar";
import { DATA_VALID, SESSIONS } from "@/data/train";

const ERROR_MSG =
  "训练日志读不出来。确认 训练日志.json 在同一目录，格式符合 schema。";
const EMPTY_MSG = "还没有训练记录。写下第一组，这里会出现你的训练日历。";

export default function App() {
  const sessions = useMemo(
    () => [...SESSIONS].sort((a, b) => a.date.localeCompare(b.date)),
    []
  );
  const latest = sessions[sessions.length - 1];
  const [selected, setSelected] = useState<string | null>(latest?.date ?? null);

  if (!DATA_VALID) {
    return (
      <main className="mx-auto max-w-[960px] px-5 py-12">
        <p className="text-[14.5px] leading-[1.8]">{ERROR_MSG}</p>
      </main>
    );
  }

  const monthKey = latest?.date.slice(0, 7) ?? "";
  const [year, month] = latest
    ? monthKey.split("-").map(Number)
    : [0, 0];
  const monthSessions = sessions.filter((s) => s.date.startsWith(monthKey));
  const selectedSession = latest
    ? sessions.find((s) => s.date === selected) ?? latest
    : null;

  return (
    <>
      <div className="bed" aria-hidden="true">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <main className="relative z-[1] mx-auto flex max-w-[960px] flex-col gap-6 px-5 pt-8 pb-16 min-[960px]:px-7 min-[960px]:pt-12 min-[960px]:pb-24">
        <header>
          <h1 className="display-text text-[30px] leading-[1.2] font-[650] tracking-[-0.02em] min-[960px]:text-[34px]">
            街健日志
          </h1>
          <p className="mt-1.5 text-[14.5px] text-muted-foreground">
            {latest ? `${year} 年 ${month} 月 · 训练记录` : "训练记录"}
          </p>
        </header>

        {selectedSession ? (
          <div className="grid grid-cols-1 items-start gap-4 min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] min-[900px]:gap-5">
            <TrainingCalendar
              year={year}
              month={month}
              sessions={monthSessions}
              selected={selectedSession.date}
              onSelect={setSelected}
            />
            <DayRecord session={selectedSession} />
          </div>
        ) : (
          <div className="glass-panel px-6 py-10">
            <p className="text-[14.5px] leading-[1.8] text-muted-foreground">
              {EMPTY_MSG}
            </p>
          </div>
        )}
      </main>
    </>
  );
}
