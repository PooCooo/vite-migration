# Mock Vite Migration

模拟 `local.so.com` 项目架构（`_loader` + PHP 模板 + Rollup 多入口产物），用于验证从 Rollup/IIFE 迁移到 Vite 的可行路径。

## 项目结构

```text
mock-vite-migration/
  pages/                         # 模拟 PHP 模板的静态 HTML
    home.html
    result.html
  pages-php/                     # 真 PHP 模板：与 pages/ 一一对应，CSS link 由 PHP 实时注入
    home.php
    result.php
  lib/manifest.php               # PHP 端 manifest 读取：CSS link 渲染 + 业务 entry URL 查表
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
  scripts/render-mock-pages.mjs  # Node mock：读取 manifest 写入 pages-rendered/*.html（与 PHP 链路并行的静态基线）
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

## Docker 工作流（无需本机安装 PHP / Node）

镜像真实项目的 `docker + make` 模式：PHP 和 Vite dev server 各跑一个容器，宿主机不需要安装 PHP。

```bash
make dev          # PHP (MOCK_DEV=1, :8000) + Vite dev server (:5173) 双容器并起
make dev-build    # 同上，但先重新构建镜像（依赖变更后用）
make build        # Vite 生产构建（产物写回宿主机 resource/js/dist-vite/）
make test         # 运行单测（容器内 vitest run）
make serve        # 生产预览：PHP 服务 prod 构建产物，无 MOCK_DEV（需先 make build）
make down         # 停止 dev 容器
make clean        # 清理容器 + 命名卷（重置 node_modules 时用）
```

首次启动会拉取 `php:8.2-cli` 镜像并构建 `Dockerfile.vite`（含 `npm install`），耗时约 1–2 分钟；后续启动直接复用。

**Dev 访问入口**（`make dev` 后）：

```text
http://localhost:8000/pages-php/home.php    # PHP 模板 + Vite HMR
http://localhost:8000/pages-php/result.php
http://localhost:5173/pages/home.html       # 静态 HTML 直连 Vite（备用）
```

**关键设计**：

- `node_modules` 装进 Docker 命名卷（`node_modules` volume），与宿主机隔离，避免 macOS/Linux 二进制冲突。
- `vite.config.js` 加 `host: true`，Vite 在容器内绑定 `0.0.0.0:5173`；`hmr.host: 'localhost'` 保证浏览器 WebSocket 连到宿主机转发端口。
- PHP 容器只读挂载（`:ro`），Vite 容器读写挂载（build 产物经 bind mount 写回宿主机）。
- `make serve` 用 `docker run` 单次启动 prod PHP，不依赖 compose 服务，不带 `MOCK_DEV`。

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
npm run serve:php
```

启动 PHP 内置 server（`php -S localhost:8000`），由真 PHP 模板实时读取 manifest 注入 CSS link：

```text
http://localhost:8000/pages-php/home.php
http://localhost:8000/pages-php/home.php?forceLegacy=1
http://localhost:8000/pages-php/result.php
```

依赖本地 PHP（macOS 可 `brew install php`）。该链路覆盖 CSS link、业务 entry modern/legacy 双 URL（`manifest_url($entry, 'modern'|'legacy')`）以及 polyfills-legacy（`polyfills_legacy_url()`）全经 manifest 查表，支持 hash 文件名。

```bash
npm run serve:php-dev
```

启动 PHP 内置 server（`MOCK_DEV=1 php -S localhost:8000`），PHP 模板进入 dev 模式：注入 `@vite/client` + `_loader_dev_shim.js`，业务模块 URL 直接指向 Vite dev server，获得 HMR。需同时开启 Vite dev server：

```bash
# Terminal 1
npm run dev:vite        # Vite at :5173

# Terminal 2
npm run serve:php-dev   # PHP at :8000，MOCK_DEV=1

# 浏览器
http://localhost:8000/pages-php/home.php
```

```bash
npm run test:run
```

运行 Vitest 单测。当前单测为 25/25 通过。

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

`@vitejs/plugin-legacy` 负责 legacy SystemJS 产物和 polyfills，manifest 形态在 PHP 链路里已完整验证：

- modern entry key：`dev/<area>/<name>/index.js`，`file` 为 modern 产物（含 hash）
- legacy entry key：`dev/<area>/<name>/index-legacy.js`，`file` 为 legacy 产物（hash 独立）
- polyfills key：`vite/legacy-polyfills-legacy`，`file` 为 `polyfills-legacy-<hash>.js`
- modern entry 的 `css: [...]` 与 legacy 共用

PHP 端用 `manifest_url($entry, 'legacy')` 把 modern entry key 自动映射到 legacy key 查表；`polyfills_legacy_url()` 单独查 polyfills 的 file 字段。

### 6. legacy URL 派生：从字符串变换升级到 manifest 查表

固定文件名阶段，`_loader_res.js` 的 `distUrlToLegacy()` 用 `.js → -legacy.js` 纯字符串变换派生 legacy URL（`home/searchbox.js → home/searchbox-legacy.js`）。

hash 开启后这套必崩：

- modern 产物：`home/searchbox-<hash1>.js`
- legacy 产物：`home/searchbox-legacy-<hash2>.js`（plugin-legacy 内容不同，hash 必然独立）
- 字符串变换会拼出 `home/searchbox-<hash1>-legacy.js`——**不存在**

解决方式：`_loader.add` 第二参数支持对象 `{ stc, legacy }`，由 PHP 模板通过两次 `manifest_url` 查表注入。`distUrlToLegacy` 保留为字符串签名（dev shim / Rollup 基线）的兜底，对象签名下被显式 `legacy` 字段覆盖。

阶段三规则：跨 modern/legacy 产物的 URL 关系不能假设是字符串变换；必须由 manifest 作为唯一来源。

## 阶段三交接要点

阶段三建议以 `MIGRATION_COMPATIBILITY_CHECKLIST.md` 为准。核心方向：

- 生产恢复 hash 文件名，以 manifest 作为 URL 唯一来源。
- PHP 注入统一 manifest。
- `_loader.add(name, logicalEntry)` 支持逻辑入口查表。
- PHP 根据 manifest 输出 CSS `<link>`，并去重。
- `_loader_res.js` 只管 JS 业务模块分流和全局库加载，不接管 CSS。
- 全局库不进入 Vite 依赖图，除非有明确收益和兼容策略。

mock 项目已新增真 PHP 链路（`pages-php/` + `lib/manifest.php`，`npm run serve:php`），覆盖：CSS link、业务 entry modern + legacy 双 URL（`manifest_url($entry, 'modern'|'legacy')`）、polyfills-legacy（`polyfills_legacy_url()`），全部经 manifest 查表，支持 hash 文件名（`entryFileNames: '[name]-[hash].js'`）。阶段三落地时这些函数可直接平移到真实 PHP 模板。

## PHP 模板接入 Vite dev HMR（已完成）

`pages-php/*.php` 通过 `MOCK_DEV=1` 环境变量进入 dev 模式：注入 `@vite/client` + `_loader_dev_shim.js`，业务模块 URL 由 `entry_url()` 直接输出绝对 Vite URL（`http://localhost:5173/dev/...`），dev shim 识别后原样写入 `devUrlMap`，`dynamicImport` 从 Vite dev server 加载，HMR 生效。Prod 模式（无 `MOCK_DEV`）行为零变化。

**关键设计**：PHP 在 dev 输出绝对 Vite URL，dev shim 不再二次转换，避免相对路径在 :8000 origin 下解析漂移。`pages/*.html` 直连 Vite 的老路径保留，`npm run dev:vite` 体验不变。

## 维护注意事项

- `_loader_res.js` 是 CRLF 行尾；编辑时注意不要混入局部 LF。
- `_loader_dev_shim.js` 是 LF。
- 测试钩子受 `window._LOADER_TEST` 门控，生产默认不执行。
- `?forceLegacy=1` 是 mock 调试开关，生产是否保留需单独决定。
- `npm run serve` 使用项目根作为静态根；验证页面路径是 `/pages/...` 或 `/pages-rendered/...`。
- PHP dev HMR 必须以 `MOCK_DEV=1` 启动（`npm run serve:php-dev`）；不带该变量时 `is_dev()` 返回 false，走 prod 链路，HMR 不工作。
- 涉及 npm install、commit、删除文件等动作前先确认。
- 用户偏好中文 commit message，按阶段/步骤拆分提交。
