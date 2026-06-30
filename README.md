# ae-meta-mcp

Lightweight **After Effects MCP**: a Cursor Agent runs ExtendScript inside a *running*
After Effects via a single `ae_exec` tool — same mental model as Blender MCP
(`execute_blender_code`) and CocosMetaMCP (`cocosmcp_exec`).

```text
Cursor Agent  ──stdio MCP──▶  Node MCP server  ──HTTP :11488──▶  CEP panel (Express-free)  ──evalScript──▶  AE 2024
```

## Tools (MVP)

| Tool | Description |
|------|-------------|
| `ae_health` | Check the bridge is reachable; returns AE version + project info |
| `ae_exec` | Run arbitrary ExtendScript (ES3), returns JSON |
| `ae_scene_info` | Summarize project / comps / active comp layers |

## Requirements

- Windows 10/11
- After Effects 2024 (24.x), CEP 11
- Node.js >= 18

## Install (Windows)

```powershell
cd D:\workspace\ae_meta_mcp
npm install

# 1. Enable unsigned CEP extensions (PlayerDebugMode)
.\scripts\enable-debug-mode.ps1

# 2. Copy the panel into the CEP extensions folder
.\scripts\install-cep.ps1

# 3. Restart After Effects, then: Window -> Extensions -> ae-meta-mcp (keep it open)
```

In AE: **Edit → Preferences → Scripting & Expressions →** check
**Allow Scripts to Write Files and Access Network**.

## Wire up Cursor

Generate a snippet for your checkout:

```powershell
npm run setup:cursor
```

Paste it into `~/.cursor/mcp.json` (or project `.cursor/mcp.json`), then toggle
`ae-meta-mcp` off/on in Cursor's MCP settings. See `examples/cursor-mcp.json`.

## Verify

1. `ae_health` → `{ ok: true, aeVersion: "24.x" }`
2. `ae_exec` create a comp:
   ```javascript
   var c = app.project.items.addComp("MCP Test", 1920, 1080, 1, 10, 30);
   ({ name: c.name, width: c.width, height: c.height })
   ```
3. `ae_scene_info` → list includes `MCP Test`
4. Close the panel, run `ae_exec` again → bridge-unreachable error

## Writing ExtendScript

`ae_exec` runs **ES3** (no `let`/`const`, arrow functions, template literals, etc.).
See `skills/ae-extendscript/SKILL.md` for constraints, the object model, and recipes.

## Layout

```text
mcp/      Node stdio MCP server (index, core, context, bridge-client)
plugin/   CEP panel (manifest, client UI, Node http host, jsx)
scripts/  install-cep.ps1, enable-debug-mode.ps1, setup-cursor.mjs
skills/   ae-extendscript agent skill
examples/ cursor-mcp.json
docs/     DEV.md (design doc)
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No ae-meta-mcp under Extensions | Run `enable-debug-mode.ps1`; check manifest HostList; restart AE |
| `/health` connection refused | Panel not open; port in use |
| `EvalScript error` | Script isn't ES3; test via File → Scripts → Run Script File |
| Empty result | Last line must be an expression or `return` |
| Write-file fails | Enable "Allow Scripts to Write Files and Access Network" |
| MCP tool not found | Reload MCP in Cursor; check the `args` path |

## Security

The bridge binds `127.0.0.1` only. `ae_exec` is full local control of AE —
use for local development only.

## License

MIT
