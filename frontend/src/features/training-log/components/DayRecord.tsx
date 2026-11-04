import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import {
  fmtDay,
  fmtMonth,
  normalizeSet,
  splitNote,
  weekdayCN,
  type Session,
} from "@/features/training-log/model/trainingLog";
import { prefersReducedMotion } from "@/shared/hooks/prefersReducedMotion";

function InkBadge({ text }: { text: string }) {
  return (
    <span className="badge-ink inline-flex items-center shrink-0 rounded-full px-[10px] py-[2px] text-[12px] font-semibold whitespace-nowrap">
      {text}
    </span>
  );
}

export function DayRecord({ session }: { session: Session }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const note = splitNote(session.note);
  const groups = session.exercises.map((ex) => {
    const sets = ex.sets.map(normalizeSet);
    return {
      name: ex.name,
      sets,
      reps: sets.reduce((sum, s) => sum + s.reps, 0),
    };
  });
  const totalSets = groups.reduce((n, g) => n + g.sets.length, 0);
  const totalReps = groups.reduce((n, g) => n + g.reps, 0);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.style.opacity = "1";
      el.style.transform = "none";
      return;
    }

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
  }, [session.date]);

  return (
    <div
      className="glass-panel day-panel flex flex-col gap-6 self-start"
      aria-labelledby="dayTitle"
    >
      <header className="day-head">
        <h2 className="day-title" id="dayTitle">
          {fmtMonth(session.date)} 月 {fmtDay(session.date)} 日
        </h2>
        <p className="day-meta num">
          {weekdayCN(session.date)} · {totalSets} 组 · {totalReps} 次
        </p>
      </header>

      <div ref={bodyRef}>
        <div className="day-exercises">
          {groups.map((group) => (
            <div key={group.name} className="day-exercise">
              <div className="day-exercise-head">
                <span className="day-exercise-name">{group.name}</span>
                <span className="day-exercise-sets num">
                  {group.sets.length} 组 · {group.reps} 次
                </span>
              </div>
              <ol className="day-set-list">
                {group.sets.map((s, i) => {
                  const setNote = splitNote(s.note ?? "");
                  return (
                    <li key={i} className="day-set">
                      <span className="day-set-index num">第 {i + 1} 组</span>
                      <span className="day-set-leader" aria-hidden="true" />
                      <span className="day-set-reps num">{s.reps} 次</span>
                      {(setNote.text || setNote.badge) && (
                        <span className="day-set-note">
                          {setNote.text}
                          {setNote.badge && <InkBadge text={setNote.badge} />}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>

        <p className={`day-note${session.note ? "" : " is-empty"}`}>
          {session.note ? (
            <>
              {note.text}
              {note.badge && <InkBadge text={note.badge} />}
            </>
          ) : (
            "正常训练"
          )}
        </p>
      </div>
    </div>
  );
}
