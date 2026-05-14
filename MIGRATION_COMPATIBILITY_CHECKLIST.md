# Vite 迁移兼容性清单

面向阶段三在原项目落地使用。本文只记录阶段二 mock 已验证出的迁移约束、推荐做法和风险点，不把 mock 的临时取舍包装成生产方案。

## 迁移目标

- 业务模块迁入 Vite：开发态走 Vite dev server + HMR，生产态走 Modern ESM + Legacy SystemJS 双发。
- 全局库继续全局加载：jquery、require、solib-*、第三方 SDK 等不进入 Vite 业务依赖图。
- `_loader` 收窄职责：保留全局库加载、去重、缓存、回调编排能力；业务模块加载改为 manifest 驱动。
- PHP 模板保持低侵入：尽量保留 `_loader.add` / `_loader.use` 的调用形态，避免大规模改写内联业务回调。

## 推荐架构

### Dev

```html
<script src="/resource/js/common/_loader_res.js"></script>
<script src="/resource/js/common/_loader_dev_shim.js"></script>
```

- `_loader_dev_shim.js` 必须在 `_loader_res.js` 之后加载。
- shim 覆盖 `_loader.add` / `_loader.use`，业务模块走 Vite 动态 `import()`，全局库回交原 `_loader`。
- shim 内禁止出现字面量 `import()`，必须使用 `new Function('url', 'return import(url)')`，否则普通 `<script>` 会被 Vite 当作 ESM 改写。
- dist URL 到 dev URL 的映射规则要兼容相对路径、绝对路径和未来 CDN URL，不能把正则锁死在 `^/resource/...`。

### Prod

```html
<script>
  window.__ASSET_MANIFEST__ = <?= json_encode($manifest) ?>;
</script>
<script nomodule src="<?= $legacyPolyfillsUrl ?>"></script>
<script src="/resource/js/common/_loader_res.js"></script>
```

- PHP 读取 Vite manifest，并把业务入口的 JS/CSS/legacy/polyfills 信息注入页面。
- 业务 CSS 由 PHP 模板层渲染 `<link>`，不要让 `_loader_res.js` 动态拉 CSS。
- 现代浏览器业务模块走原生动态 `import()`。
- legacy 浏览器业务模块走 `System.import()`，前提是 `polyfills-legacy.js` 已通过 `nomodule` 或等价条件加载。

## Vite 配置要点

- 多入口 input 保持与原 Rollup 入口一一对应，例如：
  - `home/searchbox` -> `dev/home/searchbox/index.js`
  - `home/skin` -> `dev/home/skin/index.js`
  - `result/ai-searchbox` -> `dev/result/ai-searchbox/index.js`
  - `homeAI/homeAI` -> `dev/homeAI/main.js`
- `@vitejs/plugin-vue` 用于 Vue SFC。
- `@vitejs/plugin-legacy` 用于 legacy SystemJS 产物和 polyfills。
- Vue 建议纳入 Vite 依赖图，由 Vite 抽 shared vendor chunk；不要再通过 Vue CDN external 混用。
- 阶段三应恢复 hash 文件名，并以 manifest 作为生产 URL 唯一来源。
- mock 中固定 `entryFileNames: '[name].js'` 是阶段二验证便利，生产不要依赖硬编码文件名。

## Manifest 方案

推荐采用“PHP 注入 manifest + `_loader` 查表”的风格 B：

```php
<script>
  window.__ASSET_MANIFEST__ = <?= json_encode($assetManifest) ?>;
</script>
<script>
  _loader.add('home-searchbox', 'home/searchbox');
  _loader.use('home-searchbox', callback);
</script>
```

阶段三需要实现：

- PHP 构建 `window.__ASSET_MANIFEST__`，按逻辑入口暴露：
  - modern JS URL
  - legacy JS URL
  - CSS URL 列表
  - polyfills/SystemJS runtime URL
  - imports/vendor chunk 依赖
- `_loader.add(name, logicalEntry)` 支持逻辑入口，不再要求业务模板传真实 dist URL。
- `_loader.use(names, cb)` 继续拆分业务模块和全局库：
  - manifest 命中的业务模块走 modern/legacy 分支。
  - manifest 未命中的全局库走原 `_loader`。
- CSS 在 PHP 渲染阶段通过 manifest 的 `css: [...]` 统一输出 `<link>`。

注意：plugin-legacy 的 legacy chunk、polyfills、runtime 在标准 manifest 中的形态需要实测。若字段不满足 PHP 查表需求，写 `manifest-unify` 插件在 `closeBundle` 阶段生成统一 manifest，不要在 PHP 里硬猜文件名。

## `_loader_res.js` 改造清单

- 保留原默认全局库表和加载能力。
- 新增业务模块表，例如 `bizModules[name] = manifestEntry`。
- `add(name, entry)`：
  - 如果 `entry` 是 manifest 逻辑名，查 `window.__ASSET_MANIFEST__` 后登记业务模块。
  - 如果 `entry` 是老 URL 或未命中 manifest，继续走原全局库注册逻辑。
  - 兼容原项目可能出现的 `{ stc: '...' }` 形态。
- `use(names, cb)`：
  - 拆 `bizNames` 和 `libNames`。
  - `libNames` 先走原 `_loader`。
  - `bizNames` 再按浏览器能力加载，使用 `Promise.all` 保持回调在全部业务模块完成后触发。
- URL 进入 `dynamicImport` 或 `System.import` 前必须统一 `toAbsoluteUrl(url) = new URL(url, document.baseURI).href`。
- `?forceLegacy=1` 只作为 mock 调试开关；生产是否保留需由团队规范决定。
- 测试钩子必须受 `window._LOADER_TEST` 门控，生产默认零副作用。

## PHP 模板最小改动

- Dev 环境：
  - 加载 `_loader_res.js`。
  - 额外加载 `_loader_dev_shim.js`。
  - 保持原 `_loader.use` 回调形态。
- Prod 环境：
  - 注入 manifest 数据。
  - 静态注入 legacy polyfills/SystemJS runtime。
  - 按业务入口渲染 CSS `<link>`。
  - 加载改造后的 `_loader_res.js`。
- 业务调用从真实 dist URL 逐步改成逻辑入口名，例如 `home/searchbox`。若短期无法全量改造，可在 `_loader.add` 中兼容老 URL 作为过渡。

## 全局库处理

- 不把 jquery、require、solib-*、广告 SDK、监控 SDK 强行塞进 Vite 依赖图。
- 这些库继续以 `<script>` 或瘦身 `_loader` 方式挂到 `window`。
- 业务模块如果依赖全局库，应通过运行时全局变量访问，或在 Vite 侧显式 external 到全局变量，但要避免每个 entry 重复打包。
- 阶段三开始前必须统计原项目 `_loader.add` / `_loader.use` 调用，区分业务模块和全局库。

## CSS 处理

- 阶段二已验证：Vite manifest 的 modern entry 会包含 `css: [...]`，modern 和 legacy JS 可共用同一份 CSS。
- 生产 CSS 应由 PHP 根据 manifest 渲染 `<link>`。
- 不建议 `_loader_res.js` 负责 CSS 注入，避免把 JS 模块加载器扩展成资源渲染器。
- 阶段三需要处理去重：同一页面多个入口共享 CSS 时，PHP 应只输出一次。

## Legacy 与 Polyfill

- `@vitejs/plugin-legacy` 解决的是业务模块格式和 polyfill，不解决 jQuery 这类全局库本身能否运行。
- legacy 分支依赖 SystemJS runtime，必须确保在 `_loader.use` 触发业务模块前可用。
- `polyfills-legacy.js` 文件名生产应从 manifest 或统一 manifest 读取，不要硬编码。
- IE 保留与否是产品决策；如果决定不保留 IE，legacy 链路可以整体下线，方案会大幅简化。

## 必测场景

- Dev：访问 PHP/dev 页面，业务模块通过 shim 加载，Vue SFC HMR 生效。
- Dev：业务模块 + 全局库混合依赖，库先加载，业务后 import，callback 最终触发。
- Prod modern：业务入口、vendor chunk、CSS 都能加载。
- Prod legacy：polyfills/SystemJS、legacy entry、legacy vendor chunk、CSS 都能加载。
- 相对路径：`../resource/js/...` 不出现 `/resource/js/resource/js/...` 这种 base URL 漂移。
- 多入口页面：多个 `_loader.use` 独立触发时不重复加载共享 vendor/CSS。
- 错误场景：业务 entry 缺 manifest、legacy chunk 缺失、全局库加载失败时有可诊断日志。

## 阶段三启动前必须确认

- 原项目业务入口清单和目录命名是否能稳定映射到 Vite input key。
- 原项目全局库清单，尤其是除 jquery、require、solib-* 外的 SDK。
- PHP 是否能在渲染阶段读取 Vite manifest，缓存和发布流程如何处理。
- CDN 域名、public base、灰度发布路径是否会影响 `new URL(url, document.baseURI)`。
- legacy 支持范围和目标浏览器，是否仍需要 IE/SystemJS。
- 线上监控如何覆盖 modern/legacy 两条分支的加载失败。

## 不建议从 mock 照搬的内容

- 不建议生产继续硬编码 `resource/js/dist-vite/<entry>.js`。
- 不建议依赖 `pages-rendered/*.html` 这种构建后静态页；它只是模拟 PHP CSS 注入。
- 不建议把 `?forceLegacy=1` 作为公开生产能力。
- 不建议把 mock 的 URL 正则当最终业务识别机制；阶段三应以 manifest 逻辑入口为准。
- 不建议为了“全 ESM”把历史全局库全部纳入 Vite，这会放大体积和兼容风险。
