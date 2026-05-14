# Mock Vite Migration

模拟 `local.so.com` 项目架构（`_loader` + PHP 模板 + Rollup 多入口产物），用于验证从 Rollup/IIFE 迁移到 Vite 的可行路径。

## 项目结构

```text
mock-vite-migration/
  pages/                         # 模拟 PHP 模板的静态 HTML
    home.html
    result.html
  pages-rendered/                # build 后由 mock 脚本生成，模拟 PHP 注入 CSS link（git ignored）
  dev/                           # Vite 源码入口
    home/searchbox/index.js
    home/skin/index.js
    result/ai-searchbox/index.js
    homeAI/main.js
  resource/js/common/
    _loader_res.js               # 原 loader 基础上改造 modern/legacy 分流
    _loader_dev_shim.js          # dev 阶段覆盖 _loader.add/use，接入 Vite HMR
  resource/js/dist-vite/         # Vite 产物（git ignored）
  rollup/                        # 原 Rollup 构建配置，保留作基线对比
  tests/                         # Vitest + jsdom 单测
  scripts/render-mock-pages.mjs  # mock PHP：读取 manifest 注入 CSS link
  MIGRATION_COMPATIBILITY_CHECKLIST.md
```

## 阶段状态

- 阶段一：mock 项目骨架 + Rollup 多入口构建跑通。
- 阶段二：Vite dev/HMR + 生产 modern/legacy 双发 + CSS/manifest 验证已完成。
- 阶段三：在原项目落地，不在 mock 范围内；交接清单见 `MIGRATION_COMPATIBILITY_CHECKLIST.md`。

## 阶段二目标与最终方案

阶段二最初目标是验证 Vite 能否替代原 Rollup 产物，同时尽量保留 PHP 模板里的 `_loader.add` / `_loader.use` 调用形态。

最终方案不是“继续打 IIFE 替换 Rollup”，而是提前验证阶段三目标态：

- Dev：保留 `_loader_res.js`，额外加载 `_loader_dev_shim.js`。shim 拦截业务模块，转为 Vite 动态 `import()`，获得 HMR；全局库仍回交原 `_loader`。
- Prod modern：业务模块产物为 ESM，`_loader_res.js` 通过动态 `import()` 加载。
- Prod legacy：`@vitejs/plugin-legacy` 生成 SystemJS 产物和 polyfills，`_loader_res.js` 通过 `System.import()` 加载 `*-legacy.js`。
- Vue 不再走 CDN external，纳入 Vite 依赖图，由 Vite 抽 shared vendor chunk。
- CSS 不进入 `_loader_res.js` 职责，生产由模板层/PHP 根据 manifest 输出 `<link>`。
- 全局库（jquery、require、solib-*、SDK 等）不强行迁入 Vite，继续由全局脚本或瘦身 `_loader` 管理。

## 阶段二步骤与提交记录

| 步骤 | 日期 | Commit | 内容 | 验收/结论 |
| --- | --- | --- | --- | --- |
| Step 1 | 2026-05-12 | `2ee8d0e` | 引入 Vite、`@vitejs/plugin-vue`，跑通单模块 `home/searchbox` HMR。 | 浏览器访问 dev 页面，修改 Vue 组件后无刷新更新，状态保留。 |
| Step 2 | 2026-05-12 | `37ca9e8`（记录） | 扩展多入口扫描：`home/*`、`result/*`、`homeAI/main.js`。 | Vite build 能识别 4 个入口；产物形态偏差留到 Step 6 修正。 |
| Step 3-5 | 2026-05-13 | `10e6fb0` | 实现 `_loader_dev_shim.js`；HTML 通过 `<!--LOADER-->` 注入 dev shim；完整 dev 流程验证。 | `pages/home.html`、`pages/result.html` 业务模块均可通过 shim 加载，HMR 可用。 |
| Step 6 方案 | 2026-05-13 | `e484243` | 确定生产不走全量 IIFE，改为 Modern ESM + Legacy SystemJS 双发。 | Vue 纳入依赖图，业务模块进入 Vite code-splitting 体系。 |
| Step 6a-6b | 2026-05-13 | `630d1f9` | 接入 `@vitejs/plugin-legacy`，输出到 `resource/js/dist-vite`，配置 modern/legacy/vendor 产物路径。 | 4 个入口生成 modern + legacy 产物，vendor chunk 共享。 |
| Step 6c | 2026-05-13 | `65b1f40` | 改造 `_loader_res.js`：业务模块表、modern/legacy URL、`use` 分流；HTML 切到 `dist-vite`。 | 业务模块不再进入原 `modules` 表，全局库仍走原 loader。 |
| 测试体系 | 2026-05-13 | `3045c71` | 引入 Vitest/jsdom，给 `_loader_res.js` 和 dev shim 加测试钩子和单测。 | 覆盖 modern、legacy、dev shim、biz+lib 混合分流。 |
| Step 6d | 2026-05-13 | `24e2942` | HTML 静态注入 `polyfills-legacy.js`；修复动态 import base URL 漂移；增加 `?forceLegacy=1` 调试开关。 | modern/legacy URL 统一绝对化，legacy 可在现代浏览器强制验证。 |
| Step 6e | 2026-05-13 | `40ba8dc`（记录） | 浏览器实测 dev、prod modern、prod legacy 三条路径。 | 三条链路均通过。 |
| URL 绝对化整理 | 2026-05-14 | `db5d8df` | 将 `toAbsoluteUrl` 逻辑收敛到动态 import 路径。 | 减少调用方重复处理，保持 URL 解析一致。 |
| Step 6f | 2026-05-14 | `7c8d709` | 开启 `build.manifest`；新增 `scripts/render-mock-pages.mjs`；生成 `pages-rendered/*.html` 注入 CSS link。 | `home` 注入 3 个 CSS link，`result` 注入 1 个 CSS link；CSS 由模板层负责的方向成立。 |
| Step 6g | 2026-05-14 | `022f149` | 输出 `MIGRATION_COMPATIBILITY_CHECKLIST.md`。 | 阶段三迁移清单完成，阶段二闭环。 |

补充提交：

- `668baef`、`93a43d6`：同步阶段进度文档。
- `da5c0e3`、`40ba8dc`：阶段记录更新。

## 当前可用命令

```bash
npm run dev:vite
```

启动 Vite dev server，访问：

```text
http://localhost:5173/pages/home.html
http://localhost:5173/pages/result.html
```

```bash
npm run build:vite
```

执行 Vite build，并运行 `scripts/render-mock-pages.mjs` 生成 `pages-rendered/*.html`。

```bash
npm run serve
```

从项目根启动静态服务，访问：

```text
http://localhost:3000/pages-rendered/home.html
http://localhost:3000/pages-rendered/home.html?forceLegacy=1
http://localhost:3000/pages-rendered/result.html
```

```bash
npm run test:run
```

运行 Vitest 单测。阶段二完成时单测为 23/23 通过。

## 阶段二验收结果

- Dev HMR：通过。业务模块由 `_loader_dev_shim.js` 转为 Vite 动态 import，Vue SFC HMR 生效。
- Prod modern：通过。业务 entry、modern vendor chunk、CSS 均可加载。
- Prod legacy：通过。`?forceLegacy=1` 下加载 `polyfills-legacy.js`、legacy entry、legacy vendor chunk、CSS。
- 单测：通过。`_loader_res.js` / `_loader_dev_shim.js` 的核心分流逻辑有断言保护。
- CSS：通过。manifest 的 modern entry 包含 `css: [...]`，mock PHP 脚本能生成 CSS link；modern/legacy 共用同一份 CSS。
- 阶段三交付物：完成。见 `MIGRATION_COMPATIBILITY_CHECKLIST.md`。

## 关键难点与处理方式

### 1. 普通 script 中隐藏动态 import

`_loader_dev_shim.js` 是普通 `<script>`，不能写字面量 `import()`。否则 Vite 会静态分析并把文件当 ESM 改写，导致浏览器报：

```text
Cannot use import statement outside a module
```

处理方式：

```js
var dynamicImport = new Function('url', 'return import(url)')
```

不要用 `/* @vite-ignore */` 解决这个问题；它只能忽略路径分析，不能阻止 Vite 把文件识别成 ESM。

### 2. `new Function(... import ...)` 的 base URL 漂移

动态 import 的相对路径 base 是定义该 Function 的脚本 URL，不是调用处的 `document.baseURI`。在 `_loader_res.js` 里传入 `../resource/js/dist-vite/...` 时，会被错误解析到 `/resource/js/resource/js/dist-vite/...`。

处理方式：进入 `dynamicImport` 或 `System.import` 前统一绝对化。

```js
function toAbsoluteUrl(url) {
  return new URL(url, document.baseURI).href
}
```

阶段三规则：跨脚本传递 URL 时，尤其经过 eval/new Function/异步边界，必须尽早归一化为绝对 URL。

### 3. dev shim 的 dist 到 dev 映射

原模板传入的可能是：

- `../resource/js/dist/...`
- `/resource/js/dist/...`
- `../resource/js/dist-vite/...`
- 未来 CDN 绝对 URL

正则不能锁死开头 `/`。当前 mock 规则：

```text
resource/js/dist(?:-vite)?/<area>/<name>.js -> /dev/<area>/<name>/index.js
homeAI/<*>.js -> /dev/homeAI/main.js
```

### 4. 业务模块与全局库分层

阶段二最重要的迁移判断是：不要把所有东西都塞进 Vite。

- 业务模块：进入 Vite，享受 HMR、tree-shaking、code-splitting、modern/legacy 双发。
- 全局库：继续由原 `_loader` 或 `<script>` 管理，维持 `window.jQuery`、`window.soLib` 等运行时契约。

dev shim 和 prod `_loader_res.js` 都使用同一个思路：

```js
bizNames -> Vite import / System.import
libNames -> 原 _loader
```

### 5. plugin-legacy 与 manifest

`@vitejs/plugin-legacy` 负责 legacy SystemJS 产物和 polyfills，但其 manifest 形态需要阶段三继续实测。

阶段二只轻量验证了：

- modern entry 有 `css: [...]`
- CSS 可由模板层输出 `<link>`
- modern/legacy JS 可共用 CSS

阶段二没有做：

- 生产 hash manifest 查表
- legacy/polyfills manifest 合并
- `_loader.add(name, logicalEntry)` 查 manifest

这些已明确放到阶段三。

## 阶段三交接要点

阶段三建议以 `MIGRATION_COMPATIBILITY_CHECKLIST.md` 为准。核心方向：

- 生产恢复 hash 文件名，以 manifest 作为 URL 唯一来源。
- PHP 注入统一 manifest。
- `_loader.add(name, logicalEntry)` 支持逻辑入口查表。
- PHP 根据 manifest 输出 CSS `<link>`，并去重。
- `_loader_res.js` 只管 JS 业务模块分流和全局库加载，不接管 CSS。
- 全局库不进入 Vite 依赖图，除非有明确收益和兼容策略。

## 维护注意事项

- `_loader_res.js` 是 CRLF 行尾；编辑时注意不要混入局部 LF。
- `_loader_dev_shim.js` 是 LF。
- 测试钩子受 `window._LOADER_TEST` 门控，生产默认不执行。
- `?forceLegacy=1` 是 mock 调试开关，生产是否保留需单独决定。
- `npm run serve` 使用项目根作为静态根；验证页面路径是 `/pages/...` 或 `/pages-rendered/...`。
- 涉及 npm install、commit、删除文件等动作前先确认。
- 用户偏好中文 commit message，按阶段/步骤拆分提交。
