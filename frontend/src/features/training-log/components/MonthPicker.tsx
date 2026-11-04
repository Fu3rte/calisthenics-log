import { useState } from "react";
import { Chevron } from "@/shared/ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { monthParts } from "@/features/training-log/model/trainingLog";

interface MonthPickerProps {
  /** 当前展示月，YYYY-MM */
  value: string;
  /** 最早可选月：首条记录所在月 */
  min: string;
  /** 最晚可选月：当前自然月 */
  max: string;
  onChange: (monthKey: string) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function MonthPicker({ value, min, max, onChange }: MonthPickerProps) {
  const { year, month } = monthParts(value);
  const [open, setOpen] = useState(false);
  const [panelYear, setPanelYear] = useState(year);
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(max.slice(0, 4));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPanelYear(year);
      }}
    >
      <PopoverTrigger
        id="calendarTitle"
        className="month-trigger"
        aria-label={`选择月份，当前显示 ${year} 年 ${month} 月`}
      >
        <span>
          {year} 年 {month} 月
        </span>
        <Chevron dir="down" className="month-caret" />
      </PopoverTrigger>

      <PopoverContent className="month-pop">
        <div className="month-year-bar">
          <button
            type="button"
            className="month-nav-btn"
            aria-label="上一年"
            disabled={panelYear <= minYear}
            onClick={() => setPanelYear((y) => y - 1)}
          >
            <Chevron dir="left" />
          </button>

          <span className="month-year num">{panelYear}</span>

          <button
            type="button"
            className="month-nav-btn"
            aria-label="下一年"
            disabled={panelYear >= maxYear}
            onClick={() => setPanelYear((y) => y + 1)}
          >
            <Chevron dir="right" />
          </button>
        </div>

        <div className="month-grid" role="group" aria-label={`${panelYear} 年月份`}>
          {MONTHS.map((m) => {
            const key = `${panelYear}-${String(m).padStart(2, "0")}`;
            return (
              <button
                key={m}
                type="button"
                className="month-cell"
                disabled={key < min || key > max}
                aria-pressed={key === value}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
              >
                {m} 月
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
