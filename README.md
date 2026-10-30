# 街健日志

纯自重训练的本地记录看板。JSON 存数据，React 渲染，训练期间用命令行逐组录入。

## 功能

- **训练日历**：按月查看训练日，点击切换当天记录。
- **次数天际线**：每组一柱，高度对应次数，一眼看出哪组掉速。
- **组次明细**：每组次数与感受，备注里的 `RIR` 自动提取为徽章。
- **动作分类**：引体类归「拉」，臂屈伸类归「推」，其余归「其他」，可筛选。
- **空态与错误态分离**：没有记录时给出提示，数据格式错误时明确报错。

## 技术栈

React 19 · Vite 6 · TypeScript · Tailwind CSS 4 · shadcn/ui 风格组件 · GSAP

## 快速开始

```bash
npm install
cp 训练日志.example.json 训练日志.json
cp 训练快照.example.json 训练快照.json
npm run dev
```

`训练日志.json` 与 `训练快照.json` 属于个人数据，已在 `.gitignore` 中排除，仓库里只保留 `.example.json` 模板。

其他脚本：

```bash
npm run build     # 类型检查 + 构建
npm run preview   # 预览构建产物
npm run lint      # 仅类型检查
```

## 数据结构

正式记录 `训练日志.json`，结构见 `训练日志.schema.json`：

```json
{
  "sessions": [
    {
      "date": "2026-03-02",
      "exercises": [
        { "name": "引体向上", "sets": [10, 9, 8, 7] }
      ],
      "note": "第三组起明显掉速"
    }
  ]
}
```

- `sets` 为每组次数数组，数组长度即组数，单组次数不一致可直接体现。
- `note` 记录当天感受，`RIR` 字样会被界面提取为徽章。

训练进行中的临时记录 `训练快照.json`，结构见 `训练快照.schema.json`：

```json
{
  "date": "2026-03-10",
  "status": "recording",
  "sets": [
    { "exercise": "引体向上", "reps": 12, "note": "第8次起掉速" }
  ],
  "notes": ["组间歇约 2 分 30 秒"]
}
```

扁平结构便于逐组追加，训练结束后由脚本聚合成正式记录。

## 记录流程

完整协议见 `AGENTS.md`。核心是三个状态：

```
idle --开始训练--> recording --练完了--> 合并入库 --> idle
```

命令行工具 `scripts/training_log.py`：

| 命令 | 作用 |
|---|---|
| `start` | 初始化今日快照，进入 recording |
| `add "引体向上" 12 "第8次起掉速"` | 追加一组 |
| `note "组间歇约 2 分 30 秒"` | 追加跨组感受 |
| `show` | 查看当前快照 |
| `merge` | 聚合并入 `训练日志.json`，校验通过后清空快照 |
| `check` | 校验两份 JSON 是否符合 schema |

需要 Python 3.9 及以上，无第三方依赖。

## 文档

- `健身理论.md`：引体向上专项耐力的机制梳理与文献索引，训练方法的判断依据。
- `AGENTS.md`：训练记录协议，含口述解析规则与硬性约束。

## 许可

MIT
