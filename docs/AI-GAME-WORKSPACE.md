# AI Game Workspace（内部版）

| 字段 | 内容 |
|------|------|
| Version | v0.1 |
| Author | 于振宇 |
| Date | 2026-07-10 |

---

## 1. 项目目标

为游戏策划提供一个**完全基于自然语言修改 Cocos 工程**的工作环境。

策划**无需安装**：

- Cursor
- Cocos Creator
- Git

仅通过浏览器即可完成：

- 描述需求
- 上传资源
- 查看实时效果
- 回滚修改

整个开发过程由 AI 自动完成。

---

## 2. 设计目标

### 目标工作流

```text
打开网页 → 描述需求 → 等待几十秒 → 网页刷新 → 满意继续 / 不满意恢复
```

### 替代的旧流程

```text
找程序 → 解释需求 → 等待 → 程序改 → 重新打包 → 确认
```

---

## 3. 核心设计原则

> **默认**：工程变更由 AI 执行器（Cursor CLI + Cocos MCP）完成。  
> **例外（直改面板）**：布局 / 盘面 cfg / 符号贴图覆盖由 Workspace 服务端直接写盘并 `hutao` 提交，不经 Chat。

边界划分：

| 层级 | 职责 |
|------|------|
| **Workspace** | 用户体验、任务编排、资源管理、版本管理；布局/盘面/符号直改 |
| **AI 执行器** | Chat 需求理解并修改工程 |
| **symbolEditor** | 盘面模板 SoT；Workspace 盘面 Tab iframe 挂载其预览 |
| **Cocos Creator** | 编译和预览（PA 与 SE 可各开一实例） |
| **Git (`hutao`)** | 提供事务、历史和回滚 |

这个边界划分让系统未来更容易维护和替换底层能力。

---

## 4. 总体架构

```text
                    Browser
        ┌─────────────────────────────┐
        │      AI Workspace           │
        │  Chat · Upload · Preview    │
        │  History                    │
        └──────────────┬──────────────┘
                       │ HTTP / WebSocket
                Agent Server
                       │
        ┌──────────────┼──────────────┐
        │              │              │
 Prompt Builder   Task Queue   Workspace Manager
        │              │              │
        └──────────────┼──────────────┘
                       │
                  Cursor CLI
                       │
                  Cocos MCP
                       │
                 Cocos Creator
                       │
                 Browser Preview
                       │
                  Git Repository
```

---

## 5. 系统组成

### 5.1 Web Workspace

提供给策划的**唯一入口**。

**包含：**

- 聊天窗口
- 文件上传（图片、PSD、ZIP、Excel 等）
- Cocos Preview
- 历史记录

**不暴露：**

- Cursor
- Cocos
- Git

### 5.2 Agent Server

整个系统的大脑。

**职责：**

- 管理聊天
- 管理上传
- 管理 Task
- 管理 Cursor 调用
- 管理 Git
- 管理历史

所有逻辑都放这里。

### 5.3 Cursor Worker

**仅负责：**

```text
收到 Prompt → 调用 Cursor CLI → 等待结束 → 返回结果
```

**Cursor 不负责：**

- 上传
- Session 管理
- Git
- UI

### 5.4 Workspace Manager

负责工程状态。

**文件管理**

```text
上传 button.png → 复制到 assets/ui/tmp/button.png
```

**Prompt 组织**

```text
用户要求：把登录按钮改成这个样子。

图片：assets/ui/tmp/button.png

当前工程：xxxxx

要求：修改 Prefab。
```

**Session**

维护：

```text
Workspace → Cursor Session → 历史 Prompt
```

避免每次重新建立上下文。

---

## 6. Web UI

建议布局：

```text
┌──────────────────────────────────────────────┐
│                                              │
│           Cocos Preview                      │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│ Chat                                         │
│                                              │
│ > 把开始按钮放大                             │
│                                              │
│ 📎 上传图片    📁 上传 PSD                   │
│                                              │
│ [发送]                                       │
├──────────────────────────────────────────────┤
│                                              │
│ 当前任务                                     │
│                                              │
│ 正在修改 Prefab                              │
│ 正在编译                                     │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│ 历史版本                                     │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 7. 上传能力

**支持格式：**

| 类型 | 格式 |
|------|------|
| 图片 | PNG、JPG 等 |
| 设计稿 | PSD、AI |
| 资源包 | ZIP |
| 配置 | Excel、JSON |
| 媒体 | 音频、视频 |

**处理流程：**

```text
workspace/upload/ → 复制到工程 → Prompt 引用路径
```

上传由 Workspace 处理，**不让 Cursor 处理上传**。

---

## 8. 截图能力

**支持方式：**

- Ctrl+V 粘贴
- 截图工具
- 拖拽图片

**保存路径：**

```text
workspace/screenshots/
```

**Prompt 示例：**

```text
用户上传：workspace/screenshots/001.png
请参考截图修改 UI。
```

---

## 9. Preview

**实现：**

- 使用 `iframe` 加载 `localhost:xxxx`

**提供：**

- Reload
- Auto Refresh
- Screenshot

**未来扩展：**

- FPS
- Resolution
- Device
- Scale

---

## 10. Task Queue

所有请求进入队列，避免多个 Cursor 同时修改工程。

```text
Task1 → Task2 → Task3
```

**状态流转：**

| 状态 | 说明 |
|------|------|
| Waiting | 排队中 |
| Running | AI 执行中 |
| Compile | Cocos 编译中 |
| Commit | Git 提交中 |
| Success | 完成 |
| Failed | 失败 |

通过 **WebSocket** 推送任务状态（排队、执行、编译、完成）。

---

## 11. Git 管理

这是整个系统最重要的一层。

**流程：**

```text
Task → AI 修改 → 编译成功 → Git Commit
```

**Commit Message 示例：**

```text
AI: 调整首页按钮布局
```

---

## 12. 历史版本

### UI 展示

```text
历史记录
──────────────────
09:52  修改首页按钮        [恢复]
09:30  导入角色图片        [恢复]
09:10  修改登录 UI         [恢复]
──────────────────
```

### 后台实现

- `git revert` 或 `git reset`

策划无需了解 Git。

---

## 13. Diff

每个 Task 展示修改文件列表，例如：

- `Login.ts`
- `Login.prefab`
- `button.png`

点击可查看 **Git Diff**，方便程序员排查。

---

## 14. AI 执行流程

```text
聊天
  ↓
生成 Task
  ↓
准备 Prompt + 上传资源
  ↓
Cursor CLI
  ↓
MCP 修改工程
  ↓
Cocos 自动编译
  ↓
等待完成
  ↓
验证
  ↓
Git Commit
  ↓
返回成功
```

---

## 15. 错误恢复

**编译失败时：**

```text
Cursor 继续修 → 再次编译 → 直到成功
```

**超过重试次数：**

- Task 标记为 Failed
- **不 Commit**

---

## 16. 后续扩展

| 能力 | 说明 |
|------|------|
| **语音** | 「把这个按钮放大」 |
| **圈图** | 截图上画圈标注修改区域 |
| **录屏** | 录 10 秒行为，AI 分析「Boss 太难了」等反馈 |
| **自动 Review** | 提交后 AI 总结修改内容与风险 |
| **自动 Branch** | 大型需求按 `feature/activity`、`feature/login` 等分支隔离 |

**自动 Review 示例：**

```text
本次修改：
  - 修改 Prefab
  - 新增图片
  - 删除脚本

风险：
  - 影响登录界面
```

---

## 17. MVP（本周末实现）

2 天内跑起来的最小可用版本：

| # | 能力 | 状态 |
|---|------|:----:|
| 1 | Web 页面（聊天 + iframe） | ✅ |
| 2 | 文件上传（图片、ZIP） | ✅ |
| 3 | 调用 Cursor CLI | ✅ |
| 4 | Cocos MCP 自动修改 | ✅ |
| 5 | iframe 自动刷新 | ✅ |
| 6 | Task 队列（单线程即可） | ✅ |
| 7 | 每个 Task 自动 git commit | ✅ |
| 8 | 历史记录列表 | ✅ |
| 9 | 一键 Revert 到某个历史版本 | ✅ |
| 10 | 显示本次修改的文件列表 | ✅ |
| 11 | WebSocket 推送任务状态 | ✅ |
| 12 | 布局直改（节点位置/换图） | ✅ |
| 13 | 盘面 Tab（iframe symbolEditor → 写回 cfg） | ✅ |
| 14 | 符号列表 + 换贴图/Spine MVP | ✅ |
| 15 | SE→PA runtime 同步脚本 | ✅ |

---

## 18. 盘面 + 符号（直改通道）

Workspace 除 Chat（AI 执行器）外，还有**直写工程**面板，不经 Cursor：

| Tab | 预览 | 写回 |
|-----|------|------|
| **布局** | PA `previewUrl` + `?aiws_layout=1` | `MainUI.prefab` / 贴图覆盖 |
| **盘面** | SE `boardPreviewUrl` + `?aiws_board=1` | `assets/resources/cfg/doc_example.json` |
| **符号**（盘面侧栏） | 同上 | 覆盖 `symbol-library` 引用的贴图/Spine |

### 双工程配置（`ai-game-workspace/config.json`）

```json
{
  "projectRoot": "D:/workspace/playableAdFramework",
  "previewUrl": "http://127.0.0.1:7456",
  "boardEditorRoot": "D:/workspace/symbolEditor",
  "boardPreviewUrl": "http://127.0.0.1:7457",
  "boardCfgRel": "assets/resources/cfg/doc_example.json"
}
```

- **Chat / 布局**：Creator 打开 `playableAdFramework`，预览 `7456`。
- **盘面**：Creator 打开 `symbolEditor`，预览 `7457`（或本机实际端口）。
- 模板（`animTemplates` 等）**只在 symbolEditor 扩展**；试玩工程靠同步，禁止在 PA 手改模板。

### 模板同步

```bash
node ai-game-workspace/scripts/sync-se-runtime.mjs
```

或盘面 Tab「同步 runtime」（WS `board_sync_runtime`）。复制 SE→PA 的 runtime 脚本，**保留 PA `.meta`**。

### 符号 MVP 边界

- 列出 `symbol-library.prefab` 的 `SymbolEntry`
- 可换贴图 / Spine（覆盖 uuid，复用 `asset_replace`）
- **不做**：增删条目、改 anim 名、自定义 prefab、CellFx、预览墙（仍用 Creator）

### SE 嵌入桥

`PersistenceService` 在 `?aiws_board=1` 时：

- `autosave` / 导出 → `postMessage` 给 Workspace
- 接收 `load-doc` / `request-doc`

---

## 19. 远程多用户（功能拆分 · 进行中）

目标：中心 Windows 上 **用户 × 项目** 独立工作区；登录与项目管理后续迭代。当前已落地 **F1 配置抽离**、**F2 基础工程准备**。

### 目录约定

```text
{dataRoot}/workspaces/{userId}/{projectId}/
  pa/           # playableAdFramework clone
  se/           # symbolEditor clone
  meta.json     # 路径/端口/状态（Creator 槽位后续写入）
```

默认 `dataRoot`：`ai-game-workspace/data/aiws-data`（可用 `AIWS_DATA_ROOT` / config `dataRoot` 覆盖）。

### 项目 Profile（通用化）

工程专用路径（布局 prefab、入口脚本、盘面 cfg、符号库、Prompt 线索）放在 profile，**不写死在核心代码**：

- 模板：[`templates/project.profile.playable.json`](../ai-game-workspace/templates/project.profile.playable.json)
- 配置：`config.profilePath` 或 `AIWS_PROFILE` / `--profile`
- 若未指定且工程存在 `MainUI.prefab`，会自动选用 playable 模板（仅便利；新工程请显式配置）

| 字段 | 用途 |
|------|------|
| `layoutPrefabRel` | 布局写回 / 换图改尺寸的默认 prefab |
| `entryScriptRel` + `layoutBootstrap` | 预览布局 inject 引导注入点 |
| `boardCfgRel` / `symbolLibraryRel` / `animTemplatesRel` | 盘面 cfg、符号库、模板比对路径 |
| `seRuntimeScripts` / `seRuntimeDirs` | SE→PA runtime 同步清单（能力 `seRuntimeSync`） |
| `promptFlagPatterns` + `promptHints` | Prompt 关键词与领域线索；可关 `promptDomainHints` |
| `capabilities` | `layout` / `board` / `symbol` / `seRuntimeSync` / `promptDomainHints` |

---

### F1 — 配置

- [`lib/config.mjs`](../ai-game-workspace/lib/config.mjs)：`config.json` + `AIWS_*` 环境变量 + CLI（`--meta` / `--public-base-url` 等）
- [`lib/workspace-meta.mjs`](../ai-game-workspace/lib/workspace-meta.mjs)：`meta.json` 读写与应用到 config
- `publicBaseUrl`：布局 inject 从此加载（不再写死 `127.0.0.1:8780`）
- WS `workspace_apply_meta`：运行时按 meta 切换 `projectRoot` / 预览 URL（任务忙时拒绝）

```bash
# 冒烟
node ai-game-workspace/scripts/smoke-config.mjs

# 用已准备的工作区启动
node ai-game-workspace/server.mjs --meta ai-game-workspace/data/aiws-data/workspaces/smoke/demo/meta.json
```

### F2 — 准备工作区（不开 Creator）

```bash
# 远程模板（GitHub）
node ai-game-workspace/scripts/prepare-workspace.mjs --user alice --project demo

# 本机已有工程作源（更快）
node ai-game-workspace/scripts/prepare-workspace.mjs --user smoke --project demo \
  --registry ai-game-workspace/templates/projects-registry.local.json \
  --data-root ai-game-workspace/data/aiws-data
```

注册表：[`templates/projects-registry.json`](../ai-game-workspace/templates/projects-registry.json)。  
说明：本机 PATH 上的 Hutao `git` 对 **本地路径 clone** 可能失败；脚本在本地源时会自动改用非 Hutao 的 `git.exe`。

### F3 — 多开门禁（人工）

```bash
node ai-game-workspace/scripts/multi-open-gate.mjs
node ai-game-workspace/scripts/multi-open-gate.mjs --check http://127.0.0.1:3921 http://127.0.0.1:3922
```

须用**支持多开**的 Creator，在两个独立 `pa/` 目录各开一实例；桥不串台才算过。未过则不要上 F6。

### F4 — 端口池

- [`lib/port-pool.mjs`](../ai-game-workspace/lib/port-pool.mjs)：为 `user/project` 分配 preview / boardPreview / cocosmcp / boardCocosmcp
- 状态：`{dataRoot}/port-pool.json`
- `prepare-workspace.mjs --allocate-ports` 会写入 `meta.json`

```bash
node ai-game-workspace/scripts/smoke-port-pool.mjs
```

### F5 — 登录 + 项目管理（壳）

- 页面：`http://127.0.0.1:8780/portal/`
- Token：`config.portalToken` / `AIWS_PORTAL_TOKEN`（默认 `aiws-dev`）
- API：`/api/portal/login|logout|me|projects|enter`
- 进入已准备项目会跳到 Workspace；未准备则提示跑 `prepare-workspace.mjs`（F6 再自动开 Creator）

### F6 / F7 — 初始化与绑定

```bash
# 准备 + 分配端口 + 打开 Creator×2（PA/SE）
node ai-game-workspace/scripts/init-project.mjs --user smoke --project demo \
  --registry ai-game-workspace/templates/projects-registry.local.json

# 只准备不开编辑器
node ai-game-workspace/scripts/init-project.mjs --user smoke --project demo --skip-creator true
```

- Creator 路径：`config.creatorExe` / `AIWS_CREATOR_EXE`（默认探测 `ProgramData/cocos/editors/Creator/3.8.*`）
- Portal「进入」会触发 init；跳转 `/?meta=...` 后 Workspace WS 自动 `workspace_apply_meta`（F7）
- **多开**：须使用支持多开的 Creator；先跑 `scripts/multi-open-gate.mjs` 门禁
- Portal 默认**不**开 Creator（勾选「进入时打开 Creator」才开）；已记录 pid 且进程仍在则复用，不重复拉起
- `GET /api/portal/slots`：当前用户工作区与 PA/SE 进程存活状态

### 进度（截止）

| 块 | 状态 |
|----|------|
| F1 配置抽离 | ✅ |
| F2 基础工程准备 | ✅ |
| F3 多开门禁 | 清单就绪，待人工实测 |
| F4 端口池 | ✅ |
| F5 登录/项目管理 | ✅ |
| F6 init + Creator | ✅（pid 复用） |
| F7 meta 绑定 | ✅ |
| Profile 去硬编码 | ✅ |

`ai-game-workspace` 本地 git 有提交但**尚未配置 remote**；文档仓 `ae_meta_mcp` 已 push。


---

## 附录：职责边界速查

```text
┌─────────────────┬──────────────────────────────────────────┐
│ 组件            │ 做什么 / 不做什么                         │
├─────────────────┼──────────────────────────────────────────┤
│ Web Workspace   │ 聊天、上传、预览、历史；不碰工程文件       │
│ Agent Server    │ 编排一切；不直接改 Cocos                  │
│ Cursor Worker   │ 执行 Prompt；不管上传/Git/UI              │
│ Workspace Mgr   │ 资源路径、Prompt 组装、Session 上下文     │
│ Cocos Creator   │ 编译 + 预览                               │
│ Git             │ 版本事务 + 回滚                           │
└─────────────────┴──────────────────────────────────────────┘
```
