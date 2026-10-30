#!/usr/bin/env python3
"""训练日志工具：快照 → 正式记录 的转换与校验。

用法（在项目根目录执行）：
  python scripts/training_log.py start          开始今日训练，初始化快照
  python scripts/training_log.py check          校验 训练日志.json 与 训练快照.json
  python scripts/training_log.py merge          快照并入 训练日志.json，然后重置快照
  python scripts/training_log.py show           打印快照当前内容
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "训练日志.json"
SNAP = ROOT / "训练快照.json"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SEP = "；"


def out(msg):
    print(msg)


def load(path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def dump(path, data):
    with path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def empty_snapshot():
    return {"date": "", "status": "idle", "sets": [], "notes": []}


# ---------------- 校验 ----------------

def check_log(data):
    errs = []
    if not isinstance(data, dict) or set(data) != {"sessions"}:
        return ["顶层字段必须且仅包含 sessions"]
    sessions = data["sessions"]
    if not isinstance(sessions, list):
        return ["sessions 必须是数组"]
    for i, s in enumerate(sessions):
        p = f"sessions[{i}]"
        if not isinstance(s, dict) or set(s) != {"date", "exercises", "note"}:
            errs.append(f"{p} 字段必须为 date/exercises/note")
            continue
        if not isinstance(s["date"], str) or not DATE_RE.match(s["date"]):
            errs.append(f"{p}.date 格式应为 YYYY-MM-DD")
        if not isinstance(s["note"], str):
            errs.append(f"{p}.note 必须是字符串")
        exs = s["exercises"]
        if not isinstance(exs, list) or not exs:
            errs.append(f"{p}.exercises 必须是非空数组")
            continue
        for j, e in enumerate(exs):
            ep = f"{p}.exercises[{j}]"
            if not isinstance(e, dict) or set(e) != {"name", "sets"}:
                errs.append(f"{ep} 字段必须为 name/sets")
                continue
            if not isinstance(e["name"], str) or not e["name"]:
                errs.append(f"{ep}.name 必须是非空字符串")
            st = e["sets"]
            if not isinstance(st, list) or not st:
                errs.append(f"{ep}.sets 必须是非空数组")
                continue
            for k, r in enumerate(st):
                if not isinstance(r, int) or isinstance(r, bool) or r < 1:
                    errs.append(f"{ep}.sets[{k}] 必须是正整数")
    return errs


def check_snapshot(data):
    errs = []
    if not isinstance(data, dict) or set(data) != {"date", "status", "sets", "notes"}:
        return ["顶层字段必须为 date/status/sets/notes"]
    if data["status"] not in ("idle", "recording", "done"):
        errs.append("status 必须是 idle / recording / done")
    d = data["date"]
    if not isinstance(d, str) or not (d == "" or DATE_RE.match(d)):
        errs.append("date 必须为空串或 YYYY-MM-DD")
    if data["status"] != "idle" and not d:
        errs.append("非 idle 状态必须填写 date")
    if not isinstance(data["notes"], list) or any(not isinstance(n, str) for n in data["notes"]):
        errs.append("notes 必须是字符串数组")
    if not isinstance(data["sets"], list):
        errs.append("sets 必须是数组")
        return errs
    for i, s in enumerate(data["sets"]):
        p = f"sets[{i}]"
        if not isinstance(s, dict) or set(s) != {"exercise", "reps", "note"}:
            errs.append(f"{p} 字段必须为 exercise/reps/note")
            continue
        if not isinstance(s["exercise"], str) or not s["exercise"]:
            errs.append(f"{p}.exercise 必须是非空字符串")
        r = s["reps"]
        if not isinstance(r, int) or isinstance(r, bool) or r < 1:
            errs.append(f"{p}.reps 必须是正整数")
        if not isinstance(s["note"], str):
            errs.append(f"{p}.note 必须是字符串")
    return errs


# ---------------- 快照 → 记录 ----------------

def group_sets(snap):
    """按动作首次出现顺序分组，保持组内顺序。"""
    order, groups = [], {}
    for s in snap["sets"]:
        name = s["exercise"].strip()
        if name not in groups:
            groups[name] = []
            order.append(name)
        groups[name].append(s["reps"])
    return [(n, groups[n]) for n in order]


def collect_note(snap):
    parts, seen = [], set()
    for s in snap["sets"]:
        t = s["note"].strip()
        if t and t not in seen:
            seen.add(t)
            parts.append(t)
    for n in snap["notes"]:
        t = n.strip()
        if t and t not in seen:
            seen.add(t)
            parts.append(t)
    return SEP.join(parts)


def merge():
    snap = load(SNAP)
    errs = check_snapshot(snap)
    if errs:
        out("快照格式错误：")
        for e in errs:
            out("  - " + e)
        return 1
    if snap["status"] == "idle" or not snap["sets"]:
        out("快照为空，没有可入库的组。")
        return 1

    log = load(LOG)
    errs = check_log(log)
    if errs:
        out("训练日志格式错误：")
        for e in errs:
            out("  - " + e)
        return 1

    date = snap["date"]
    pairs = group_sets(snap)
    note = collect_note(snap)
    target = next((s for s in log["sessions"] if s["date"] == date), None)

    if target is None:
        target = {
            "date": date,
            "exercises": [{"name": n, "sets": list(r)} for n, r in pairs],
            "note": note,
        }
        log["sessions"].append(target)
        log["sessions"].sort(key=lambda s: s["date"])
        action = "新建"
    else:
        for name, reps in pairs:
            hit = next((e for e in target["exercises"] if e["name"] == name), None)
            if hit is None:
                target["exercises"].append({"name": name, "sets": list(reps)})
            else:
                hit["sets"].extend(reps)
        if note:
            target["note"] = SEP.join([x for x in (target["note"], note) if x])
        action = "并入"

    errs = check_log(log)
    if errs:
        out("合并结果不符合 schema，已中止：")
        for e in errs:
            out("  - " + e)
        return 1

    dump(LOG, log)
    dump(SNAP, empty_snapshot())

    out(f"{action} {date} 记录：")
    for e in target["exercises"]:
        total = sum(e["sets"])
        out(f"  {e['name']}  {len(e['sets'])} 组  {e['sets']}  合计 {total}")
    out(f"  note: {target['note'] or '(空)'}")
    out(f"日志共 {len(log['sessions'])} 条记录，快照已重置。")
    return 0


# ---------------- 入口 ----------------

def cmd_add():
    """add <动作> <次数> [备注]"""
    if len(sys.argv) < 4:
        out('用法: add "引体向上" 12 "第8次起掉速"')
        return 2
    snap = load(SNAP)
    errs = check_snapshot(snap)
    if errs:
        out("快照格式错误：")
        for e in errs:
            out("  - " + e)
        return 1
    if snap["status"] != "recording":
        out("当前不在记录状态，先执行 start。")
        return 1
    name = sys.argv[2].strip()
    try:
        reps = int(sys.argv[3])
    except ValueError:
        out("次数必须是整数。")
        return 1
    if not name or reps < 1:
        out("动作名称不能为空，次数必须为正整数。")
        return 1
    note = sys.argv[4].strip() if len(sys.argv) > 4 else ""
    snap["sets"].append({"exercise": name, "reps": reps, "note": note})
    dump(SNAP, snap)
    idx = sum(1 for s in snap["sets"] if s["exercise"] == name)
    out(f"{name} 第 {idx} 组 {reps} 次" + (f"（{note}）" if note else "") + f"，快照共 {len(snap['sets'])} 组。")
    return 0


def cmd_note():
    """note <整段感受>"""
    if len(sys.argv) < 3:
        out('用法: note "组间歇约 2 分 30 秒"')
        return 2
    snap = load(SNAP)
    if snap["status"] != "recording":
        out("当前不在记录状态，先执行 start。")
        return 1
    text = " ".join(sys.argv[2:]).strip()
    if not text:
        out("感受内容为空。")
        return 1
    snap["notes"].append(text)
    dump(SNAP, snap)
    out(f"已记录感受：{text}")
    return 0


def cmd_start():
    snap = load(SNAP) if SNAP.exists() else empty_snapshot()
    errs = check_snapshot(snap)
    if errs:
        out("现有快照格式错误，未覆盖：")
        for e in errs:
            out("  - " + e)
        return 1
    if snap["status"] in ("recording", "done") and snap["sets"]:
        out(f"存在未入库的快照 {snap['date']}（{len(snap['sets'])} 组），先 merge 或手动清空。")
        return 1
    today = datetime.now().strftime("%Y-%m-%d")
    dump(SNAP, {"date": today, "status": "recording", "sets": [], "notes": []})
    out(f"新快照 {today}，状态 recording。")
    return 0


def cmd_check():
    rc = 0
    for path, fn in ((LOG, check_log), (SNAP, check_snapshot)):
        if not path.exists():
            out(f"{path.name}: 不存在")
            rc = 1
            continue
        errs = fn(load(path))
        out(f"{path.name}: " + ("OK" if not errs else "有误"))
        for e in errs:
            out("  - " + e)
        rc = rc or (1 if errs else 0)
    return rc


def cmd_show():
    snap = load(SNAP)
    out(f"date={snap['date']} status={snap['status']} 组数={len(snap['sets'])}")
    for i, s in enumerate(snap["sets"], 1):
        note = f"  | {s['note']}" if s["note"] else ""
        out(f"  {i}. {s['exercise']} {s['reps']}{note}")
    for n in snap["notes"]:
        out(f"  note: {n}")
    return 0


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    handlers = {
        "start": cmd_start,
        "add": cmd_add,
        "note": cmd_note,
        "check": cmd_check,
        "merge": merge,
        "show": cmd_show,
    }
    if cmd not in handlers:
        out("用法: python scripts/training_log.py [start|add|note|check|merge|show]")
        return 2
    return handlers[cmd]()


if __name__ == "__main__":
    sys.exit(main())
