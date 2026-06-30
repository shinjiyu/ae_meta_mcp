---
name: ae-extendscript
description: Write After Effects ExtendScript (ES3) for ae-meta-mcp's ae_exec tool. Use whenever generating code passed to ae_exec / ae_scene_info, or when scripting AE comps, layers, properties, keyframes, render queue.
---

# ae-extendscript

Code passed to `ae_exec` runs in After Effects' **ExtendScript (ES3)** engine, not modern JS.
The final expression (or a `return`) is serialized to JSON and returned by the tool.

## Hard ES3 constraints

| Forbidden | Use instead |
|-----------|-------------|
| `let` / `const` | `var` |
| arrow functions `=>` | `function () {}` |
| template literals `` `${x}` `` | string concatenation `"" + x` |
| `for (x of arr)` | indexed `for (var i = 0; ...)` |
| `class` | constructor function + `prototype` |
| `async` / `await` / Promise | synchronous code only |
| `JSON` is available | (AE 2024 has `JSON`; otherwise build strings) |

## Return values

- End with a bare expression OR `return`. The wrapper serializes it via `JSON.stringify`.
- AE objects (CompItem, Layer, Property) are NOT JSON-serializable directly — return plain
  objects of primitives.

```javascript
var c = app.project.activeItem;
({ name: c.name, w: c.width, h: c.height }) // good: plain object
```

- Throw to signal errors; they come back as `{ ok: false, error }`.

```javascript
var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("No active composition");
```

## Object model

```text
app
 └── project (Project)
      ├── item(i)        -> CompItem | FootageItem | FolderItem
      ├── items.addComp(name, w, h, pixelAspect, duration, frameRate)
      └── activeItem     -> current CompItem
CompItem
 ├── layer(i)            -> AVLayer | TextLayer | CameraLayer | LightLayer | ShapeLayer
 ├── layers.addText(str)
 ├── layers.addSolid(color, name, w, h, pixelAspect)
 └── numLayers, width, height, duration, frameRate
Layer
 └── property(nameOrMatchName) -> Property
Property
 ├── setValue(value)
 ├── setValueAtTime(t, value)  // adds a keyframe
 └── value
```

Official API: https://ae-scripting.docsforadobe.dev/

## Recipes

### Scene summary
```javascript
({
  version: app.version,
  project: app.project.file ? app.project.file.name : null,
  numItems: app.project.numItems
})
```

### Create a comp
```javascript
var c = app.project.items.addComp("MCP Test", 1920, 1080, 1, 10, 30);
({ name: c.name, width: c.width, height: c.height })
```

### Add a text layer, centered
```javascript
var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("No active composition");
var layer = comp.layers.addText("Hello MCP");
layer.property("Position").setValue([comp.width / 2, comp.height / 2]);
({ layerName: layer.name, index: layer.index })
```

### Add a solid + opacity keyframes
```javascript
var comp = app.project.activeItem;
var solid = comp.layers.addSolid([1, 0, 0], "Red", comp.width, comp.height, 1);
var op = solid.property("Opacity");
op.setValueAtTime(0, 0);
op.setValueAtTime(1, 100);
({ name: solid.name, keys: op.numKeys })
```

### Undo-group multiple edits
```javascript
app.beginUndoGroup("MCP batch");
try {
  var comp = app.project.items.addComp("Batch", 1280, 720, 1, 5, 30);
  comp.layers.addText("A");
  comp.layers.addText("B");
} finally {
  app.endUndoGroup();
}
({ ok: true })
```

## Gotchas

- `app.project.activeItem` is `null` if no comp/footage is selected or open.
- Color values are `[r, g, b]` in 0..1, not 0..255.
- Time is in **seconds**, not frames. Frame -> time: `frame / comp.frameRate`.
- Wrap multi-step mutations in `app.beginUndoGroup` / `app.endUndoGroup`.
- Writing files requires Preferences -> Scripting & Expressions ->
  "Allow Scripts to Write Files and Access Network".
