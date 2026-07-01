# Lottie 预览页

Bodymovin 导出的 `comp_1.json` 本地预览。

## 文件

- `index.html` — 开发预览（需 HTTP 服务）
- `playable-ad.html` — **单文件试玩广告**（Lottie + WebP Slot，可直接双击打开）
- `comp_1.json` — 从 AE 工程导出复制而来

## 试玩广告（推荐）

已打包为单 HTML，内嵌 Lottie、动画 WebP、`super_html` 试玩 CTA，**无需启动服务器**：

```
D:\workspace\ae_meta_mcp\examples\lottie-preview\playable-ad.html
```

重新打包：

```powershell
npm run build:playable
```

WebP 源：`D:\workspace\HWH5SuperPlay21_2\output\seth_male_1s\anim.webp`

## 开发预览（需 HTTP）

浏览器不能直接 `file://` 打开 JSON，需要本地 HTTP：

```powershell
cd D:\workspace\ae_meta_mcp\examples\lottie-preview
python -m http.server 18080
```

浏览器访问：<http://127.0.0.1:18080/>

## 更新 JSON

重新导出后复制：

```powershell
Copy-Item "C:\Users\yuzhenyu\Documents\export\lottie\comp_1.json" ".\comp_1.json" -Force
```
