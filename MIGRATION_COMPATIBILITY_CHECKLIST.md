# Vite 迁移兼容性清单

面向阶段三在原项目落地使用。基于阶段二 mock 验证 + 2026-05-15 在原项目对 STC 燕尾服编译的 8 组实验（与 `CLAUDE.md` `STC 燕尾服编译兼容性` 章节互为一致；TODO 项以 CLAUDE.md 为准）。

## 关键背景：STC 燕尾服硬约束（2026-05-15 实验确认）

阶段二 mock 提出过“PHP 注入 manifest + `_loader` 查表”的方案，原项目 STC 实验证明这条路在生产链路上**走不通**。STC 是 PHP 源码层面的静态扫描，认死板字面量，对运行时计算的路径不可见。

### STC 识别规则

| 写法 | 是否被替换 | 说明 |
| --- | --- | --- |
| `_loader.add('id', { stc: '/resource/...' }.stc)` | 是 | 唯一被识别的形态 |
| `_loader.add('id', { stc: '...', legacy: '...' }.stc)` | 否 | 多键对象不识别 |
| `_loader.add('id', { stc: '...', legacy: '...' })` | 否 | 缺 `.stc` 取值后缀 |
| `_loader.add('id', '/resource/...')` | 否 | 裸字符串字面量不识别 |
| 多次 `_loader.add` 各带 `{ stc: ... }.stc` | 是 | 各自独立替换 |
| `_loader.add('id', pickUrl({ stc: 'A' }.stc, { stc: 'B' }.stc))` | 是 | 嵌套在函数参数中也能识别（round 9）；STC 是 lexical 扫描，与所处语法上下文无关 |
| `<link href="/resource/css/x.css" rel="stylesheet">` | 是 | 改写为 CDN URL |
| `<link href="/resource/css/x.css" rel="stylesheet" inline>` | 是（内联） | 编译时转为 `<style>` 标签内联（小文件优化） |

### CDN 指纹规则

- STC 给**每个文件**独立指纹（`/ssl/<hash>/...`）和域名分片（`ss1..ss5.360tres.com`）。
- 同一目录下 `foo.js` 和 `foo-legacy.js` 的 hash、分片号都不同。
- **不能用字符串变换（`.js → -legacy.js`）从 modern URL 派生 legacy URL**——派生出来的 host/hash 都是错的。

### 由此推出的硬约束

- **PHP 模板必须直接写字面量** `{ stc: '/resource/...' }.stc`；不能通过 PHP 函数或运行时拼接生成。
- **Vite 产物必须无 hash**（`entryFileNames: '[name].js'`）——指纹归 STC 管，文件名稳定是模板字面量匹配的前提。
- **运行时不能从 modern URL 推导 legacy URL**——modern 和 legacy 必须各自有独立的字面量出现在某个 `.php` 源文件里，让 STC 各自处理。
- **CSS 不需要 manifest**——`<link rel="stylesheet">` 是 STC 原生支持的形态，直接写即可。

## 迁移目标

- 业务模块迁入 Vite：开发态走 Vite dev server + HMR，生产态走稳定文件名的 IIFE 产物 + STC 上传 CDN。
- 全局库继续全局加载：jquery、require、solib-*、第三方 SDK 等不进入 Vite 业务依赖图。
- `_loader` 收窄职责：保留全局库加载、去重、缓存、回调编排；路径 B 下业务 IIFE 仍按普通脚本模块加载，dev 环境再由 shim 转接 Vite 动态 `import()`。
- PHP 模板**零侵入**：业务 `_loader.add('id', { stc: '...' }.stc)` 形态保持不变，STC 链路完全不动。

## 迁移路径决策

基于 STC 约束，原 mock 推荐的“manifest 驱动 PHP”方案不可用。剩下三条路：

### 路径 A：业务模板写两次 `_loader.add`（modern + legacy）

```php
_loader.add('searchbox_ai',        { stc: '/resource/js/dist/home/ai-searchbox.js' }.stc);
_loader.add('searchbox_ai_legacy', { stc: '/resource/js/dist/home/ai-searchbox-legacy.js' }.stc);
_loader.use('vue3.3.9,searchbox_ai', cb);
```

- `_loader_res.js` 按浏览器能力把 `searchbox_ai` 自动转接到 `searchbox_ai_legacy`。
- 保留 modern/legacy 双发收益（现代浏览器拿小包）。
- 业务模板每模块多一行 `_loader.add`，需要 PR 大面积扫一遍。
- **被路径 D 取代**：D 的改动量更小、语义更清晰，无命名约定耦合。

### 路径 D：单 `_loader.add` + `pickUrl()` 包装两个字面量（双发首选）

由 round 9 实验验证（STC 识别 lexical 模式，字面量嵌套在函数参数里也能替换）：

```php
_loader.add('searchbox_ai', pickUrl(
  { stc: '/resource/js/dist/home/ai-searchbox.js' }.stc,
  { stc: '/resource/js/dist/home/ai-searchbox-legacy.js' }.stc
));
_loader.use('vue3.3.9,searchbox_ai', cb);
```

- 保留单 `_loader.add` 语义，不需要 `_legacy` 命名约定。
- `pickUrl(modern, legacy)` 由 `_loader_res.js` 提供，按浏览器能力返回二选一。
- 业务模板每模块仅在第二参数外裹一层 `pickUrl()` + 加一行 legacy 字面量。
- **保留双发能力的方案中改动量最小**，是 A 的直接替代。

### 路径 B：放弃双发，回到“单产物 + 聚合 polyfill”（**推荐**）

```php
_loader.add('searchbox_ai', { stc: '/resource/js/dist/home/ai-searchbox.js' }.stc);
```

- vite `build.target` 调到原项目支持的最低浏览器（rollup 现状是 IE10），不接 `@vitejs/plugin-legacy`。
- polyfill 沿用原项目 `polyfill_home.min.js` / `polyfill_result.min.js` 聚合方案。
- **业务 PHP 模板一个字符都不用改**。
- 失去现代浏览器小包优化，但 rollup 现状本就没有，迁移不算回退。
- 阶段三先做形态平移把 HMR + tree-shaking 收益拿到；modern/legacy 双发作为第二阶段独立优化。

### 路径 C：业务模板单 `_loader.add`，build 期生成集中 legacy 注册片段

业务模板只写 modern 字面量；vite build 完成后由脚本生成 `application/views/include/_legacy_registry.php`：

```php
<?php // 自动生成，请勿手改 ?>
_loader.add('searchbox_ai_legacy', { stc: '/resource/js/dist/home/ai-searchbox-legacy.js' }.stc);
_loader.add('aitools_legacy',      { stc: '/resource/js/dist/home/aitools-legacy.js' }.stc);
```

- 该片段作为 `.php` 源文件进入 STC 扫描，字面量被正常替换。
- 业务模板完全不动，多一个 build 步骤。
- 比 A 灵活，比 B 多保留双发能力，多一个生成步骤的运维负担。

### 选 B 的理由

- 原项目 rollup 现状已经是“单产物 + babel 降级 + 聚合 polyfill”，B 是同形态平移。
- 阶段三目标是**稳态迁移**，先把 HMR/tree-shaking 收益拿到、PHP 模板改动收敛到零。
- modern/legacy 双发是优化项，不是必选项；上线稳定后单独立项更可控。

## 推荐架构

### Dev

```html
<script src="/resource/js/common/_loader_res.js"></script>
<script src="/resource/js/common/_loader_dev_shim.js"></script>
```

- `_loader_dev_shim.js` 必须在 `_loader_res.js` 之后加载。
- shim 覆盖 `_loader.add` / `_loader.use`，业务模块走 Vite 动态 `import()`，全局库回交原 `_loader`。
- shim 内禁止字面量 `import()`，必须用 `new Function('url', 'return import(url)')`。
- dist URL 到 dev URL 的映射规则兼容相对路径、绝对路径和未来 CDN URL，正则不能锁死在 `^/resource/...`。
- Dev 链路只在本地/测试环境跑，**不经过 STC**。

### Prod（路径 B 落地形态）

```html
<link href="/resource/css/home/searchbox.css" rel="stylesheet">  <!-- 业务模块如有 CSS -->
<script src="/resource/js/common/_loader_res.js"></script>
<script>
  _loader.add('searchbox_ai', { stc: '/resource/js/dist/home/ai-searchbox.js' }.stc);
  _loader.use('vue3.3.9,polyfill_home,searchbox_ai', function () { /* ... */ });
</script>
```

- 业务模板字面量完全不动；STC 走原有替换路径。
- CSS link 直接写在模板里，由 STC 上传 CDN 并改写。
- Vite 产物落到 `resource/js/dist/` 下，文件名与 rollup 1:1 对齐。

## Vite 配置硬约束

| 项 | 设置 | 原因 |
| --- | --- | --- |
| `build.rollupOptions.input` | 按目录扫描（参考原项目 `rollup/rollup.config.mjs`） | 与原项目入口对齐，新模块自动入图 |
| `entryFileNames` | `'[name].js'` | **禁止 hash**，指纹归 STC |
| `chunkFileNames` | `'[name].js'` 或稳定命名 | 同上 |
| `assetFileNames` | `'[name].[ext]'` | 同上 |
| `output.format` | `'iife'` | 与现有 `_loader.use` 协议兼容 |
| `rollupOptions.external` | `['vue']` | Vue 走全局 `window.Vue`，与 `_loader.use('vue3.3.9,...')` 协作 |
| `output.globals` | `{ vue: 'Vue' }` | 同上 |
| `build.target` | 与原 babel `targets: { ie: 10 }` 对齐 | 替代 rollup babel 降级 |
| Polyfill 策略 | 聚合到 `polyfill_home.min.js` / `polyfill_result.min.js` | 沿用原项目命名，避免每业务重复 polyfill |
| `@vitejs/plugin-legacy` | 路径 B 不接入；A/C 接入后必须强制无 hash | STC 不识别带 hash 字面量 |
| `@vitejs/plugin-vue` | 接入 | Vue SFC |

## `_loader_res.js` 改造清单（路径 B）

- 保留原默认全局库表和加载能力。
- 业务模块 `/resource/js/dist/...`（或 STC 改写后的 CDN URL）按普通脚本模块注册到原 `modules` 表，由 `_loader.use('vue3.3.9,xxx')` 表达加载顺序。
- 路径 B 不需要生产 `dynamicImport` / `System.import` 分流；动态 `import()` 只保留在 dev shim 中。
- 测试钩子受 `window._LOADER_TEST` 门控，生产默认零副作用。
- **路径 B 不需要 manifest 查表逻辑**；mock 中 `bizModules` 表 + manifest URL 解析的代码在阶段三可移除。

### 路径 D 增量改造（双发首选，如启用）

- `_loader_res.js` 暴露全局 `pickUrl(modern, legacy)`，按浏览器能力返回二选一；必须在业务模板 `_loader.add` 调用之前就绪。
- 能力检测建议：`'noModule' in HTMLScriptElement.prototype`（参考 plugin-legacy 默认逻辑），不依赖 UA sniffing。
- 业务模板形态：保留单 `_loader.add` 语义，第二参数从 `{ stc: '...' }.stc` 升级为 `pickUrl({ stc: 'modern' }.stc, { stc: 'legacy' }.stc)`。
- 不需要 `_legacy` 命名约定；STC 端 round 9 已确认 lexical 识别。

### 路径 A 增量改造（替代方案，如未来切到 A）

- `_loader.add` 第二参数仍是 `{ stc: '...' }.stc` 字面量。
- `_loader.use` 时检测浏览器能力：modern 浏览器用 `name`，legacy 浏览器把 `name` 重定向到 `name + '_legacy'`。
- 业务模板每模块多写一行 legacy `_loader.add`。
- 命名约定（`_legacy` 后缀）需团队评审，避免与已有模块名冲突。

## PHP 模板最小改动（路径 B）

- Dev 环境：加载 `_loader_res.js` + `_loader_dev_shim.js`，原 `_loader.use` 回调形态不变。
- Prod 环境：业务模板**完全不动**；如新增业务模块带 CSS，直接加 `<link href="/resource/css/...">`。
- STC 编译链路无任何调整。

## 全局库处理

- 不把 jquery、require、solib-*、广告 SDK、监控 SDK 强行塞进 Vite 依赖图。
- 这些库继续以 `<script>` 或瘦身 `_loader` 方式挂到 `window`。
- 业务模块如果依赖全局库，应通过运行时全局变量访问，或在 Vite 侧显式 external 到全局变量，但要避免每个 entry 重复打包。
- 阶段三开始前必须统计原项目 `_loader.add` / `_loader.use` 调用，区分业务模块和全局库。

## CSS 处理

阶段二 mock 探索的“PHP 读 manifest 渲染 `<link>`”方案，在原项目实测下被简化掉：

- CSS 直接走 `<link href="/resource/css/..." rel="stylesheet">` 字面量，STC 自动上传 CDN 并改写 URL。
- 小文件可加 `inline` 属性，STC 编译时内联成 `<style>`。
- vite 产物 CSS 路径与文件名只需稳定无 hash：mock 已验证 IIFE CSS 可后处理抽离为 `resource/js/dist/assets/*.css`，模板用 `<link href="/resource/js/dist/assets/...css">` 字面量引用。具体落点在 `resource/js/dist/assets/...` 或 `resource/css/...` 都可，整个 `resource/` 都是 STC 的 `STATIC_PATH`。
- **manifest 不进入生产 CSS 链路**；阶段二 mock 的 `manifest_url($entry, 'css')` 仅 dev 调试用。
- 同一页面多个入口共享 CSS 时的去重行为，待原项目实测确认；如 STC 不去重，则由 PHP 模板层显式控制。

## Legacy 与 Polyfill

- **路径 B**：不接 `@vitejs/plugin-legacy`，沿用原项目 `polyfill_home.min.js` / `polyfill_result.min.js`。需要 vite 等价插件实现“每业务模块扫描所需 polyfill → 集中写入聚合文件 → 最后单独打包成两个 IIFE”，参考原项目 `scripts/rollup-plugin-polyfills.js`。
- **路径 A/C**：接 `@vitejs/plugin-legacy`，但 legacy chunk、polyfills runtime 等文件名必须强制无 hash；URL 通过字面量进入 PHP 模板（A 业务模板直写；C build 期生成集中片段）。
- IE 保留与否仍是产品决策；如果不保留 IE，路径 B 的 `build.target` 可显著放宽，路径 A/C 整体可以下线。

## 必测场景

- Dev：访问 PHP/dev 页面，业务模块通过 shim 加载，Vue SFC HMR 生效。
- Dev：业务模块 + 全局库混合依赖，库先加载，业务后 import，callback 最终触发。
- **Prod：在真原项目 STC 编译后，确认每个业务模块的 `_loader.add` 字面量都被改写为 CDN URL**。
- Prod：业务入口 JS、聚合 polyfill、CSS（如有）都能加载。
- 相对路径：`../resource/js/...` 不出现 `/resource/js/resource/js/...` 这种 base URL 漂移。
- 多入口页面：多个 `_loader.use` 独立触发时不重复加载共享 vendor。
- 错误场景：业务 entry 缺失、全局库加载失败时有可诊断日志。
- **vendor chunk 必须消除**：vite 默认会把 vue 抽出 `vendor/runtime-dom.esm-bundler.js`，业务 entry 内部产生静态相对 `import "../vendor/..."`。STC 给两文件独立 hash + 分片域名后，浏览器侧相对解析必然 404。路径 B 通过 `external: ['vue']` + `output.format: 'iife'` 把 vue 走全局 `window.Vue`、业务 entry 自包含来从根上规避；验证目标：产物**没有 `vendor/` 目录**（CLAUDE.md TODO 1）。

## 阶段三启动前必须确认

- 原项目业务入口清单和目录命名能否稳定映射到 Vite input key。
- 原项目全局库清单，尤其是除 jquery、require、solib-* 外的 SDK。
- vite `external: ['vue']` + `output.format: 'iife'` 是否能产出**无 vendor 目录**的自包含 entry——mock 待按 `CLAUDE.md` TODO 1 修复并验证。
- CDN 域名、public base、灰度发布路径是否会影响 `new URL(url, document.baseURI)`。
- legacy 支持范围和目标浏览器；是否要走路径 A/C。
- 线上监控如何覆盖业务模块加载失败。
- 在 `r.so.qihoo.net/library/centos:7.4.1708` 镜像里能否跑 vite build（Node 版本、esbuild 二进制兼容性）。

## 不建议从 mock 照搬的内容

- 不建议把 mock 的 `manifest_url()` PHP 函数搬到原项目生产链路——**STC 不识别 PHP 函数输出**。
- 不建议依赖 `pages-rendered/*.html` 静态页；它只是模拟构建期 CSS 注入，原项目不需要。
- 不建议把 `?forceLegacy=1` 作为公开生产能力。
- 不建议 vite 产物文件名带 hash——与 STC 字面量识别冲突。
- 不建议把 mock 的 `bizModules` 表 + manifest 查表逻辑搬到 `_loader_res.js`——路径 B 下完全不需要。
- 不建议为了“全 ESM”把历史全局库全部纳入 Vite，会放大体积和兼容风险。
- 不建议在 vite 阶段直传 CDN，必须让 STC 负责（避免绕过 `~/.STC/data` 缓存索引导致灰度/回滚问题）。

## 实验记录索引

| 时间 | 内容 | 结论位置 |
| --- | --- | --- |
| 2026-05-15 | 原项目 8 组 STC 字面量识别 + CDN 指纹实验（含 round 9 pickUrl 嵌套） | 本文“STC 识别规则”和“CDN 指纹规则”两表 |
| 阶段二 mock 全程 | dev shim / `_loader_res.js` / manifest / plugin-legacy 三链路验证 | `CLAUDE.md` 阶段二步骤与提交记录 |
