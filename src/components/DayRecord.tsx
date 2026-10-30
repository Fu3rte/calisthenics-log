import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fmtDay, fmtMonth, splitNote, weekdayCN, type Session } from "@/data/train";
import { hasGsap, prefersReducedMotion } from "@/hooks/useCountUp";

export function DayRecord({ session }: { session: Session }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const note = splitNote(session.note);
  const sets = session.exercises.reduce((n, ex) => n + ex.sets.length, 0);

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
          {weekdayCN(session.date)} · {sets} 组
        </p>
      </header>

      <div ref={bodyRef}>
        <div className="day-exercises">
          {session.exercises.map((ex) => (
            <div key={ex.name} className="day-exercise">
              <span className="day-exercise-name">{ex.name}</span>
              <span className="day-exercise-sets num">{ex.sets.length} 组</span>
            </div>
          ))}
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
