import { Card } from "@/shared/ui/card";
import { Hint } from "@/shared/ui/hint";
import { MonthPicker } from "@/features/training-log/components/MonthPicker";
import {
  monthParts,
  shiftMonth,
  weekdayCN,
  type Session,
} from "@/features/training-log/model/trainingLog";

interface TrainingCalendarProps {
  /** 展示月，YYYY-MM */
  monthKey: string;
  /** 可选月范围下界 */
  minMonth: string;
  /** 可选月范围上界 */
  maxMonth: string;
  onMonthChange: (monthKey: string) => void;
  sessions: Session[];
  selected: string | null;
  onSelect: (date: string) => void;
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function TrainingCalendar({
  monthKey,
  minMonth,
  maxMonth,
  onMonthChange,
  sessions,
  selected,
  onSelect,
}: TrainingCalendarProps) {
  const { year, month } = monthParts(monthKey);
  const byDate = new Map(sessions.map((s) => [s.date, s]));
  const daysInMonth = new Date(year, month, 0).getDate();
  /* 周一为一周起点 */
  const blanks = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const prevKey = shiftMonth(monthKey, -1);
  const nextKey = shiftMonth(monthKey, 1);
  const prevDisabled = prevKey < minMonth;
  const nextDisabled = nextKey > maxMonth;

  return (
    <Card className="glass-panel calendar-panel" aria-labelledby="calendarTitle">
      <header className="calendar-head">
        <div className="calendar-nav">
          <MonthPicker
            value={monthKey}
            min={minMonth}
            max={maxMonth}
            onChange={onMonthChange}
          />
          <div className="calendar-nav-btns">
            <Hint label="上一月" side="bottom">
              <button
                type="button"
                className="month-nav-btn"
                aria-label="上一月"
                disabled={prevDisabled}
                onClick={() => onMonthChange(prevKey)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M10 3.5 5.5 8 10 12.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </Hint>
            <Hint label="下一月" side="bottom">
              <button
                type="button"
                className="month-nav-btn"
                aria-label="下一月"
                disabled={nextDisabled}
                onClick={() => onMonthChange(nextKey)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M6 3.5 10.5 8 6 12.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </Hint>
          </div>
        </div>
        <p className="calendar-count num">{sessions.length} 次训练</p>
      </header>

      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w} className="calendar-weekday">
            {w}
          </span>
        ))}
      </div>

      <div
        className="calendar-grid"
        role="group"
        aria-label={`${year} 年 ${month} 月训练日历`}
      >
        {Array.from({ length: blanks }, (_, i) => (
          <div key={`blank-${i}`} className="calendar-cell" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const date = `${year}-${String(month).padStart(2, "0")}-${String(
            day
          ).padStart(2, "0")}`;
          const session = byDate.get(date);

          return (
            <div key={date} className="calendar-cell">
              {session ? (
                <button
                  type="button"
                  className="calendar-day has-session num"
                  aria-pressed={selected === date}
                  aria-label={`${month} 月 ${day} 日 ${weekdayCN(
                    date
                  )}，有训练记录`}
                  onClick={() => onSelect(date)}
                >
                  {day}
                </button>
              ) : (
                <span className="calendar-day is-idle num" aria-hidden="true">
                  {day}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
