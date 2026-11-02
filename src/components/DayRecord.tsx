import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  fmtDay,
  fmtMonth,
  normalizeSet,
  splitNote,
  weekdayCN,
  type Session,
} from "@/data/train";
import { hasGsap, prefersReducedMotion } from "@/hooks/useCountUp";

export function DayRecord({ session }: { session: Session }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const note = splitNote(session.note);
  const sets = session.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const reps = session.exercises.reduce((n, ex) => {
    const exReps = ex.sets.map(normalizeSet);
    return n + exReps.reduce((m, s) => m + s.reps, 0);
  }, 0);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    if (prefersReducedMotion() || !hasGsap()) {
      el.style.opacity = "1";
      el.style.transform = "none";
      return;
    }

    try {
      gsap.fromTo(
        el,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.3,
          ease: "power2.out",
          overwrite: "auto",
        }
      );
    } catch {
      el.style.opacity = "1";
      el.style.transform = "none";
    }
  }, [session.date]);

  return (
    <Card className="glass-panel day-panel self-start" aria-labelledby="dayTitle">
      <header className="day-head">
        <h2 className="day-title" id="dayTitle">
          {fmtMonth(session.date)} 月 {fmtDay(session.date)} 日
        </h2>
        <p className="day-meta num">
          {weekdayCN(session.date)} · {sets} 组 · {reps} 次
        </p>
      </header>

      <div ref={bodyRef}>
              <div className="day-exercises">
                {session.exercises.map((ex) => {
                  const sets = ex.sets.map(normalizeSet);
                  return (
                  <div key={ex.name} className="day-exercise">
                    <div className="day-exercise-head">
                      <span className="day-exercise-name">{ex.name}</span>
                      <span className="day-exercise-sets num">
                        {sets.length} 组 · {sets.reduce((m, s) => m + s.reps, 0)} 次
                      </span>
                    </div>
                    <ol className="day-set-list">
                      {sets.map((s, i) => {
                        const setNote = splitNote(s.note ?? "");
                        return (
                        <li key={i} className="day-set">
                          <span className="day-set-index">第 {i + 1} 组</span>
                          <span className="day-set-leader" aria-hidden="true" />
                          <span className="day-set-reps num">{s.reps} 次</span>
                          {setNote.text && (
                            <span className="day-set-note">{setNote.text}</span>
                          )}
                          {setNote.badge && (
                            <Badge
                              variant="ink"
                              className="badge-ink h-auto rounded-full px-[10px] py-[2px] text-[12px] font-semibold"
                            >
                              {setNote.badge}
                            </Badge>
                          )}
                        </li>
                        );
                      })}
                    </ol>
                  </div>
                  );
                })}
              </div>

        <p className={`day-note${session.note ? "" : " is-empty"}`}>
          {session.note ? (
            <>
              {note.text}
              {note.badge && (
                <Badge
                  variant="ink"
                  className="badge-ink h-auto rounded-full px-[10px] py-[2px] text-[12px] font-semibold"
                >
                  {note.badge}
                </Badge>
              )}
            </>
          ) : (
            "这次没有留下备注。"
          )}
        </p>
      </div>
    </Card>
  );
}
