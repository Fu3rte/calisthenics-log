# AGENTS.md

街健记录协议。训练进行中把口述逐组写入快照，训练结束后一次性转换成正式记录。

## 数据文件

| 文件 | 角色 |
|---|---|
| `训练快照.json` | 训练中的临时记录，逐组追加，状态 `idle` / `recording` / `done` |
| `训练日志.json` | 正式记录，唯一事实源，看板 `src/data/train.ts` 直接 import |
| `训练日志.schema.json` | 正式记录结构契约 |
| `训练快照.schema.json` | 快照结构契约 |
| `scripts/training_log.py` | 录入、校验、合并的命令行工具 |

## 状态机

```
idle --「开始今日的街健」--> recording --「练完了」--> 合并入库 --> idle
```

## 开始

触发语：`开始今日的街健`、`开始训练`、`开练`。

执行 `python scripts/training_log.py start`，回复一行：日期 + 已进入记录状态。

不列训练计划，不问今天练什么。

## 记录中

用户口述 → 命令映射：

| 口述 | 动作 |
|---|---|
| 引体向上，第一组，12 个 | `add "引体向上" 12` |
| 还是引体，第二组 12，第 8 个开始掉速，RIR 1-2 | `add "引体向上" 12 "第8次起掉速，RIR 1-2"` |
| 下一组 11，力竭 | `add "引体向上" 11 "力竭"` |
| 换双杠臂屈伸，第一组 10 个 | `add "双杠臂屈伸" 10` |
| 组间歇 2 分半 | `note "组间歇约 2 分 30 秒"` |
| 前两组还行，第三组开始崩 | `note "前两组还行，第三组开始崩"` |

规则：

1. 每条口述立刻落盘，用 `add` 或 `note`，不攒到训练结束。
2. 只记录用户说过的数字。次数、RIR、组间歇缺失就留空，禁止估算或补全。
3. 未报动作名时沿用上一条动作。
4. 用户报的「第几组」与快照实际组数不符，按实际位置追加，回复中说明真实组序。
5. 训练中只回一行确认，例如 `引体向上 第 2 组 12｜RIR 1-2`。不点评、不建议、不追问。
6. 用户纠正已记数字，直接改快照对应项，回复只给修正后的值。

## 结束

触发语：`练完了`、`练完`、`结束`、`收工`、`就这样`。

1. `python scripts/training_log.py show`，复述全部组与感受，供用户核对。
2. 用户确认或补齐遗漏后，`python scripts/training_log.py merge`。
3. 汇报：日期、每个动作的组数、各组次数、合计次数、note 内容。

用户未核对就催进度，仍先 `show` 一次。

## 转换规则

`merge` 内建，无需手工聚合：

- 快照的扁平 `sets` 按动作首次出现顺序分组，数组顺序即组序；每组保留 `reps` 与 `note`（写入 `sets[n]` 为 `{reps, note}` 对象）。
- 同日已有记录则并入该条：同名动作追加组数，新动作追加到末尾。
- 整体 `notes` 去重后以 `；` 拼接，写入 `session.note`；逐组 `note` 不进 `session.note`，保留在每组 `sets[n].note`，界面按组展示。
- 写入前按 schema 校验，校验失败中止且不改动任何文件。
- 入库后快照自动重置为 `idle`。

## 硬性约束

- 训练未结束时不得写入 `训练日志.json`。
- 不改两份 schema 的结构。结构确需调整时先改 schema，再改数据与 `src/data/train.ts` 的类型。
- 不碰 `src/` 下的渲染逻辑，看板由设计计划驱动。
- 组数、次数必须是正整数；`note` 可为空字符串，不允许省略字段。

## 常用命令

```bash
python scripts/training_log.py start          # 开始，初始化今日快照
python scripts/training_log.py add "引体向上" 12 "第8次起掉速"
python scripts/training_log.py note "组间歇约 2 分 30 秒"
python scripts/training_log.py show           # 查看快照
python scripts/training_log.py merge          # 入库并重置快照
python scripts/training_log.py check          # 校验两份 JSON
```
