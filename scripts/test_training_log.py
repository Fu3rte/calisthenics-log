"""training_log.py 的回归测试：分组、同日合并、整体备注去重、空日志、日期碰撞、对象 sets。

运行：pytest scripts/test_training_log.py
"""

import json
import importlib.util
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = importlib.util.spec_from_file_location("training_log", os.path.join(HERE, "training_log.py"))
tl = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tl)


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def snapshot(sets, notes=None, date="2026-11-02", status="recording"):
    return {"date": date, "status": status, "sets": sets, "notes": notes or []}


def test_group_sets_preserves_first_appearance_order():
    snap = snapshot([
        {"exercise": "引体向上", "reps": 12, "note": ""},
        {"exercise": "双杠臂屈伸", "reps": 10, "note": ""},
        {"exercise": "引体向上", "reps": 11, "note": "力竭"},
    ])
    grouped = tl.group_sets(snap)
    names = [n for n, _ in grouped]
    assert names == ["引体向上", "双杠臂屈伸"]
    # 引体向上的两组按出现顺序保留，且 note 随组带走
    assert grouped[0][1] == [
        {"reps": 12, "note": ""},
        {"reps": 11, "note": "力竭"},
    ]


def test_collect_note_only_day_level(tmp_path, monkeypatch):
    snap = snapshot(
        sets=[
            {"exercise": "引体向上", "reps": 12, "note": "第8次掉速"},
            {"exercise": "引体向上", "reps": 11, "note": "力竭"},
        ],
        notes=["组间歇约 2 分 30 秒", "组间歇约 2 分 30 秒", "第三组崩"],
    )
    monkeypatch.setattr(tl, "SNAP", tmp_path / "snap.json")
    write_json(tl.SNAP, snap)
    # 逐组备注不进 session.note，仅整体感受去重
    assert tl.collect_note(snap) == "组间歇约 2 分 30 秒；第三组崩"


def test_merge_new_session(tmp_path, monkeypatch):
    log = tmp_path / "log.json"
    snap = tmp_path / "snap.json"
    write_json(log, {"sessions": []})
    write_json(snap, snapshot([
        {"exercise": "引体向上", "reps": 12, "note": "RIR 1-2"},
        {"exercise": "引体向上", "reps": 11, "note": "力竭"},
        {"exercise": "双杠臂屈伸", "reps": 10, "note": ""},
    ], notes=["组间歇约 2 分 30 秒"]))
    monkeypatch.setattr(tl, "LOG", log)
    monkeypatch.setattr(tl, "SNAP", snap)

    rc = tl.merge()
    assert rc == 0
    data = json.loads(log.read_text(encoding="utf-8"))
    assert len(data["sessions"]) == 1
    s = data["sessions"][0]
    assert s["date"] == "2026-11-02"
    assert s["note"] == "组间歇约 2 分 30 秒"
    # 引体向上合并为一组对象数组，保留每组的 note
    by_name = {e["name"]: e for e in s["exercises"]}
    assert by_name["引体向上"]["sets"] == [
        {"reps": 12, "note": "RIR 1-2"},
        {"reps": 11, "note": "力竭"},
    ]
    assert by_name["双杠臂屈伸"]["sets"] == [{"reps": 10, "note": ""}]
    # 快照已重置
    reset = json.loads(snap.read_text(encoding="utf-8"))
    assert reset["status"] == "idle" and reset["sets"] == []


def test_merge_same_day_appends_sets(tmp_path, monkeypatch):
    log = tmp_path / "log.json"
    snap = tmp_path / "snap.json"
    write_json(log, {"sessions": [{
        "date": "2026-11-02",
        "exercises": [{"name": "引体向上", "sets": [9, 9]}],
        "note": "早上练",
    }]})
    write_json(snap, snapshot([
        {"exercise": "引体向上", "reps": 8, "note": "晚上"},
        {"exercise": "双杠臂屈伸", "reps": 10, "note": ""},
    ]))
    monkeypatch.setattr(tl, "LOG", log)
    monkeypatch.setattr(tl, "SNAP", snap)

    rc = tl.merge()
    assert rc == 0
    data = json.loads(log.read_text(encoding="utf-8"))
    assert len(data["sessions"]) == 1
    s = data["sessions"][0]
    by_name = {e["name"]: e for e in s["exercises"]}
    # 同名动作追加组数，新动作加到末尾
    assert by_name["引体向上"]["sets"] == [9, 9, {"reps": 8, "note": "晚上"}]
    assert by_name["双杠臂屈伸"]["sets"] == [{"reps": 10, "note": ""}]
    # 快照无整体备注，session.note 保持不变
    assert s["note"] == "早上练"


def test_merge_date_collision_creates_new_session(tmp_path, monkeypatch):
    log = tmp_path / "log.json"
    snap = tmp_path / "snap.json"
    write_json(log, {"sessions": [{
        "date": "2026-10-01",
        "exercises": [{"name": "引体向上", "sets": [10]}],
        "note": "",
    }]})
    write_json(snap, snapshot([
        {"exercise": "引体向上", "reps": 12, "note": ""},
    ], date="2026-11-02"))
    monkeypatch.setattr(tl, "LOG", log)
    monkeypatch.setattr(tl, "SNAP", snap)

    rc = tl.merge()
    assert rc == 0
    data = json.loads(log.read_text(encoding="utf-8"))
    assert len(data["sessions"]) == 2
    assert data["sessions"][0]["date"] == "2026-10-01"
    assert data["sessions"][1]["date"] == "2026-11-02"


def test_check_log_accepts_empty_sessions():
    errs = tl.check_log({"sessions": []})
    assert errs == []


def test_check_log_accepts_object_sets():
    data = {"sessions": [{
        "date": "2026-11-02",
        "exercises": [{"name": "引体向上", "sets": [{"reps": 12, "note": "RIR 1-2"}]}],
        "note": "",
    }]}
    assert tl.check_log(data) == []


def test_check_log_rejects_bad_reps():
    data = {"sessions": [{
        "date": "2026-11-02",
        "exercises": [{"name": "引体向上", "sets": [0]}],
        "note": "",
    }]}
    assert tl.check_log(data) != []


def test_check_log_lenient_on_extra_keys():
    data = {"sessions": [], "meta": {"v": 1}}
    assert tl.check_log(data) == []
