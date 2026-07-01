# runtime/anim — IAnim Phase 1 + dropOut

Port of **illyasviel-candy** `common/anim` Phase 1 (contract + compose + queue).

No Cocos, no Playfield. `delay` uses `setTimeout`; cancel clears the timer.

## Load order (browser)

```html
<script src="/runtime/config.js"></script>
<script src="/runtime/anim/IAnim.js"></script>
<script src="/runtime/anim/Anim.js"></script>
<script src="/runtime/anim/compose.js"></script>
<script src="/runtime/anim/SerialAnimQueue.js"></script>
<script src="/runtime/anim/index.js"></script>
<script src="/runtime/anim/dropOut.js"></script>
```

Global: `SlotBoardAnim` — compose helpers + `buildColumnDropOutAnim`, `buildBoardDropOutAnim`, `buildDropOutAnim`, `summarizeDropOut`.

## dropOut API

```javascript
// 整盘（默认）
SlotBoardAnim.buildDropOutAnim({
  scope: "board",
  config,               // runtime config + grid
  cols: [0, 1, 2],      // 或 'all'
  colStagger: 0.08,
  colOrder: "leftFirst", // leftFirst | rightFirst | simultaneous
  fallDuration: 0.4,
  rowStagger: 0.1,
  order: "bottomFirst",
  extraFallPx: 48,
  easing: "easeInQuad",
  fadeOut: true,
  onUpdate(col, row, dy, alpha) {},
});

// 单列调试
SlotBoardAnim.buildDropOutAnim({ scope: "column", col: 0, config, onUpdate });
```

IAnim 结构：`par(seq(colDelay, par(row tweens…))…)`。

## Test

```bash
npm run test:slot-board-anim
```
