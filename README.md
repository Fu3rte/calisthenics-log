# 街健日志

纯自重训练的本地记录看板。JSON 存数据，React 渲染，训练期间用命令行逐组录入。

> 训练问答后端已移除，前端问答入口当前无法使用。训练记录与理论文档继续保留。

## 功能

- **侧栏导航**：左侧玻璃导轨在「训练日志」与「训练问答」之间切换，`⌘/Ctrl + B` 收起，移动端变抽屉。
- **训练日历**：按月查看训练日，点击切换当天记录。
- **组次明细**：每组次数与逐组感受，备注里的 `RIR` 自动提取为徽章，按组展示。
- **对话**：使用配置的模型流式回答；独立路由 `#/chat`。
- **空态与错误态分离**：没有记录时给出提示，数据格式错误时明确报错。

## 技术栈

前端 React 19 · Vite 6 · TypeScript · Tailwind CSS 4 · shadcn/ui 风格组件 · GSAP
后端 Node 22 · TypeScript · `@earendil-works/pi-ai`（多 provider 模型适配）

npm workspaces 单仓双包：`frontend/` 与 `backend/` 各持自己的 `package.json` 与依赖，根 `package.json` 只做 workspace 声明与编排脚本。

## 快速开始

```bash
npm install
cp backend/训练日志.example.json backend/训练日志.json
cp backend/训练快照.example.json backend/训练快照.json
npm run dev
```

`backend/训练日志.json` 与 `backend/训练快照.json` 属于个人数据，已在 `.gitignore` 中排除，仓库里只保留 `.example.json` 模板。

其他脚本：

```bash
npm run build      # 前后端构建
npm run build:web  # 构建前端到 frontend/dist
npm run build:api  # 编译后端到 backend/dist
npm run preview    # 预览构建产物
npm run lint       # 前后端类型检查
npm run dev:api    # 启动后端
npm run dev:web    # 启动 Vite
```

## 训练问答

默认打开的页面，路由 `#/chat`，侧栏第一项；训练日志在第二项，路由 `#/training`。单页应用，切页不刷新，全站只有 `index.html` 一个入口。本地功能，不上服务器。

- 后端 `backend/` 的 `ai` 负责模型、provider 与凭证，`agent` 负责对话循环和 HTTP。
- `read` / `write` / `edit` / `bash` 工具代码保留在 `backend/src/agent/tools/`，当前对话循环未注册工具。
- provider 目录不写死名单：`backend/src/ai/providerRegistry.ts` 取 pi-ai 出厂的 42 家，按各家的 auth 能力分组，环境变量名由 `auth.apiKey.resolve()` 离线问出。默认模型也不写死：`CHAT_MODEL` 以 `provider/model` 指定，未设置时前端取清单里第一个已配置 provider 的模型。
- 侧栏底部「模型配置」条目开配置面板，双栏：左栏列已配置的 provider（名称 + 模型数），底部是「添加 Provider」入口；右栏出选中那家的模型（超过 8 个才给筛选框）与「管理连接」。模型清单只下发已配置 provider 的家，未配置的走添加流程。本机 `localStorage` 只存选了哪个模型，回复上限不在面板里调，一律用服务端的 `CHAT_MAX_TOKENS`；请求只带 `settings.model`，缺省的上限由服务端补默认值，解析不出这个 `provider/model` 时报未知模型。
- 「添加 Provider」浮层两组卡片：自定义（OpenAI / Anthropic 兼容端点，填 id、显示名、Base URL、API 格式、模型 id 一行一个）、API KEY（逐家列模型数，点选后回到右栏填密钥）。服务端清单里双认证的家仍按「订阅」与「API KEY」两条下发，面板只渲染可填密钥的那条，订阅登录本机不接。
- 面板页脚「测试连接」用当前草稿模型发一条真实请求，走 `/api/chat` 同一条 SSE 通道，量出耗时与回复原文，失败时给服务端文案；不进会话历史。
- 密钥只写 `backend/.env`（已 gitignore），读取顺序 `.env` → 系统环境变量，前者优先，不读其他工具的登录态。面板与接口只回掩码（末 4 位），浏览器不保存密钥；换密钥不用重启，下一次请求即生效。自定义端点的定义写 `backend/providers.json`（同为 gitignore 的本机数据，只存端点与模型 id，不存密钥），删除端点会连带抹掉它在 `.env` 里的那一行。
- Bedrock、Azure、Vertex、Cloudflare 网关与 Workers AI 需要 region / resource / account 等额外字段，这五家不进列表；只有分类器模型的家（如 typesafe）由「零模型不进列表」这条规则挡掉。
- 对话请求携带浏览器中的历史消息，由 Agent 循环发送给模型。
- 会话存在浏览器 `localStorage`，最多带 12 轮；单条输入上限 2000 字，回复上限取 `CHAT_MAX_TOKENS`（默认 900）。

### 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 探活，返回默认模型 |
| `GET` | `/api/models` | 已配置 provider 的模型清单、密钥状态（掩码）与服务端默认值 |
| `GET` | `/api/settings/providers` | 添加 Provider 浮层的分组清单（模型数、可否填 key、是否已配置） |
| `GET` | `/api/settings/connection` | 各 provider 的密钥状态与来源，只回掩码 |
| `PUT` | `/api/settings/connection` | `{ provider, apiKey }` 写入或清空 `.env` 里那一行，返回新状态；`apiKey` 传空串即断开 |
| `PUT` | `/api/settings/providers/custom` | 新增或覆盖自定义端点定义，写 `providers.json` |
| `DELETE` | `/api/settings/providers/custom?id=` | 删除自定义端点，连带抹掉它的密钥行 |
| `POST` | `/api/chat` | `{ messages, settings? }` → SSE，`data: {delta}` / `{done}` / `{error}` |

## 目录结构

```
frontend/                       前端包（React + Vite）
  index.html                    唯一入口，加载侧栏路由与两个页面
  src/
    app/                        外壳：App、AppSidebar、RouteStage、router
                               训练页 TrainingLogPage/Dashboard、main
    features/
      training-log/             model（类型与格式化）· api（fetch）· hooks · components
      coach-chat/               model · api（SSE）· hooks · components · pages
    shared/                     ui（sidebar/dialog/glass-button…）· lib · hooks · styles
  package.json                  React/Vite/Tailwind 依赖
  vite.config.ts                构建产物到 frontend/dist
backend/                        后端包（问答 API）+ 训练数据
  src/
    ai/                         模型、provider、凭证与配置
    agent/                      对话循环、HTTP/SSE 与工具代码
    main.ts                     组合根
  训练日志.json / 训练快照.json   个人记录（gitignore），含 .example.json 与 .schema.json
  package.json                  pi-ai 依赖
  tsconfig.json                 NodeNext，编译到 backend/dist
scripts/                        training_log.py 录入工具 · dev.mjs 双进程启动器
deploy/                         发布与服务器初始化脚本
```

## 数据结构

正式记录 `backend/训练日志.json`，结构见 `backend/训练日志.schema.json`：

```json
{
  "sessions": [
    {
      "date": "2026-03-02",
      "exercises": [
        { "name": "引体向上", "sets": [10, 9, 8, 7] },
        { "name": "高位引体", "sets": [{ "reps": 5, "note": "第4次掉速" }] }
      ],
      "note": "第三组起明显掉速"
    }
  ]
}
```

- `sets` 兼容两种写法：纯数字数组 `[10, 9, 8, 7]`（旧数据），或对象数组 `[{ "reps": 5, "note": "..." }]`（带逐组备注）。数组长度即组数。
- `note` 记录当天整体感受；`RIR` 字样会被界面提取为徽章（当天备注与逐组备注都支持）。
- 逐组备注在 `merge` 时保留在各组 `sets[n].note`，界面按组展示，不再丢失「属于哪一组」。

训练进行中的临时记录 `backend/训练快照.json`，结构见 `backend/训练快照.schema.json`：

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

## 数据加载

看板**运行时**从同源 `fetch` `训练日志.json`（不在构建时内联）。数据文件只有 `backend/训练日志.json` 一份：dev 由 Vite 中间件直接读它，构建时拷进 `frontend/dist`，因此发布后只要更新服务器上的 `训练日志.json` 并刷新即可看到新数据；`deploy.sh` 每次构建会把它一并发布。

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
| `merge` | 聚合并入 `backend/训练日志.json`，校验通过后清空快照 |
| `check` | 校验两份 JSON 是否符合 schema |

需要 Python 3.9 及以上，无第三方依赖。

## 文档

- `健身理论.md`：骨骼肌代谢/神经模块——引体向上专项耐力的机制梳理与文献索引。
- `肌腱训练理论.md`：上肢肌腱模块——手指屈肌、肘屈肌与前臂肌腱的适应证据与负荷推导。
- `AGENTS.md`：训练记录协议，含口述解析规则与硬性约束。

## 许可

MIT
