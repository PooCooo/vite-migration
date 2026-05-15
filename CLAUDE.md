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
http://localhost:8000/pages-php/home.php    # PHP 模板 + Vite HMR  ← 主入口
http://localhost:8000/pages-php/result.php
http://localhost:5173/pages/home.html       # 静态 HTML 直连 Vite（备用）
```

> **端口不要搞混**：`pages-php/*.php` 必须通过 `:8000`（PHP 容器）访问。`:5173` 是 Vite dev server（Node.js 进程），不执行 PHP——直接访问会把 `.php` 文件原样返回成文本。

**关键设计**：

- `node_modules` 装进 Docker 命名卷（`node_modules` volume），与宿主机隔离，避免 macOS/Linux 二进制冲突。
- `vite.config.js` 加 `host: true`，Vite 在容器内绑定 `0.0.0.0:5173`；`hmr.host: 'localhost'` 保证浏览器 WebSocket 连到宿主机转发端口。
- PHP 容器只读挂载（`:ro`），Vite 容器读写挂载（build 产物经 bind mount 写回宿主机）。
- `make serve` 用 `docker run` 单次启动 prod PHP，不依赖 compose 服务，不带 `MOCK_DEV`。

## 本机命令（需本地安装 PHP / Node，可选）

> 日常开发推荐用上方 Docker 工作流，无需本机安装任何运行时。以下命令在本机已装 PHP 和 Node 时作为备选。

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

## STC 燕尾服编译兼容性（2026-05-15 在原项目验证）

阶段二 mock 推荐的"PHP 注入 manifest + `_loader` 查表"方案与原项目 STC（燕尾服）编译链路冲突。在原项目跑 7 组手动实验 + mock 关 hash 重 build 1 组后，STC 的工作规则和它对 vite 产物形态的约束已经明确。本节与 `阶段二目标与最终方案` / `阶段三交接要点` 章节冲突时**以本节为准**——后两者基于已被推翻的 manifest 方案，TODO 重写。

背景文档：`docs/stc-cdn-compile.md`（原项目侧）。

### STC 字面量识别规则

STC 是 PHP 源码层面的静态扫描，认死板字面量；扫描对象是 `application/views/` 下的 `.php` 源文件，**不是** PHP 运行时输出。

| 写法 | 是否被替换 | 说明 |
| --- | --- | --- |
| `_loader.add('id', { stc: '/resource/...' }.stc)` | ✅ | 唯一被识别的 `_loader.add` 形态（round 1） |
| `_loader.add('id', { stc: '...', legacy: '...' }.stc)` | ❌ | 多键对象不识别（round 2） |
| `_loader.add('id', { stc: '...', legacy: '...' })` | ❌ | 缺 `.stc` 取值后缀（round 3） |
| `_loader.add('id', '/resource/...')` | ❌ | 裸字符串字面量不识别（round 4） |
| 多次 `_loader.add` 各带 `{ stc: ... }.stc` | ✅ | 每条独立替换（round 5） |
| `_loader.add('id', pickUrl({stc:'A'}.stc, {stc:'B'}.stc))` | ✅ | 函数参数嵌套也识别，A/B 各自被替换为独立 CDN URL（round 9） |
| `<link href="/resource/.../x.css" rel="stylesheet">` | ✅ | 替换为 CDN URL（round 7） |
| `<link ... rel="stylesheet" inline>` | ✅ 内联 | 转为 `<style>` 内联（round 6） |

### CDN 指纹策略

- STC 给**每个文件**独立指纹（`/ssl/<hash>/...`）和分片域名（`ss1..ss5.360tres.com`）。
- 同一目录下 `foo.js` 和 `foo-legacy.js` 的 hash 和分片号都不同（round 5 同时验证两个 entry，hash 和 ssN 都不一样）。
- **不能用字符串变换**（`.js → -legacy.js`）从 modern URL 派生 legacy URL——结果 host/hash 全错。

### Vite 产物形态（关 hash 后的观察）

`vite.config.js` 把 `entryFileNames` 改为 `'[name].js'` 后 build 产物（节选）：

```text
resource/js/dist-vite/home/searchbox.js                          1.01 kB
resource/js/dist-vite/home/searchbox-legacy.js                   1.26 kB
resource/js/dist-vite/polyfills-legacy.js                       40.58 kB
resource/js/dist-vite/vendor/runtime-dom.esm-bundler.js         61.36 kB  ← 见 TODO 1
resource/js/dist-vite/vendor/runtime-dom.esm-bundler-legacy.js
resource/js/dist-vite/assets/searchbox-.css                      0.27 kB  ← 末尾 - 是配置问题
```

- 业务 entry / legacy entry / polyfills 命名稳定，符合 STC 字面量匹配前提。
- CSS 末尾 `-` 是 `assetFileNames` 删 `[hash]` 时没删干净，改 `'assets/[name].[ext]'` 即可。
- vendor chunk 是 vite 抽出来的 shared 文件，业务 entry 内部以 ESM 静态 `import "../vendor/..."` 引用——见 TODO 1。

### 由此推出的硬约束

- **PHP 模板必须直接写字面量** `{ stc: '/resource/...' }.stc`；不能通过 PHP 函数（`manifest_url()` 等）或运行时拼接生成。
- **STC 识别是位置无关的 lexical scanning**：`{ stc: '...' }.stc` 出现在任意 JS 表达式位置（直接作为参数、函数参数嵌套、独立语句等）都会被替换（round 1/5/9 共同证实）。允许用 helper 函数包装多个字面量做 modern/legacy 选择。
- **Vite 产物必须无 hash**（`entryFileNames: '[name].js'`、`assetFileNames: 'assets/[name].[ext]'`）——指纹归 STC 管。
- **运行时不能从 modern URL 推导 legacy URL**——modern 和 legacy 必须各自以字面量出现在某个 `.php` 源文件里，让 STC 各自处理。
- **CSS 不需要 manifest**——`<link href="/resource/...">` 是 STC 原生支持形态，直接写即可。

### TODO（未解难点）

#### 阶段化 TODO 总览（2026-05-15 讨论结论）

当前结论：阶段三先走 **STC 兼容的保守平移**，即 Vite 只替代 Rollup 打包器；生产仍输出到 `resource/js/dist/`，文件名与 Rollup 时代 1:1 对齐、无 hash、尽量 IIFE；Vue 继续 external 到全局 `Vue`；PHP 模板里的 `{ stc: '/resource/...' }.stc` 保持不变；CDN 上传和路径重写全部交给 STC。

执行顺序按以下阶段推进：

- **阶段 1：Rollup → Vite 平移（必须先做）**
  - Vite 输出路径对齐 Rollup：`resource/js/dist/home/<m>.js`、`resource/js/dist/result/<m>.js`、`resource/js/dist/homeAI/homeAI.js`。
  - 禁止 hash；禁止依赖 Vite manifest 驱动生产 PHP。
  - 生产包优先使用 `external: ['vue']` + `format: 'iife'` + `globals: { vue: 'Vue' }`，保持现有 `_loader.use('vue3.3.9,xxx')` 契约。
  - 验证产物没有 `vendor/` 目录和 entry 内部相对 `import "../vendor/..."`。
  - Dev 继续使用 Vite dev server + `_loader_dev_shim.js` 获取 HMR。

- **阶段 2：单产物生产优化（STC 兼容内做）**
  - 基于真实浏览器数据评估是否提高 `build.target`，减少转译和 polyfill。
  - 实现 Vite 下的 `polyfill_home.min.js` / `polyfill_result.min.js` 聚合方案。
  - 明确 CSS 稳定落点和 PHP `<link href="/resource/...">` 字面量接入方式。（mock 已完成：IIFE CSS 抽离为 `resource/js/dist/assets/*.css`）
  - 收紧 external / tree-shaking，避免把全局库重复打入每个业务模块。

- **阶段 3：原项目 STC 与灰度验证**
  - 在真 STC 链路后确认业务 JS、polyfill、CSS 都被改写为 CDN URL。
  - 验证生产加载、缓存、回滚、错误日志和 CSP 分片域名。
  - 验证 CentOS 7.4 构建镜像能跑 Vite / esbuild。

- **阶段 4：modern/legacy 双发优化（后做）**
  - 方案 D：`pickUrl({ stc: modern }.stc, { stc: legacy }.stc)`，适合先挑少量模块试点。
  - 方案 C：生成集中 `_legacy_registry.php` / registry include，适合模块多且希望自动化时再做。
  - 双发不是阶段三迁移必需项；必须等阶段 1-3 稳定后再评估包体收益、浏览器占比和模板改动成本。

- **暂缓：生产 ESM / 自动 code splitting**
  - 现代浏览器可以跑 ESM，但 STC 不能自动理解 Vite chunk graph。
  - 自动 vendor chunk / 相对 import 在 STC 独立 hash + 多域名分片下有 404 风险。
  - 除非后续生成 STC 可扫描的 chunk registry / import map，或改造 CDN 发布机制，否则生产优先不走 ESM chunk graph。

#### 当前进展（2026-05-15）

- `81debe3`：完成阶段 1 mock 改造。生产构建切到 `scripts/build-stc-vite.mjs` 逐入口输出无 hash IIFE 到 `resource/js/dist/`；Vue external 到全局 `Vue`；PHP/HTML 模板恢复 `{ stc: '/resource/...' }.stc` 字面量；移除生产 manifest、`dist-vite`、plugin-legacy、`bizModules` / `dynamicImport` 分流。
- `f090941`：完成阶段 2 的 CSS 稳定资源验证。由于 Vite 在 IIFE 输出下默认把 CSS 注入 JS，mock 加了 `mock-extract-iife-css` 后处理插件，把 Vue SFC CSS 抽离为 `resource/js/dist/assets/*.css`，模板用 `<link href="/resource/js/dist/assets/...css">` 字面量交给 STC。
- 已验证命令：`npm run test:run`、`npm run build:vite`、`php -l pages-php/home.php`、`php -l pages-php/result.php`、`php -l lib/manifest.php`。
- 当前构建产物应只有稳定 JS/CSS：`resource/js/dist/{home,result,homeAI}/...js` 和 `resource/js/dist/assets/*.css`；无 `vendor/` 目录，JS 内无 `__vite_style__` / `document.createElement('style')` 注入。

#### TODO 1：vendor chunk 在 STC 链路下不可用 — mock 已修复

业务 entry 内部 ESM 静态 import 引用 vendor：

```text
searchbox.js 内含 import "../vendor/runtime-dom.esm-bundler.js"
↓ STC 各自上传
ss5/ssl/A/dist/home/searchbox.js
ss4/ssl/B/dist/vendor/runtime-dom.esm-bundler.js
↓ 浏览器加载 searchbox.js 后解析相对 import
ss5/ssl/A/dist/vendor/runtime-dom.esm-bundler.js  ← 不存在该 hash/分片，404
```

阶段二里"Vue 纳入 Vite 依赖图、抽 shared vendor chunk"是基于 manifest 方案的，已不成立。mock 现已改为 `scripts/build-stc-vite.mjs` 逐入口构建：`external: ['vue']` + `output.format: 'iife'`，回到原项目 `window.Vue` + 自包含 entry 形态。验证结果：`npm run build:vite` 只生成 `resource/js/dist/{home,result,homeAI}/...js`，**没有 `vendor/` 目录**。

#### TODO 2：modern/legacy 双发的模板形态 — 阶段 4 再决策

STC 不识别 `{ stc, legacy }` 多键对象（round 2/3 证实），mock 现在 `_loader.add('id', { stc: ..., legacy: ... })` 在原项目走不通。四条候选：

- **路径 D（round 9 验证，保留双发时的最优解，阶段 4 优先试点）**：业务模板单 `_loader.add` + helper 函数包装两个字面量：

  ```php
  _loader.add('searchbox_ai', pickUrl(
    { stc: '/resource/js/dist/home/ai-searchbox.js' }.stc,
    { stc: '/resource/js/dist/home/ai-searchbox-legacy.js' }.stc
  ));
  ```

  `pickUrl(modern, legacy)` 由 `_loader_res.js` 提供，按浏览器能力返回二选一。STC 把两个字面量各自替换为独立 CDN URL（不同 hash、不同 ssN 分片都没关系，pickUrl 拿到的是完整 URL）。单 `_loader.add` 形态保留、零命名约定、双发收益保留。设计未决见 TODO 8。
- **路径 A**：业务模板每模块写两条 `_loader.add`（modern + legacy），`_loader_res.js` 用命名约定（`name` ↔ `name_legacy`）分流。相对 D 多一行模板代码并引入命名约定，劣势明显。
- **路径 B（阶段 1-3 推荐路径，最稳，零模板改动）**：放弃 modern/legacy 双发，回到原项目"单产物 + 聚合 polyfill"，vite `target` 调到原项目支持的最低浏览器，不接 `@vitejs/plugin-legacy`，PHP 模板一个字符不动。
- **路径 C（阶段 4 自动化备选）**：业务模板单 `_loader.add`，build 期生成集中 `_legacy_registry.php` 字面量片段，STC 一并扫描。比 D 多一个 build 步骤，业务模板完全冻结或模块数量较多时可选。

当前决策：阶段 1-3 先选路径 B；路径 D / C 放到阶段 4 作为生产优化项。阶段 4 启动前再评估是否要双发（产品决策）、plugin-legacy 在 IIFE+external 下的可用性（见 TODO 3）、`pickUrl()` 设计（见 TODO 8）。

#### TODO 3：plugin-legacy 与 IIFE+external 的兼容性 — 待实测

`@vitejs/plugin-legacy` 默认产 SystemJS 格式 + 带 polyfills。如果走路径 A/C，同时要求：

- `external: ['vue']` + `format: 'iife'`（解决 vendor chunk 问题）
- legacy 文件名无 hash
- legacy entry 自包含（无内部 import）

需要在 mock 上跑通才能确认 A/C 可行。

#### TODO 4：polyfill 聚合方案在 vite 下的等价实现 — 待实现

原项目 `scripts/rollup-plugin-polyfills.js` 把每业务模块所需 polyfill 集中到 `polyfill_home.min.js` / `polyfill_result.min.js`。vite 没有等价机制。路径 B 落地前需要实现等价 vite 插件，否则每业务自带 polyfill 会重复执行 + 包体膨胀。

#### TODO 5：STC 是否扫描 .js 文件内部 `/resource/...` 引用 — 待实测

`MOD_JS_TPL_REPLACE = true` 暗示 STC 可能也扫 JS，但具体行为未实测。即便扫了，跨文件相对 import 在每文件独立 hash 下仍然无解（见 TODO 1）。本项主要是**确认认知**，不期待解出 vendor chunk 问题。

#### TODO 6：vite build 在 CentOS 7.4 老镜像里的可运行性 — 待实测

原项目 `fe-build` 在 `r.so.qihoo.net/library/centos:7.4.1708` 跑 `yarn build`。该镜像默认 Node 较老，esbuild 原生二进制可能不兼容。如果需要升级镜像，连带改 `Makefile` / `build/build_node.sh`。

#### TODO 7：vite CSS 产物落点与原项目模板对齐 — mock 已验证

vite IIFE 默认会把 CSS 内联注入 JS，不适合交给 STC 单独上传/改写。mock 现通过 `scripts/build-stc-vite.mjs` 的 `mock-extract-iife-css` 后处理插件，把每个 IIFE entry 的 Vue SFC CSS 抽出为稳定文件：

```text
resource/js/dist/assets/home-searchbox.css
resource/js/dist/assets/home-skin.css
resource/js/dist/assets/result-ai-searchbox.css
resource/js/dist/assets/homeAI-homeAI.css
```

PHP/HTML 模板用 `<link rel="stylesheet" href="/resource/js/dist/assets/...css">` 字面量引用，符合 STC 扫描规则。原项目落地时仍需确认多页面共享 CSS 的去重策略，以及真实业务是否需要把 CSS 落到 `resource/css/` 而不是 `resource/js/dist/assets/`。

#### TODO 8：`pickUrl()` 的归属与浏览器能力检测策略 — 待设计

若走路径 D，需要决定：

- 实现位置：放 `_loader_res.js` 还是独立 `_browser_caps.js`？
- 现代能力判定用 `'noModule' in HTMLScriptElement.prototype`（plugin-legacy 默认逻辑）、`typeof Symbol === 'function'`、还是其它？需要与原项目 `_loader.use('vue3.3.9,...')` 现有的能力假设对齐，避免业务模块和 vue 走不同分支导致 API 不匹配。
- `?forceLegacy=1` 调试开关是否上生产？mock 阶段保留，生产需团队评审。
- CSP 策略下需要确认 `script-src` 允许全部 `*.360tres.com` 分片域名——modern 和 legacy 文件可能来自不同 `ssN` 子域。
- `pickUrl` 调用本身不含 eval/Function 构造，但确认现行 CSP `script-src` 不会因为运行时函数调用拦截 URL。

## 阶段三核心方向

阶段二 mock 中的"manifest 驱动 PHP 渲染"方案已被 STC 实验推翻（见上方 `STC 燕尾服编译兼容性`）。阶段三在原项目落地的核心方向以 STC 硬约束为基础重新整理如下。`MIGRATION_COMPATIBILITY_CHECKLIST.md` 同步待按本节重写。

### Vite 配置必备

- 产物无 hash：`entryFileNames: '[name].js'`、`chunkFileNames: '[name].js'`、`assetFileNames: 'assets/[name].[ext]'`。指纹归 STC。
- Vue 走 external + 全局：`external: ['vue']`、`output.format: 'iife'`、`output.globals: { vue: 'Vue' }`。规避 vendor chunk 内部相对 import 在 STC CDN 上 404（TODO 1）。
- `build.target` 显式对齐原项目最低浏览器（rollup 现状 `targets: { ie: 10 }`）。
- 入口扫描保留 rollup 同形态，输出路径与文件名与 rollup 1:1 对齐（`docs/stc-cdn-compile.md` §6.1）。
- `@vitejs/plugin-vue` 接入；`@vitejs/plugin-legacy` 是否接入取决于双发路径决策（TODO 2 / 3）。

### PHP 模板形态

- 业务模块唯一被 STC 识别的字面量形态：

  ```php
  _loader.add('xxx', { stc: '/resource/js/dist/xxx.js' }.stc);
  ```

  多键对象、缺 `.stc` 后缀、裸字符串都不行。
- CSS：标准 `<link href="/resource/...">`；小文件加 `inline` 触发内联。
- **禁止**在模板里用 PHP 函数（`manifest_url()` 等）生成 `/resource/...` 路径——STC 看不见运行时输出。
- 业务模板的 `_loader.add` / `_loader.use` 形态尽量不动。modern/legacy 双发的具体表达（双 `_loader.add` / `pickUrl` 包装 / 集中 registry）取决于 TODO 2 决策。

### `_loader_res.js` 改造

- 路径 B 下业务 IIFE 不再走动态 `import()`；`/resource/js/dist/...`（或 STC 改写后的 CDN URL）按普通脚本模块注册到原 `modules` 表，由 `_loader.use('vue3.3.9,xxx')` 表达加载顺序。
- 不接管 CSS。
- 测试钩子受 `window._LOADER_TEST` 门控，生产零副作用。
- mock 的 `bizModules` 表 + `_loader.add(name, logicalEntry)` 逻辑入口形态**不保留**——STC 模型下 URL 即字面量，不需要查表。

### 全局库

- jquery、require、solib-\*、广告 / 监控 SDK 维持现状：`<script>` 或瘦身 `_loader` 加载，挂 `window`。
- 不进 Vite 依赖图。
- 阶段三启动前静态扫 `application/views/**/*.php` 的 `_loader.add` / `_loader.use`，区分业务模块和全局库。

### Polyfill

- 沿用原项目 `polyfill_home.min.js` / `polyfill_result.min.js` 命名与聚合模型（按业务阵营共享一份 polyfill bundle）。
- vite 端等价实现待落地（TODO 4）。
- 禁止"每业务模块自带 polyfill"——重复执行 + 包体膨胀。

### 阶段三启动前必须确认

- 业务入口清单和目录命名能稳定映射到 vite input key（rollup 现状是 `readdirSync` 动态枚举，应能直接平移）。
- 全局库清单，覆盖除 jquery、require、solib-\* 外的所有 SDK。
- vite 在 `r.so.qihoo.net/library/centos:7.4.1708` 镜像可运行（TODO 6）。
- modern / legacy 双发是否保留 → 路径 A / B / C 决策（TODO 2 / 3）。
- vendor chunk + 相对 import 在 STC 后真的 404 的推断需在原项目实测确认（TODO 1 / 5）。
- CSP `script-src` 兼容 STC 分片域名（应已兼容，rollup 状态在线）。
- vite CSS 产物落点和模板 `<link>` 引用形态对齐（TODO 7）。

### mock 不带到原项目的清单

- vite hash 文件名
- Vue 入 vite 依赖图 / vendor chunk
- `manifest_url()` PHP 运行时查表
- `_loader.add(name, logicalEntry)` 逻辑入口形态
- `pages-rendered/*.html` 静态基线（mock 验证用）
- `?forceLegacy=1` 是否上生产，待 TODO 2 一并决定

## PHP 模板接入 Vite dev HMR（已完成）

`pages-php/*.php` 通过 `MOCK_DEV=1` 环境变量进入 dev 模式：注入 `@vite/client` + `_loader_dev_shim.js`，业务模块 URL 由 `entry_url()` 直接输出绝对 Vite URL（`http://localhost:5173/dev/...`），dev shim 识别后原样写入 `devUrlMap`，`dynamicImport` 从 Vite dev server 加载，HMR 生效。Prod 模式（无 `MOCK_DEV`）行为零变化。

**关键设计**：PHP 在 dev 输出绝对 Vite URL，dev shim 不再二次转换，避免相对路径在 :8000 origin 下解析漂移。`pages/*.html` 直连 Vite 的老路径保留，`npm run dev:vite` 体验不变。

## 维护注意事项

- `_loader_res.js` 是 CRLF 行尾；编辑时注意不要混入局部 LF。
- `_loader_dev_shim.js` 是 LF。
- 测试钩子受 `window._LOADER_TEST` 门控，生产默认不执行。
- `?forceLegacy=1` 是 mock 调试开关，生产是否保留需单独决定。
- `npm run serve` 使用项目根作为静态根；验证页面路径是 `/pages/...` 或 `/pages-rendered/...`。
- PHP dev HMR 必须以 `MOCK_DEV=1` 启动（Docker：`make dev`；本机：`npm run serve:php-dev`）；不带该变量时 `is_dev()` 返回 false，走 prod 链路，HMR 不工作。
- `pages-php/*.php` 必须通过 PHP server 端口（`:8000`）访问；通过 Vite 端口（`:5173`）访问时 Node.js 不执行 PHP，会原样返回源码。
- 涉及 npm install、commit、删除文件等动作前先确认。
- 用户偏好中文 commit message，按阶段/步骤拆分提交。
