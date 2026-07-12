# ADFRAME / Cocos 工程设置清单（AI Game Workspace）

面向：**playableAdFramework（ADFRAME / PA）** + **symbolEditor（SE）** 接入 [AI Game Workspace](./AI-GAME-WORKSPACE.md) 时的硬性与推荐要求。

相关文档：

| 文档 | 用途 |
|------|------|
| [AI-GAME-WORKSPACE.md](./AI-GAME-WORKSPACE.md) | Workspace 架构、远程多用户 F1–F7 |
| [COCOS-AI-FRIENDLY.md](./COCOS-AI-FRIENDLY.md) | Scene/Prefab/路径绑定等 AI 友好写法 |
| Profile 模板 | [`ai-game-workspace/templates/project.profile.playable.json`](../ai-game-workspace/templates/project.profile.playable.json) |

快速自检：

```bash
node ai-game-workspace/scripts/check-adframe-project.mjs
node ai-game-workspace/scripts/check-adframe-project.mjs --pa D:/path/to/pa --se D:/path/to/se
```

---

## 0. 总览：谁要满足什么

```text
中心 Windows 主机
 ├─ Cocos Creator（须支持多开）…… F3 门禁
 ├─ PA 工程 × N（每用户×项目一份 worktree）
 ├─ SE 工程 × N（同上）
 ├─ cocos-meta-mcp 桥（每 Creator 实例独立端口）
 └─ AI Game Workspace Server（编排 / Portal / 预览 iframe）
```

| 层 | 必须 |
|----|------|
| **主机** | Windows；多开版 Creator 3.8.x；Node；`hutao`/`git`；`cursor-agent` |
| **PA（ADFRAME）** | 3.8.8 工程结构 + profile 路径 + 扩展 + 布局 bootstrap |
| **SE** | 盘面编辑器 + `?aiws_board=1` 嵌入桥 + runtime 与 PA 可同步 |
| **Workspace** | `config.json` / meta / profile 指到正确 PA/SE 与端口 |

---

## 硬性指标（必须满足）

下列为 ADFRAME 试玩模板的 **硬约束**。换皮 / 新项目若偏离，须同步改 profile 与渠道验收标准，并明确告知 Workspace。

### H1. 分辨率与适配

| 项 | 硬性值 | 配置位置 |
|----|--------|----------|
| 设计分辨率 | **720 × 1280**（竖屏） | `settings/v2/packages/project.json` → `general.designResolution` |
| fitWidth | **false** | 同上 |
| fitHeight | **true** | 同上（按高度适配，宽度可裁切/留边由 Canvas 策略决定） |
| 主 UI 根尺寸 | Prefab 根 `UITransform` = **720×1280** | `MainUI.prefab` / `CTA.prefab` 根节点 |
| 方向 | **Portrait only** | 试玩与商店素材按竖屏交付；不要做成可横竖切换的双布局 |
| Camera | 正交；与设计稿一致（模板 orthoHeight 常为 **640**） | `Main.scene` → Camera（AI **不改** scene，建模板时定好） |

Profile 字段（playable 模板已写）：`designResolution.width/height/fitWidth/fitHeight/orientation`。

**禁止：**

- 擅自改成 1080×1920 / 750×1334 等而不改全套贴图与布局契约
- `fitWidth=true` 且 `fitHeight=true` 同时开（易导致非预期拉伸）
- 在业务 prefab 里再挂第二套 `Canvas` / `Camera`

**验收：**

```bash
node ai-game-workspace/scripts/check-adframe-project.mjs
# 须 PASS：designResolution 720×1280、fitHeight=true、fitWidth=false
```

### H2. 可用组件（白名单）与禁用（黑名单）

面向 **AI / 布局写回 / 换皮**：只使用下列引擎组件搭 UI。模板 MainUI/CTA 实测亦落在此集合。

#### 允许（白名单）

| 组件 | 用途 | 备注 |
|------|------|------|
| `cc.UITransform` | 尺寸 / 锚点 | **每个** UI 节点必备；布局写回改 `_contentSize` |
| `cc.Sprite` | 贴图 | 换皮主路径；保持 SpriteFrame 引用可覆盖 |
| `cc.Label` | 文案 / 分数 | 简单文本；复杂排版优先位图字或拆节点 |
| `cc.Button` | 点击 | CTA / 下载等；事件在 TS 里绑，不靠 Inspector 拖 Node |
| `cc.Widget` | 贴边对齐 | 仅稳态布局；**不要**对挂 Widget 的同一节点做 position/scale tween |
| `cc.Mask` | 裁剪 | 常用根下 `Mask/...` 路径契约 |
| `cc.Graphics` | 简单矢量/遮罩辅助 | 少用；复杂图形改贴图 |
| `sp.Skeleton` | Spine | 符号 / CTA 等；换皮覆盖 atlas/skel，勿改节点名 |
| 薄自定义挂载 | 如 `BoardStage` | 只暴露配置引用；**不**在大 prefab 堆业务逻辑 |

Scene 壳允许：`cc.Canvas`、`cc.Camera`、`cc.Widget`、唯一入口脚本（如 `MainEntry`）。

运行时按需 `getComponent` 的组件（如 `UIOpacity`）可以代码添加，**不必**预挂在 prefab 上。

#### 默认禁用（黑名单 · AI 不要新增）

| 组件 | 原因 |
|------|------|
| `cc.Layout` | 自动排布与手调坐标 / 布局写回冲突 |
| `cc.ScrollView` / `PageView` / `EditBox` / `Toggle` / `Slider` / `ProgressBar` | 试玩交互面过重；非 ADFRAME 模板契约 |
| `cc.RichText` | 解析与换皮成本高；用 Label / 位图字 |
| `cc.SafeArea` | 设计稿按 720×1280 满画布；安全区用 Widget 手工留白 |
| `cc.Animation`（剪辑动画） | 表现走 Spine / tween / 盘面模板；避免与 Widget 抢 transform |
| `cc.AudioSource` 挂在 UI 节点 | 音效走 key 化 `Sfx` 服务，不挂节点组件 |
| 业务 `Canvas`/`Camera` 进 Prefab | 渲染根只在 scene |
| `@property(Node\|Button\|…)` Inspector 拖绑定 | 见 [COCOS-AI-FRIENDLY.md](./COCOS-AI-FRIENDLY.md)；用路径 + genbot |

特殊需求（如必须 ScrollView）须 **人工改模板 + 更新本文与 profile**，禁止 Agent 自行引入。

### H3. 其它硬性指标

| 项 | 硬性要求 |
|----|----------|
| Creator | **3.8.8**（`package.json` → `creator.version`） |
| 渲染 | **2D UI** 试玩；不以 3D 场景作主界面 |
| Scene | 仅壳；**AI 禁止改** `.scene` |
| Prefab 根 | 与设计分辨率同尺寸；业务树在 prefab |
| 节点名 | 布局/Agent 按 `_name` 匹配；契约节点名稳定（如 `Mask/multi/greenball`） |
| 布局写回能力 | 目前支持节点 **position / size(UITransform)** 等；不支持改 Layout 自动单元格 |
| 换图 | 覆盖被引用 png + `.meta` 尺寸；inbox 在 `.ai-workspace/inbox`，禁止建在 `assets/` |
| 上传体积 | Workspace `maxUploadBytes` 默认 **50MB** / 文件 |
| 正式包 | `PREVIEW=false`；不得依赖 layout-inject |
| Git | 工程操作使用 **`hutao`**（Workspace `gitBin`） |

### H4. 硬性清单（勾选）

- [ ] `designResolution` = 720×1280，`fitWidth=false`，`fitHeight=true`
- [ ] MainUI / CTA 根 `UITransform` 为 720×1280
- [ ] 业务 UI 组件仅来自白名单；无黑名单组件（除非已文档化例外）
- [ ] Scene 无业务节点；无第二 Canvas
- [ ] 无 `@property` 拖 Node 作为唯一 UI 绑定
- [ ] Creator 3.8.8 + cocos-meta-mcp 已启用

---

## 1. 主机与 Creator

### 1.1 必装

- [ ] **Cocos Creator 3.8.8**（与 ADFRAME `package.json` → `creator.version` 一致）
- [ ] 安装路径可被 Workspace 发现，或显式配置：
  - `config.creatorExe` / `AIWS_CREATOR_EXE`
  - 默认探测：`C:/ProgramData/cocos/editors/Creator/3.8.*/CocosCreator.exe`
- [ ] **支持多开**的 Creator 构建（普通单实例不够；多用户同机必须）
- [ ] Node.js（跑 `ai-game-workspace/server.mjs` 与脚本）
- [ ] Git CLI；工程操作优先 **`hutao`**（Workspace `gitBin`）
- [ ] `cursor-agent` 在 PATH（或 `config.cursorAgent`）

### 1.2 多开门禁（F3 · 上线前人工）

```bash
node ai-game-workspace/scripts/multi-open-gate.mjs
node ai-game-workspace/scripts/multi-open-gate.mjs --check http://127.0.0.1:3921 http://127.0.0.1:3922
```

- [ ] 两个独立 `pa/` 目录各开一 Creator 进程
- [ ] 预览端口不冲突
- [ ] 各实例 cocosmcp `GET /health` 正常且 **不串台**（对 A refresh，B 不被误刷）
- [ ] 记录：版本号、稳定槽数、单槽大致内存

**未过 F3 → 不要依赖 Portal 自动开多 Creator。**

### 1.3 端口约定（端口池会分配；本机 demo 常用）

| 用途 | Demo 常见值 | 池段（默认） |
|------|-------------|--------------|
| PA 预览 | `7456` | preview 池 |
| SE 预览 | `7457` | boardPreview 池 |
| PA cocosmcp | `3921` | `13921–14020` |
| SE cocosmcp | 独立端口 | boardCocosmcp 池 |
| Workspace | `8780` | `publicBaseUrl` |

多用户时以 `meta.json` / `port-pool.json` 为准，不要写死 demo 端口。

---

## 2. ADFRAME（playableAdFramework）工程要求

### 2.1 引擎与工程元数据

- [ ] `package.json` 中 `"creator": { "version": "3.8.8" }`（或与主机 Creator 一致的 3.8.x）
- [ ] 可用 Git 克隆；远程多用户下作为 **PA 模板源**（`projects-registry`）
- [ ] **分辨率 / 组件** 满足上文 **硬性指标 H1–H4**（`settings/v2/packages/project.json` + profile `designResolution`）

### 2.2 目录与关键路径（须与 Profile 对齐）

Playable profile 默认路径（可改 profile，**不可**在核心代码写死）：

| Profile 字段 | 默认相对路径 | 作用 |
|--------------|--------------|------|
| `autoDetectRel` / `layoutPrefabRel` | `assets/resources/prefab/MainUI.prefab` | 布局写回 / 换图尺寸 / 自动识别 playable |
| `entryScriptRel` | `assets/scripts/MainEntry.ts` | 布局 inject 引导注入点 |
| `boardCfgRel` | `assets/resources/cfg/doc_example.json` | 盘面 JSON（PA 侧副本） |
| `symbolLibraryRel` | `assets/resources/symbol-library.prefab` | 符号库 |
| `animTemplatesRel` | `assets/scripts/editor-app/animTemplates.ts` | 与 SE 模板比对 |

另须存在（AI / 布局工作流）：

- [ ] `assets/scenes/Main.scene` — **仅壳**（Canvas/Camera + MainEntry）；AI **不改 scene**
- [ ] `assets/resources/prefab/MainUI.prefab`、`CTA.prefab`（或等价业务 prefab）
- [ ] `assets/resources/ui/` — 常见换图落点
- [ ] `assets/scripts/_genbot/` — genbot 生成的 view/bind（若用 genbot）
- [ ] 收件箱在工程根：`.ai-workspace/inbox`（**不要**建在 `assets/` 下）

### 2.3 扩展（Extension）

在 Creator **扩展管理**中启用：

| 扩展 | 路径 | 必须？ | 用途 |
|------|------|--------|------|
| **cocos-meta-mcp** | `extensions/cocos-meta-mcp` | **是** | HTTP 桥：refresh / exec / 预览热更；Workspace 依赖 |
| **genbot** | `extensions/genbot` | 强烈建议 | Prefab → view/bind 生成 |
| **super-html** | `extensions/super-html` | 出包需要 | 渠道试玩打包（布局 bootstrap 在正式包为 `PREVIEW=false`） |

- [ ] 打开工程后扩展已启用且无报错
- [ ] cocosmcp 桥监听地址与 Workspace `cocosmcpUrl` / meta 一致
- [ ] 多开时 **每个 Creator 实例** 使用独立桥端口（勿共用 3921）

### 2.4 布局编辑引导（AIWS bootstrap）

Workspace 会向 `entryScriptRel` 注入 / 校验 `installLayoutBootstrap`（仅 `PREVIEW`）：

- [ ] `MainEntry`（或 profile 指定入口）`import { PREVIEW } from "cc/env"`
- [ ] 在合适时机调用：`if (PREVIEW) this.installLayoutBootstrap();`
- [ ] `callNeedle` 与 profile 一致（playable 默认在 `onAllPlayed = () => this.showCTA()` 附近）
- [ ] 预览 URL 带 `?aiws_layout=1` 时能加载 `{publicBaseUrl}/layout-inject.js`
- [ ] **正式 / super-html 包** 不执行该逻辑（`PREVIEW=false`）

本地修复引导：

```text
# 由 Workspace 任务/布局流触发 ensureLayoutBootstrap；
# 或确认 MainEntry 已含 installLayoutBootstrap 且 publicBaseUrl 正确
```

### 2.5 AI 友好结构（硬约定）

详见 [COCOS-AI-FRIENDLY.md](./COCOS-AI-FRIENDLY.md)。接入 Workspace 时至少满足：

- [ ] Scene 只做壳；业务全在 Prefab
- [ ] `MainEntry` 启动时实例化全部会用到的 prefab（可先隐藏）
- [ ] 节点用路径查找，避免 `@property` 拖 Node 作为唯一绑定
- [ ] 布局写回按节点 **`_name`** 匹配（profile `layoutPrefabRel`）；重要控件名保持稳定
- [ ] 音效等资源 key 化，缺资源不崩

### 2.6 SE → PA Runtime 同步

Profile `seRuntimeScripts` / `seRuntimeDirs` 列出的文件必须在 **SE 与 PA 同相对路径** 存在（同步保留 PA `.meta`）：

- [ ] `assets/scripts/editor-app/` 下 Board/Symbol 相关脚本（见 playable profile 清单）
- [ ] `assets/scripts/common`、`editor-core`、`vendor/slot-presentation-ir` 等目录
- [ ] **禁止**在 PA 手改 `animTemplates`；只在 SE 扩展后执行同步

```bash
node ai-game-workspace/scripts/sync-se-runtime.mjs --se <seRoot> --pa <paRoot>
```

### 2.7 Capabilities（Profile）

Playable 默认全开；裁剪工程时在 profile 关闭：

| Capability | 关闭后 |
|------------|--------|
| `layout` | 布局写回不可用 |
| `board` | 盘面 Tab / board_* WS 拒绝 |
| `symbol` | 符号列表拒绝 |
| `seRuntimeSync` | 禁止 sync runtime |
| `promptDomainHints` | Prompt 不加领域线索 |

---

## 3. symbolEditor（SE）工程要求

- [ ] 与 PA 同 Creator 大版本（3.8.x）
- [ ] 可作为独立工程被第二 Creator 实例打开
- [ ] 存在与 profile 相同的 `animTemplatesRel` 及 `seRuntime*` 路径（同步源）
- [ ] 盘面编辑主流程可用；预览端口写入 `boardPreviewUrl`
- [ ] **嵌入桥**：`PersistenceService` 在 `?aiws_board=1` 时
  - autosave / 导出 → `postMessage` 给 Workspace parent
  - 接收 `load-doc` / `request-doc`
- [ ] cocosmcp 扩展启用；桥端口与 meta `boardCocosmcpUrl` 一致（勿与 PA 抢端口）

---

## 4. Workspace 侧绑定清单

### 4.1 单机 Demo（`config.json`）

- [ ] `projectRoot` → PA
- [ ] `boardEditorRoot` → SE
- [ ] `previewUrl` / `boardPreviewUrl` 与 Creator 预览一致
- [ ] `cocosmcpUrl` 指向 **当前打开的 PA** 桥
- [ ] `publicBaseUrl` 可被预览页访问（布局 inject；勿写死错误主机）
- [ ] `profilePath` → `templates/project.profile.playable.json`（或自定义）
- [ ] `inboxRel` → `.ai-workspace/inbox`
- [ ] `gitBin` → `hutao`

### 4.2 远程工作区（`meta.json`）

- [ ] `{dataRoot}/workspaces/{user}/{project}/pa|se` 已 `prepare-workspace` / `init-project`
- [ ] 端口已分配并写入 meta
- [ ] Portal 进入后 `?meta=` → `workspace_apply_meta` 成功
- [ ] 需要编辑器时勾选「打开 Creator」或已有存活 pid

### 4.3 新游戏 / 换皮工程（非 playable 模板）

- [ ] 自建 `project.profile.*.json`，填齐路径与 `capabilities`
- [ ] 配置 `config.profilePath` / `AIWS_PROFILE`（不要依赖 MainUI 自动探测）
- [ ] 若无盘面：关 `board` / `symbol` / `seRuntimeSync`
- [ ] 布局 needle / bootstrap 按该工程入口脚本改写

---

## 5. 验收清单（建议顺序）

1. [ ] `node ai-game-workspace/scripts/check-adframe-project.mjs` 全部 PASS（含分辨率）  
2. [ ] **H1–H4** 硬性指标勾选完成  
3. [ ] Creator 打开 PA：扩展正常，预览可开，`cocosmcp /health` OK  
4. [ ] 预览加 `?aiws_layout=1`：布局编辑层可加载  
5. [ ]（若用盘面）Creator 打开 SE：预览 + `?aiws_board=1` 嵌入 Workspace 可通信  
6. [ ] `sync-se-runtime` 后 `animTemplates` inSync  
7. [ ] Workspace 发一条简单改图/改文案任务：能改 prefab、预览刷新、可 commit（人工确认）  
8. [ ] F3 多开实测通过后再开多用户 Portal 自动拉起  

---

## 6. 常见失败

| 现象 | 排查 |
|------|------|
| 布局 Tab 无编辑层 | `publicBaseUrl`、bootstrap、`?aiws_layout=1`、预览是否真 PREVIEW |
| 任务后预览不更新 | cocosmcp 端口是否指到正确实例；扩展是否启用 |
| 布局写回错 prefab | `layoutPrefabRel`；节点名是否改过 |
| sync 报 no seRuntime* | profile 未加载或列表为空 |
| 多用户预览串台 | F3 未过 / 桥端口共用 |
| Agent 只装 recipe 就结束 | Prompt 规则；属执行问题非工程设置 |

---

## 7. 文档与仓库索引

| 仓库 | 说明 |
|------|------|
| `ae_meta_mcp` | 本文档 + Workspace 设计文档 |
| `-ai_game_frame` / `ai-game-workspace` | Server、profile、校验脚本 |
| `playableAdFramework` | ADFRAME 模板工程 |
| `symbolEditor` | 盘面编辑器模板 |
