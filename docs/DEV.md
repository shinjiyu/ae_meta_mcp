# ae-meta-mcp 开发文档

> 轻量 After Effects MCP：Cursor Agent 通过 `ae_exec` 在已打开的 AE 中执行 ExtendScript。  
> 心智模型对齐 **Blender MCP**（`execute_blender_code`）与 **CocosMetaMCP**（`cocosmcp_exec`）。

---

## 1. 目标与范围

### 1.1 做什么

| 组件 | 职责 |
|------|------|
| **MCP Server**（Node stdio） | 向 Cursor 暴露 MCP tools |
| **CEP Bridge**（AE 内面板） | localhost HTTP，转发到 ExtendScript |
| **Cursor Skill**（可选） | 约束 Agent 写 ES3 ExtendScript |

### 1.2 MVP 工具（3 个）

| Tool | 说明 |
|------|------|
| `ae_health` | 检查 bridge 是否可达，返回 AE 版本等 |
| `ae_exec` | 执行任意 ExtendScript，返回 JSON |
| `ae_scene_info` | 类似 Blender `get_scene_info`，列出项目/合成/图层摘要 |

### 1.3 不做什么（MVP）

- Recipe / Plugin 分层（cocos-meta-mcp 2.x 那套）
- Python 依赖
- React 大面板 / 内嵌 AI 聊天
- ZXP 签名发布（开发期用 PlayerDebugMode）

---

## 2. 架构

```text
┌─────────────┐   stdio MCP    ┌──────────────────┐   HTTP      ┌─────────────────────┐
│ Cursor Agent│ ◄────────────► │ Node mcp/index   │ ──────────► │ CEP Panel (Express) │
└─────────────┘                │ ae_health/exec   │  :11488     │ CSInterface         │
                               └──────────────────┘             └──────────┬──────────┘
                                                                            │ evalScript
                                                                            ▼
                                                             ┌─────────────────────┐
                                                             │ After Effects 2024  │
                                                             │ ExtendScript (ES3)  │
                                                             └─────────────────────┘
```

### 2.1 与 Blender / Cocos 对照

| | Blender MCP | CocosMetaMCP | ae-meta-mcp |
|--|-------------|--------------|-------------|
| Bridge | Blender addon socket | Creator ext HTTP :3921 | CEP HTTP :11488 |
| Exec tool | `execute_blender_code` | `cocosmcp_exec` | `ae_exec` |
| 脚本 | Python `bpy` | 现代 JS | ExtendScript ES3 |
| 前提 | Blender 开 + addon | Creator 开 + 扩展 | AE 开 + CEP 面板 |

### 2.2 为什么用 CEP，不用 ScriptUI 文件 bridge？

[社区方案 Dakkshin/after-effects-mcp](https://github.com/Dakkshin/after-effects-mcp) 使用 **ScriptUI + 文件轮询**（`~/Documents/ae-mcp-bridge/`），无需 CEP，但：

- 延迟约 2s（面板 poll）
- 常需 queue + `get-results` 两步
- `run-script` 为白名单，**非任意 eval**

本仓库选 **HTTP 同步 + ae_exec**，与 Blender/Cocos 体验一致。若 CEP 安装失败，可退化为 ScriptUI 文件 bridge（见 [§14 备选方案](#14-备选方案scriptui--文件-bridge)）。

---

## 3. 与 Dakkshin/after-effects-mcp 对比

| 维度 | [Dakkshin](https://github.com/Dakkshin/after-effects-mcp) | ae-meta-mcp |
|------|-----------------------------------------------------------|-------------|
| Bridge | 文件轮询 | HTTP 同步 |
| AE 插件 | ScriptUI `.jsx`（~1771 行） | CEP + Express（~300 行） |
| 安装 | `Program Files/.../ScriptUI Panels/`（管理员） | `%AppData%/CEP/extensions/` + PlayerDebugMode |
| Tool 数量 | 15+ typed + get-results | 3 |
| 任意代码 | ❌ 白名单 ~20 命令 | ✅ `ae_exec` |
| 延迟 | ~2s poll | 即时 |
| 像 Blender MCP | 较弱 | ✅ |

**Dakkshin 更适合**：开箱 typed tools、不想碰 CEP。  
**ae-meta-mcp 更适合**：`ae_exec` 任意脚本、同步返回、极简 MCP。

---

## 4. 仓库结构

```text
ae_meta_mcp/
├── package.json
├── README.md
├── docs/
│   └── DEV.md                 # 本文档
├── mcp/
│   ├── index.mjs              # MCP 入口，stdio transport
│   ├── context.mjs            # AE_BRIDGE、fetchBridge()
│   ├── core.mjs               # ae_health、ae_exec、ae_scene_info
│   └── bridge-client.mjs      # POST /exec 封装
├── plugin/
│   ├── CSXS/
│   │   └── manifest.xml       # CEP 11，HostList 含 AEFT 24.x
│   ├── client/
│   │   ├── index.html         # 状态页
│   │   ├── main.js            # 加载 CSInterface，启动 host
│   │   └── CSInterface.js     # Adobe 官方 v11（保留许可声明）
│   ├── host/
│   │   └── server.mjs         # Express：/health、/exec
│   └── jsx/
│       └── scene-info.jsx     # ae_scene_info 内置脚本（可选）
├── scripts/
│   ├── install-cep.ps1        # 复制 plugin → CEP extensions
│   ├── enable-debug-mode.ps1  # PlayerDebugMode 注册表
│   └── setup-cursor.mjs       # 输出 mcp.json 片段
├── skills/
│   └── ae-extendscript/
│       └── SKILL.md           # Agent 用：ES3 + 对象模型
└── examples/
    └── cursor-mcp.json
```

---

## 5. 环境要求

| 项 | 要求 |
|----|------|
| OS | Windows 10/11（文档以 Windows 为主） |
| After Effects | 2024 (24.x) |
| Node.js | >= 18 |
| CEP | 11（AE 2024 内置） |

### 5.1 AE 一次性设置

**Edit → Preferences → Scripting & Expressions**

- 勾选 **Allow Scripts to Write Files and Access Network**

### 5.2 CEP 开发模式（未签名扩展）

PowerShell：

```powershell
New-Item -Path "HKCU:\Software\Adobe\CSXS.11" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.11" -Name "PlayerDebugMode" -Value "1"
```

---

## 6. HTTP Bridge 协议

默认 base URL：`http://127.0.0.1:11488`  
环境变量：`AE_MCP_BRIDGE` 或 `AE_MCP_HTTP_URL`

### 6.1 `GET /health`

**Response 200**

```json
{
  "ok": true,
  "bridge": "ae-meta-mcp",
  "version": "0.1.0",
  "port": 11488,
  "aeVersion": "24.0.0",
  "projectPath": "C:/Projects/demo.aep",
  "projectName": "demo.aep"
}
```

`aeVersion` / `projectPath` 通过 `evalScript('app.version')` 等获取；失败时 bridge 仍返回 `ok: true`，字段为 `null`。

### 6.2 `POST /exec`

**Request**

```json
{
  "mode": "eval",
  "code": "app.project.activeItem ? app.project.activeItem.name : null"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | `"eval"` | MVP 仅支持 eval |
| `code` | string | ExtendScript 表达式或 IIFE 体 |

**Response 200（成功）**

```json
{
  "ok": true,
  "result": "My Comp"
}
```

**Response 200（ExtendScript 报错）**

```json
{
  "ok": false,
  "error": "Error: ...",
  "line": 3
}
```

### 6.3 大结果落盘（Phase 2）

当返回 JSON 超过 ~32KB 时，jsx 写临时文件：

```javascript
var f = new File(Folder.temp.fsName + "/ae-meta-mcp-result.json");
f.open("w"); f.write(JSON.stringify(data)); f.close();
"__FILE__:" + f.fsName;
```

CEP host 检测前缀 `__FILE__:`，读文件内容作为 `result` 返回。

---

## 7. CEP 实现要点

### 7.1 CEP 是什么？

**CEP（Common Extensibility Platform）** = Adobe 在 AE/PS/PR 里嵌入 HTML/JS 面板的框架。面板内可跑 Node，因此能起 Express，再通过 `CSInterface.evalScript()` 把代码送进 AE。

用户只需：

1. 打开 `Window → Extensions → ae-meta-mcp`
2. 面板保持运行
3. 勾选 AE 偏好里的 Allow Scripts to Write Files

### 7.2 `manifest.xml` 骨架

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="11.0" ExtensionBundleId="com.aemeta.mcp"
  ExtensionBundleVersion="0.1.0" ExtensionBundleName="ae-meta-mcp">
  <ExtensionList>
    <Extension Id="com.aemeta.mcp.panel" Version="0.1.0"/>
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="AEFT" Version="[24.0,99.9]"/>
    </HostList>
    <LocaleList><Locale Code="All"/></LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="11.0"/>
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.aemeta.mcp.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./client/index.html</MainPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--mixed-context</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle><AutoVisible>true</AutoVisible></Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>ae-meta-mcp</Menu>
          <Geometry><Size><Width>320</Width><Height>120</Height></Size></Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

### 7.3 evalScript 包装

```javascript
function wrapEvalCode(userCode) {
  var escaped = userCode
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n");
  return (
    "(function(){ try {" +
    "  var __fn = new Function(\"" + escaped + "\");" +
    "  var __r = __fn();" +
    "  return JSON.stringify({ ok: true, result: __r });" +
    "} catch(e) { return JSON.stringify({ ok: false, error: String(e) }); }})()"
  );
}
```

> 更安全备选：把 code 写入临时 `.jsx`，用 `$.evalFile(path)` 执行。

### 7.4 evalScript 异步封装

```javascript
function evalScriptAsync(csInterface, script) {
  return new Promise(function (resolve, reject) {
    csInterface.evalScript(script, function (result) {
      if (result === "EvalScript error.") {
        reject(new Error("EvalScript error"));
        return;
      }
      resolve(result);
    });
  });
}
```

---

## 8. MCP Server 实现

### 8.1 依赖 `package.json`

```json
{
  "name": "ae-meta-mcp",
  "version": "0.1.0",
  "type": "module",
  "main": "./mcp/index.mjs",
  "bin": { "ae-meta-mcp": "./mcp/index.mjs" },
  "engines": { "node": ">=18" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^3.24.2"
  }
}
```

### 8.2 `context.mjs`（参考 cocos-meta-mcp）

```javascript
export const AE_BRIDGE =
  process.env.AE_MCP_BRIDGE ||
  process.env.AE_MCP_HTTP_URL ||
  "http://127.0.0.1:11488";

export async function fetchBridge(pathname, method = "GET", jsonBody) {
  const url = `${AE_BRIDGE.replace(/\/$/, "")}${pathname}`;
  const init = { method };
  if (jsonBody !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(jsonBody);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, ok: res.ok, body };
}
```

### 8.3 Tool 定义

#### `ae_health`

- 调用 `GET /health`
- bridge 不可达 → `isError: true`，提示打开 AE 与面板

#### `ae_exec`

```typescript
{ code: string }  // ExtendScript，ES3
```

- 调用 `POST /exec` `{ mode: "eval", code }`
- description 强调：**禁止 let/const、箭头函数、模板字符串、async/await**

#### `ae_scene_info`

内置 jsx 摘要脚本（见 §9.2），MCP 内部调用同一 `/exec` 路径。

---

## 9. ExtendScript 参考

### 9.1 ES3 约束（Agent Skill 摘要）

| 禁止 | 改用 |
|------|------|
| `let` / `const` | `var` |
| 箭头函数 `=>` | `function() {}` |
| 模板字符串 | 字符串拼接 |
| `for (x of arr)` | 索引 `for` 循环 |
| `class` | 构造函数 + prototype |

### 9.2 对象模型

```text
app
 └── project (Project)
      ├── item(i) → CompItem | FootageItem | FolderItem ...
      └── activeItem → 当前 CompItem
CompItem
 └── layer(i) → AVLayer | CameraLayer | LightLayer ...
AVLayer
 └── property(name|matchName) → Property
```

官方文档：<https://ae-scripting.docsforadobe.dev/>

### 9.3 `ae_scene_info` 脚本

```javascript
(function () {
  var out = {
    aeVersion: app.version,
    project: app.project.file ? app.project.file.fsName : null,
    numItems: app.project.numItems,
    comps: [],
    activeComp: null
  };
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof CompItem) {
      out.comps.push({
        name: item.name,
        width: item.width,
        height: item.height,
        duration: item.duration,
        numLayers: item.numLayers
      });
    }
  }
  var active = app.project.activeItem;
  if (active instanceof CompItem) {
    out.activeComp = { name: active.name, numLayers: active.numLayers, layers: [] };
    for (var j = 1; j <= active.numLayers; j++) {
      var lyr = active.layer(j);
      out.activeComp.layers.push({ index: j, name: lyr.name, enabled: lyr.enabled });
    }
  }
  return out;
})()
```

### 9.4 常用 ae_exec 示例

**创建合成**

```javascript
var c = app.project.items.addComp("MCP Test", 1920, 1080, 1, 10, 30);
({ name: c.name, width: c.width, height: c.height })
```

**添加文字层**

```javascript
var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("No active composition");
var layer = comp.layers.addText("Hello MCP");
layer.property("Position").setValue([960, 540]);
({ layerName: layer.name, index: layer.index })
```

---

## 10. Cursor 配置

`~/.cursor/mcp.json` 或项目 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "ae-meta-mcp": {
      "command": "node",
      "args": ["D:/workspace/ae_meta_mcp/mcp/index.mjs"],
      "env": {
        "AE_MCP_BRIDGE": "http://127.0.0.1:11488"
      }
    }
  }
}
```

配置后：**Cursor MCP 设置里关闭再打开** `ae-meta-mcp`。

---

## 11. 安装流程（Windows）

```powershell
cd D:\workspace\ae_meta_mcp
npm install

# 开 CEP 调试
.\scripts\enable-debug-mode.ps1

# 安装 CEP 面板
.\scripts\install-cep.ps1

# 重启 After Effects
# Window → Extensions → ae-meta-mcp
# 配置 Cursor mcp.json，Reload MCP
```

### 11.1 `install-cep.ps1` 逻辑

```powershell
$src = Join-Path $PSScriptRoot "..\plugin"
$dst = "$env:APPDATA\Adobe\CEP\extensions\ae-meta-mcp"
Remove-Item -Recurse -Force $dst -ErrorAction SilentlyContinue
Copy-Item -Recurse $src $dst
Write-Host "Installed to $dst"
```

扩展根目录需含 `CSXS/manifest.xml`。

---

## 12. 开发阶段

### Phase 1 — Bridge 跑通

- [ ] CEP manifest + 面板能加载
- [ ] Express `/health` 返回 200
- [ ] `evalScript('app.version')` 成功
- [ ] Node `fetch('http://127.0.0.1:11488/health')` 通

### Phase 2 — MCP 接通

- [ ] `ae_health` 在 Cursor 可用
- [ ] `ae_exec` 执行 `app.project.activeItem.name`
- [ ] bridge 关闭时明确报错

### Phase 3 — 体验

- [ ] `ae_scene_info`
- [ ] 大结果落盘
- [ ] `skills/ae-extendscript/SKILL.md`
- [ ] README 故障排除

### Phase 4 — 可选

- [ ] `ae_preview_frame`（`comp.saveFrameToPng`）
- [ ] exec audit jsonl

---

## 13. 验收用例

1. **ae_health** — 返回 `ok: true`，含 `aeVersion`
2. **创建合成** — `ae_exec` 创建 `MCP Test` 1920×1080
3. **ae_scene_info** — 列表含 `MCP Test`
4. **关面板再 exec** — 报错含 bridge unreachable

---

## 14. 故障排除

| 现象 | 处理 |
|------|------|
| Extensions 菜单里没有 ae-meta-mcp | PlayerDebugMode；manifest HostList；重启 AE |
| `/health` connection refused | 面板未打开；端口被占 |
| `EvalScript error` | jsx 非 ES3；手动 Run Script File 测试 |
| 返回空 | ExtendScript 最后一行需 `return` 或表达式 |
| 写文件失败 | 偏好未勾选 Allow Scripts to Write Files |
| MCP Tool not found | Cursor Reload MCP；检查 args 路径 |

---

## 15. 备选方案：ScriptUI + 文件 bridge

若 CEP 安装持续失败，可借鉴 [Dakkshin/after-effects-mcp](https://github.com/Dakkshin/after-effects-mcp)：

- 通信目录：`~/Documents/ae-mcp-bridge/`
- 文件：`ae_command.json` / `ae_mcp_result.json`
- AE 侧：ScriptUI 面板 poll（`app.scheduleTask`）

与 Dakkshin 不同之处：MCP 仍保持 **`ae_exec` 任意脚本** + **同步 wait**（poll result 文件直到更新），不必维护 1771 行预定义 handler monolith。

---

## 16. 安全说明

- Bridge 仅监听 `127.0.0.1`
- `ae_exec` 等同本机 AE 完全控制 — 仅本地开发使用

---

## 17. 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `AE_MCP_BRIDGE` | `http://127.0.0.1:11488` | MCP → bridge URL |
| `AE_MCP_PORT` | `11488` | CEP host 监听端口 |

---

## 18. 参考项目

| 项目 | 用途 |
|------|------|
| [cocos-meta-mcp](https://github.com/shinjiyu/cocos_meta_mcp) | MCP + HTTP bridge 结构 |
| [Dakkshin/after-effects-mcp](https://github.com/Dakkshin/after-effects-mcp) | ScriptUI 文件 bridge 参考 |
| [JUNKDOGE-JOE/ae-mcp](https://github.com/JUNKDOGE-JOE/after-effects-mcp) | CEP HTTP bridge 参考 |
| [aedev-tools/adobe-agent-skills](https://github.com/aedev-tools/adobe-agent-skills) | ExtendScript Skill |
| [AE Scripting Guide](https://ae-scripting.docsforadobe.dev/) | 官方 API |
