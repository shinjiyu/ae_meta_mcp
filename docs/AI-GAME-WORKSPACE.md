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

### Symbol 美术包（按盘面）

AI 经 SE 桥静默导出「盘面用到的」符号依赖，再 merge 进 PA：

1. `symbol-tools/export-pack-for-ai`（cocos-meta-mcp；Cursor skill `se-symbol-pack-export`）
2. `node ai-game-workspace/scripts/merge-symbol-pack.mjs --pack <se>/temp/symbol-pack --pa <pa>`
3. 或 WS `symbol_pack_merge`

详见 SE `docs/SYMBOL-PACK-EXPORT.md`、[ADFRAME-COCOS-SETUP.md](./ADFRAME-COCOS-SETUP.md) §2.6.0。

### 符号 MVP 边界

- 列出 `symbol-library.prefab` 的 `SymbolEntry`
- 可换贴图 / Spine（覆盖 uuid，复用 `asset_replace`）
- **不做**：增删条目、改 anim 名、自定义 prefab、CellFx、预览墙（仍用 Creator）

### SE 嵌入桥

`PersistenceService` 在 `?aiws_board=1` 时：

- `autosave` / 导出 → `postMessage` 给 Workspace
- 接收 `load-doc` / `request-doc`

---

## 19. 远程多用户（工作区 / 模板库 / SQLite）

目标：中心 Windows 上 **用户 × 工作区** 独立工作树；**不再**把本机共享 `playableAdFramework` / `symbolEditor` 当作默认运行工程。登录后扫描进行中工作区或新建（必须选 PA + SE 模板）；模板库由 admin 管理。

**工程接入清单（ADFRAME / Creator 设置）** → [`ADFRAME-COCOS-SETUP.md`](./ADFRAME-COCOS-SETUP.md)  
自检：`node ai-game-workspace/scripts/check-adframe-project.mjs`

### 目录约定

```text
{dataRoot}/
  aiws.db              # SQLite：users / templates / workspaces
  port-pool.json
  workspaces/{userId}/{workspaceId}/
    pa/                # PA 模板 git clone
    se/                # SE 模板 git clone
    meta.json          # 路径/端口/状态（Creator 可读）
```

默认 `dataRoot`：`ai-game-workspace/data/aiws-data`（`AIWS_DATA_ROOT` / config `dataRoot`）。  
`workspaceId` 为短 uuid；`meta.projectId` 与之相同（兼容旧 apply）。

### 数据模型（SQLite）

- `users`：登录用户、`last_workspace_id`
- `templates`：`kind=pa|se`、`git_url`、`enabled`…
- `workspaces`：用户工作区状态、`pa_template_id` / `se_template_id`、端口摘要、pid

首次启动若 templates 为空，从 [`projects-registry.json`](../ai-game-workspace/templates/projects-registry.json) 的 `defaults.paGitUrl` / `seGitUrl` **seed** 两条默认模板。

### Portal 流程

1. 登录（kuroneko 邮箱密码，或 `authMode=dev`）
2. **进行中**：`GET /api/portal/workspaces`
3. **新建**：`POST /api/portal/workspaces` `{ name, paTemplateId, seTemplateId, openCreator? }` → clone 两库、写 meta、写 DB
4. **进入**：`POST /api/portal/workspaces/:id/enter` → 端口复用、可选 Creator → `/?meta=...` → WS `workspace_apply_meta`
5. **归档**：`POST .../archive`（只改 status，不删磁盘）

模板只读：`GET /api/portal/templates?kind=pa|se`  
Admin 写：`/api/admin/templates` + 页面 `/portal/templates/`（`config.adminEmails`）

### 运行时绑定

- `config.json` **不设**默认本机 `projectRoot` / `boardEditorRoot`；冷启动可起 Portal
- 无选中工作区时 Chat / 布局 / 盘面 API 拒绝，提示先进入工作区
- 进入后 `projectRoot`→`pa/`，`boardEditorRoot`→`se/`

### 准备工作区 CLI

```bash
# 推荐：显式 git URL + workspace-id
node ai-game-workspace/scripts/prepare-workspace.mjs \
  --user alice --workspace-id ws_demo \
  --pa-git https://github.com/shinjiyu/SlotPlayableAdFrame.git \
  --se-git https://github.com/shinjiyu/CocosSlotsEditor.git \
  --allocate-ports true

# 本机路径作源（更快）
node ai-game-workspace/scripts/prepare-workspace.mjs \
  --user smoke --workspace-id local1 \
  --pa-git D:/workspace/playableAdFramework \
  --se-git D:/workspace/symbolEditor \
  --allocate-ports true

# 旧：registry project id（仍可用）
node ai-game-workspace/scripts/prepare-workspace.mjs --user alice --project demo
```

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
| `designResolution` / `componentsAllowed` / `componentsForbidden` | 分辨率与组件硬指标（见 [ADFRAME-COCOS-SETUP.md](./ADFRAME-COCOS-SETUP.md)） |
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

部署：**本机 AIWS**（见上文启动命令）。已放弃 Windows Sandbox 方案。

### F2 — 准备工作区（不开 Creator）

见上文「准备工作区 CLI」。注册表仅作 seed / 兼容；日常以 DB 模板为准。

### F3 — 多开门禁（人工）

```bash
node ai-game-workspace/scripts/multi-open-gate.mjs
node ai-game-workspace/scripts/multi-open-gate.mjs --check http://127.0.0.1:3921 http://127.0.0.1:3922
```

须用**支持多开**的 Creator，在两个独立 `pa/` 目录各开一实例；桥不串台才算过。未过则不要上 F6。

### F4 — 端口池

- [`lib/port-pool.mjs`](../ai-game-workspace/lib/port-pool.mjs)：为 `user/workspace` 分配 preview / boardPreview / cocosmcp / boardCocosmcp
- 状态：`{dataRoot}/port-pool.json`
- `prepare-workspace.mjs --allocate-ports` 会写入 `meta.json`

```bash
node ai-game-workspace/scripts/smoke-port-pool.mjs
```

### F5 — 登录 + 工作区 Portal

- 页面：`http://127.0.0.1:8780/portal/`
- 模板管理：`http://127.0.0.1:8780/portal/templates/`（admin）
- Auth：`authMode=kuroneko`（默认）或 `dev` + `portalToken`
- Admin：`config.adminEmails`（匹配登录邮箱；dev 也可匹配 userId）
- API：`/api/portal/workspaces`、`/api/portal/templates`、`/api/admin/templates`

### F6 / F7 — 初始化与绑定

新建/进入工作区由 Portal API 调 `prepare-workspace`（git URL）；勾选「打开 Creator」才拉起。  
跳转 `/?meta=...` 后 Workspace WS 自动 `workspace_apply_meta`（F7）。

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
| Profile 去硬编码（路径 + SE sync + prompt flags） | ✅ |
| ADFRAME/Cocos 设置 DOC + check 脚本 | ✅ |

Workspace 实现仓：`https://github.com/shinjiyu/-ai_game_frame.git`（`ai-game-workspace/`）。设计文档在本仓 `ae_meta_mcp`。


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
