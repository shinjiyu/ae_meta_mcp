# Cocos AI 友好写法（从 playableAdFramework 提炼）

本文约定一套面向 AI Agent / 人工协作的 Cocos Creator 使用方式。目标是：**节点树可预测、脚本可搜索、资源可后补**，避免依赖 Inspector 拖拽与脆弱的序列化引用。

来源工程：`playableAdFramework`。本文不涉及 View 代码生成工具。

---

## 总原则

| 原则 | 含义 |
|------|------|
| Scene 只做壳 | 场景只留 Canvas / Camera 等基础设施 + `MainEntry` |
| Prefab 承载业务树 | 业务节点与布局全在 prefab；AI **只改 prefab，不改 scene** |
| 启动即实例化 | `MainEntry` 启动时创建 **全部** 会用到的 prefab instance（可先隐藏） |
| 结构先于代码 | Prefab 里预挂齐节点；代码只查找与驱动 |
| 入口尽量少 | 大 prefab 不堆业务脚本；流程由 `MainEntry` 拉起 |
| 绑定可文本化 | 节点引用用路径字符串解析，不用 `@property` 拖 Node |
| 资源按约定 | 音效等用 key + 目录约定，缺资源不阻断流程 |

---

## 1. Scene / Prefab 分划

### 约定

主 scene（如 `Main.scene`）与业务 prefab 职责严格分开：

| 层级 | 放什么 | 谁改 |
|------|--------|------|
| **Scene** | Canvas / Camera / 基础 Widget 等引擎壳 + **唯一** `MainEntry` | 模板定好后稳定；**AI 不改** |
| **Prefab** | MainUI、CTA 等整屏业务节点树 | 换皮 / 改布局 / 加节点；**AI 只改这里（及对应 TS）** |

Scene 里 **不要** 挂业务节点、业务 Panel、第二套入口脚本。

`MainEntry` 负责：

- 启动时加载并实例化 **所有** 会用到的 UI prefab（见 §2）
- 全局输入、idle 跳转、商店链接、BGM 解锁
- 协调显示时机（例如何时把 CTA 设为可见）

### AI 编辑边界（硬规则）

> **AI 只编辑 prefab（以及对应 TS），不要编辑 scene。**

Scene 由工程模板 / 人工定好后视为稳定壳；改 UI、换皮、加节点一律改 prefab。

### 职责划分

```
Main.scene（稳定壳，AI 不改）
 ├─ Canvas / Camera / …
 └─ MainEntry
      ├─ 启动时 instantiate 全部业务 prefab（可先 active=false）
      ├─ 全局输入、idle、商店链接
      └─ 按流程切换显示（show / hide）

MainUI.prefab / CTA.prefab（AI 可改）
 ├─ 全部业务节点树
 ├─ 引擎组件 + 稳定节点名
 └─ 可选：薄 mount 组件（配置）；不堆大块业务脚本
```

### 为什么对 AI 友好

- Agent **不必碰 scene 文件**（scene diff 难读、易误伤 Camera/Canvas）。
- 唯一启动点固定：先看 `MainEntry`，再看它加载的 prefab。
- 换皮 / 改布局冲突面小：人与 AI 都只动 prefab + 脚本。

### 反例

- 在 scene 里挂分数 Label、开始按钮、CTA 面板。
- 多个 Panel 各挂一套入口脚本。
- AI 为了加一个按钮去改 `.scene`。

### 正例

- `Main.scene` ≈ Canvas + Camera + `MainEntry`。
- 加按钮 → 改 `MainUI.prefab`（及驱动脚本里的路径查找）。

---

## 2. Prefab 预挂齐节点；MainEntry 启动时创建全部 instance

### 2.1 Prefab 里包含所有会用到的节点

业务会用到的按钮、文案、面板、引导手、倍率球等 **核心 UI**，一律在 **对应 prefab** 里预先建好，并保持 **稳定的节点名与相对路径**。

运行时不要用 `new Node()` + `addChild` 去拼这些 chrome。代码只做：

- 按路径找到已有节点
- 改 `active` / 属性 / 播动画
- 在已有容器下挂 **数据驱动** 的动态内容（例如盘面格子）

大 prefab **不要堆业务脚本**；可选挂薄挂载 / 配置组件（例如 `BoardStage`：只暴露 JSON、符号库、格宽等）。

| 类型 | 是否可动态建 | 说明 |
|------|----------------|------|
| 按钮、分数 Label、CTA 内控件、引导手 | 否 | 预挂在 prefab，路径固定 |
| 盘面格子、符号实例 | 是 | 由数据（JSON / 配置）驱动 |
| 临时特效节点 | 视情况 | 播完销毁，不作为长期绑定目标 |

### 2.2 MainEntry 启动时创建所有会用到的 prefab instance

与「节点预挂」同一思路：`MainEntry` 在界面一启动就要 **load + instantiate 本局会用到的全部 prefab**，而不是用到哪屏再懒加载哪屏。

- 尚未轮到展示的屏：instance 先挂到树上，**`active = false`（或等价隐藏）**，流程到了再显示。
- 显示时机与创建时机分离：**创建 = 启动；显示 = 流程**。

#### 示例：CTA

CTA 往往是 **最后才显示** 的结算页，但 **启动时就要创建好 instance**。

原因：运行时布局编辑（预览里改位置 / 对齐 / 看层级）需要树上已经有 CTA 节点；若等 `showCTA` 才 `instantiate`，编辑阶段根本看不到、也改不到 CTA。

```ts
// 示意：启动时创建齐；显示时再打开
onLoad() {
    this._mainRoot = this.spawnPrefab(MAIN_UI_PREFAB); // 可见
    this._ctaRoot = this.spawnPrefab(CTA_PREFAB);
    this._ctaRoot.active = false; // 先藏着，流程结束再 true
}

showCTA() {
    this._ctaRoot.active = true; // 只切换显示，不再临时 load
}
```

### 为什么对 AI 友好

- Prefab 内路径稳定，Agent 改逻辑面对已知节点名，不必发明节点树。
- 启动即全量 instance → 预览 / 运行时编辑能 **提前看到所有屏**，换皮与调布局不依赖「先把流程打到 CTA」。
- 懒加载会让「后出现的屏」在编辑期缺失，AI / 人容易漏改。

### 实践要点

1. 命名用英文、简短、语义稳定（`Btn`、`panel`、`total`），避免随文案改名。
2. 一屏一个（或少数几个）prefab；换皮只换贴图 / Spine，不换树结构。
3. `MainEntry` 维护「本局 prefab 清单」，启动时全部 spawn；用 `active` 控制显隐，不要用「首次 show 才 create」代替。
4. 需要代码访问的节点，在文档或注释里列出路径清单，作为契约。

### 反例

```ts
// 反例 1：运行时拼核心 UI
const btn = new Node("Btn");
btn.addComponent(Button);
this.node.addChild(btn);

// 反例 2：用到 CTA 才加载 —— 运行时编辑早期看不到 CTA
showCTA() {
    resources.load(CTA_PREFAB, Prefab, (_, p) => {
        this.node.addChild(instantiate(p));
    });
}
```

### 正例

```ts
// prefab 层级里已有 Btn，代码只查找
const btnNode = this.node.getChildByPath("Btn");
const btn = btnNode?.getComponent(Button);

// MainEntry：启动创建 MainUI + CTA；CTA 先隐藏
private spawnShell() {
    // 并行 load MainUI + CTA，instantiate 后 CTA.active = false
}
showCTA() {
    this._ctaRoot.active = true; // 不用 resources.load
}
```

---

## 3. 不用 `@property` 绑节点；在 `onLoad` 里 `getChild` / `getComponent`

### 约定

**禁止** 用 `@property(Node)` / `@property(Button)` 等在 Inspector 里拖节点做 UI 绑定。

一律在生命周期早期用路径解析：

```ts
import { _decorator, Component, Node, Button, Label } from "cc";

const { ccclass } = _decorator;

@ccclass("MainUIDriver")
export class MainUIDriver extends Component {
    private btn!: Button;
    private totalLabel!: Label;
    private panel!: Node;

    onLoad(): void {
        const root = this.node;
        this.btn = root.getChildByPath("Btn")!.getComponent(Button)!;
        this.totalLabel = root.getChildByPath("Mask/scores/total")!.getComponent(Label)!;
        this.panel = root.getChildByPath("Mask/panel")!;
    }
}
```

推荐：

- `getChildByPath("a/b/c")`：相对根的稳定路径（优先于满场景 `find`）。
- `getComponent` / `getComponentInChildren`：取组件。
- 解析失败时打明确日志（含路径），便于 Agent / 人排查。

### `@property` 仍允许的用途

只用于 **配置与资源**，不用于 UI 节点引用，例如：

| 允许 | 示例 |
|------|------|
| 资源引用 | `JsonAsset`、`Prefab`、`AudioClip`、`SpriteFrame`、`sp.SkeletonData` |
| 数值 / 开关 | 格宽、行距、音量、是否显示网格 |
| 配置列表 | 符号库条目数组 |

典型：`BoardStage` 上拖盘面 JSON、符号库 prefab、格宽格高——这是 mount 配置，不是「把某个 Button 拖进脚本」。

**AI Game Workspace 布局 Tab**：挂有 `BoardStage` 的节点可改位置/缩放/尺寸；其子节点（运行时盘面格子等）**不进可编辑树**，选中也会回退到 `BoardStage` 本身。符号内容走盘面 / SE，不走布局直改。

### 为什么对 AI 友好

- 绑定是 **源码里的字符串**，可搜索、可 diff、可批量改，不依赖编辑器里看不见的拖拽。
- 避免「忘了拖引用 → 运行时静默 null」。
- Agent 生成 / 修改脚本时不需要同时改 prefab 序列化字段。

### 实践要点

1. 脚本挂在已包含子树的节点上时，在 **`onLoad`** 里取子节点即可（子树已在层级中）。
2. 若脚本是运行时 `addComponent` 到刚实例化的根上，且还要先做额外装配，把「依赖已解析字段」的逻辑放在 **`start`** 或显式 `init()`，避免时序踩空。
3. 路径集中成常量，避免魔法字符串散落：

```ts
const PATH = {
    btn: "Btn",
    total: "Mask/scores/total",
    panel: "Mask/panel",
} as const;
```

### 反例

```ts
@property(Node)
btnNode: Node | null = null; // 禁止：UI 节点靠 Inspector 拖拽
```

---

## 3b. Widget（摘要）

- **可用**：满屏根、顶底栏贴边；边距代替 `SafeArea`
- **不可**：同一节点既挂 `Widget` 又 tween `position` / `scale` / `size`
- **分层**：`container(Widget)` → `panel(动画)` → 内容；可拖/可写回的叶子节点尽量不挂 Widget
- 完整约定：[ADFRAME-COCOS-SETUP.md · H2.1](./ADFRAME-COCOS-SETUP.md#h21-widget-用法硬约定)

---

## 4. 音效用 key：约定路径、缺资源不炸、映射可换皮

### 约定

业务代码 **只发字符串 key**，不直接持有 `AudioClip` 引用（符号库等「跟条目走的专属音」除外，见下）。

```ts
Sfx.play("click");
Sfx.playBgm("bgm");
Sfx.preload(["click", "score_num", "symbol_win"]);
```

资源约定：

```
assets/resources/audio/<key>.mp3   # 或 .ogg
```

例如 key `click` → `resources/audio/click.mp3`。

### 行为要求

| 行为 | 要求 |
|------|------|
| 缺文件 | 警告一次并静默，**不抛错、不卡流程** |
| 同 key 密集触发 | 短节流（如 90ms），同帧多格只响一声 |
| 预载 | 入口或屏 `start` 里 `preload` 常用 key，避免首触延迟 |
| 换皮 | 换同名文件或改「事件 → key」映射表，少改调用点 |

### 两条通道（不要混用职责）

1. **全局 key 通道（Sfx）**  
   UI 点击、BGM、CTA 进场、盘面通用时刻音、倍率升档等。  
   盘面侧用 Binder 把领域事件映射到 key（换风格只改表）。

2. **符号专属 clip 通道**  
   跟某个符号绑定的入场/中奖/消除音，可在符号配置上挂 `AudioClip`，由符号视图直接播。  
   换皮随符号库替换，不走全局 key 表。

### 映射表示意

```ts
// 盘面事件 → key（换皮改这里）
const CELL_SFX = {
    "symbol-win": "symbol_win",
    "symbol-vanish": "symbol_vanish",
};

const TRANSITION_SFX = {
    "enter-table": "board_enter",
    highlight: "win_fanfare",
    // ...
};
```

维护一份 **插槽清单文档**（key、触发时机、触发点），补音频时对照放文件即可，无需改逻辑。

### 为什么对 AI 友好

- Agent 加音效 = 定 key + 放文件 +（可选）改映射一行，不必在 Inspector 拖 clip 到每个调用点。
- 素材可后补：逻辑先上，音频后到，预览不因缺文件中断。
- 搜索 `Sfx.play` / 映射表即可得到全项目音效面。

### 实践要点

1. key 用 `snake_case`，与文件名一致。
2. 新增 UI 音效时：调用处写 key → 资源目录放文件 → 加入 preload 列表 → 更新插槽文档。
3. 浏览器 autoplay：BGM 可先尝试播，首个用户手势再补播（入口统一处理）。
4. 盘面通用音经事件 → key 映射表维护，避免路径字符串散落各处。

### 反例

```ts
// 反例：每个按钮 @property 一个 AudioClip，换皮要拖遍 Inspector
@property(AudioClip)
clickClip: AudioClip | null = null;
```

### 正例

```ts
Sfx.play("click"); // 资源：resources/audio/click.mp3
```

---

## Agent 速查清单

写或改 Cocos 业务时按此自检：

1. **是否改动了 scene？** 若是 → 停手。Scene 只应有 Canvas/Camera 等壳 + `MainEntry`。
2. **业务节点是否都在 prefab 预挂齐？** 路径是否稳定？动态节点是否仅限数据驱动内容？
3. **`MainEntry` 是否在启动时创建了全部会用到的 prefab instance？**（含晚显示的 CTA，先隐藏再 show）
4. **UI 节点是否全部由 `getChildByPath` / `getComponent` 解析？** 是否误用 `@property` 拖 Node？
5. **Widget 是否只做稳态贴边？** 动画目标是否在子节点？可拖叶子是否无 Widget？
6. **音效是否 key 化？** 缺资源是否安全？新 key 是否写入 preload 与插槽清单？

---

## 与 `@property` 的边界（一句话）

> **节点树用路径找；资源与数值配置可以用 `@property` 拖。**

---

## 相关文件（playableAdFramework）

| 主题 | 路径 |
|------|------|
| 场景入口 | `assets/scripts/MainEntry.ts` |
| 主场景壳 | `assets/scenes/Main.scene` |
| UI Prefab | `assets/resources/prefab/MainUI.prefab`、`CTA.prefab` |
| 盘面挂载 | `assets/scripts/editor-app/BoardStage.ts` |
| 音效服务 | `assets/scripts/audio/Sfx.ts` |
| 事件→key | `assets/scripts/audio/BoardAudioBinder.ts` |
| 插槽清单 | `docs/AUDIO-SLOTS.md` |
| **Workspace 工程设置清单** | [`docs/ADFRAME-COCOS-SETUP.md`](./ADFRAME-COCOS-SETUP.md)（含 **Widget 用法 H2.1**） |
