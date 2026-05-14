# Mock Vite Migration

模拟 `local.so.com` 项目架构（_loader + PHP + Rollup IIFE），用于验证 Vite 迁移方案的沙箱项目。

## 项目结构

```
mock-vite-migration/
  pages/                       # 模拟 PHP 模板的静态 HTML
    home.html                  # 内含 _loader.add / _loader.use 调用
    result.html
  dev/                         # 源码
    home/
      searchbox/index.js       # Vue 3 模块入口
      skin/index.js
    result/
      ai-searchbox/index.js
    homeAI/
      main.js
  resource/js/
    common/_loader_res.js      # 原项目原样拷贝
    dist/                      # Rollup 产物（IIFE）
  rollup/                      # 与原项目一致的 rollup 配置
```

## 阶段进度

- 阶段一：mock 项目骨架 + Rollup 多入口构建跑通
- 阶段二：引入 Vite + dev server + HMR
- 阶段三（不在 mock 范围内）


---

# 关键机制笔记（踩坑深度还原）

## 1. 为什么用 `new Function('u','return import(u)')`？

在 dev shim 里，为了避免 Vite 静态分析到 `import` 关键字从而强制给非 module 脚本注入 `/@vite/client` 导致 `SyntaxError`。
- **为什么不用 `/* @vite-ignore */`？** 该注释只让 Vite 忽略解析路径参数，并不阻止 Vite 将文件标记为 ESM。
- **为什么不把 shim 改成 `type="module"`？** module 是**隐式 defer** 的，会破坏原本 `_loader_res.js` 和业务 inline script 严格按顺序执行的时序，代价极大。
- **为什么不用 Vite plugin 强行屏蔽？** 那会引入和 Vite/中间件顺序的强耦合（跨文件契约的"隐性丑"），而 `new Function` 是一行自包含的 JS 引擎规范级的 workaround（"显性丑"）。

## 2. 动态 import 的 base URL 漂移坑

`new Function` 带来了一个隐蔽坑：`import(u)` 解析相对路径时的 base URL，是**定义这个 Function 的脚本所在路径，而不是调用方的 `document.baseURI`**。
在 `_loader_res.js` 里：
- 函数定义在 `/resource/js/common/`
- 如果传入相对路径 `../resource/js/dist-vite/home/x.js`
- 浏览器会基于 `common/` 解析，得出 `/resource/js/resource/js/dist-vite/home/x.js`，多出一层目录，导致 404。

**为什么 dev shim 没踩到坑？**
纯属巧合。dev shim 里的正则映射总是返回**以 `/` 开头的绝对路径**（如 `/dev/home/...`）。绝对路径在解析时会忽略 base URL 的目录部分，直接挂在 origin 下，从而掩盖了 base 漂移问题。

**解法**：送进动态 import 之前，统一用 `new URL(u, document.baseURI).href` 将 URL 强转为绝对 URL（`toAbsoluteUrl`），彻底消除歧义。给阶段三的教训：跨脚本传递 URL，如果中间夹了 eval/new Function/异步，**必须在源头归一化为绝对 URL**。


# 阶段二：在 Mock 项目中引入 Vite

## 目标

跑通 Vite dev server 与 HMR，解决 `_loader` 与 Vite ESM 模型的兼容性，验证生产构建产物可替代 Rollup。

## 设计思路总览

```
┌──────────────────────────────────────────────────────────────────┐
│ Dev 阶段                                                          │
│                                                                  │
│  HTML 页面                                                        │
│    │                                                             │
│    ├── <script src="/@vite/client"></script>      ← Vite HMR 客户端│
│    ├── <script src="/_loader_res.js"></script>    ← 保留原 _loader │
│    ├── <script src="/_loader_dev_shim.js"></script> ← 拦截 use    │
│    │                                                             │
│    └── 业务调用：                                                  │
│          _loader.add('home-searchbox', '/dev/home/searchbox/index.js')│
│          _loader.use('home-searchbox', cb)                       │
│              ↓ shim 拦截                                          │
│          import('/dev/home/searchbox/index.js').then(cb)          │
│              ↓                                                   │
│          Vite dev server 处理 ESM + HMR                          │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Prod 阶段                                                         │
│                                                                  │
│  Vite build (rollupOptions.input 多入口) → IIFE bundle           │
│  → resource/js/dist/{home,result,homeAI}/*.js                   │
│  → 行为与原 Rollup 产物一致，PHP 模板无需改动                       │
└──────────────────────────────────────────────────────────────────┘
```

## 关键技术决策

### 决策 1：`_loader` 在 dev 环境的处理方式

**选择：Shim 拦截 `window._loader.use`**，让被拦截的调用走 Vite 的动态 `import()`。

**理由**：

- 完整保留 `_loader.add` / `_loader.use` 的调用语义，HTML/PHP 模板无需改写业务调用
- shim 只在 dev 阶段加载，prod 阶段走原始 `_loader_res.js`，互不污染
- 完整 HMR 体验（Vite 的模块图覆盖到所有业务模块）

### 决策 2：模块名 → ESM 路径的映射方式

原 `_loader.add(name, url)` 中的 `url` 是**生产路径**（如 `/resource/js/dist/home/searchbox.js`），dev 阶段需要映射到**源码路径**（如 `/dev/home/searchbox/index.js`）。

**两种可行方案**：


| 方案        | 实现                                                                                                | 取舍            |
| --------- | ------------------------------------------------------------------------------------------------- | ------------- |
| A. 显式映射表  | shim 中维护 `{ 'home-searchbox': '/dev/home/searchbox/index.js' }`                                   | 直观，但每加一个模块要维护 |
| B. URL 反推 | 从 `_loader.add` 传入的 url 反推：`/resource/js/dist/home/searchbox.js` → `/dev/home/searchbox/index.js` | 零维护，但耦合命名约定   |


**选择方案 B（URL 反推）+ 显式覆盖**：默认用规则反推，特殊模块允许在 shim 配置里显式声明覆盖。

**反推规则**：

```
/resource/js/dist/<area>/<name>.js  →  /dev/<area>/<name>/index.js
特殊：homeAI/homeAI.js              →  /dev/homeAI/main.js
```

### 决策 3：HTML 模板如何区分 dev/prod

mock 项目用 Vite plugin 在 HTML transform 阶段注入不同脚本：

- dev 时（`command === 'serve'`）注入 `_loader_res.js` + `_loader_dev_shim.js`
- prod 时只注入 `_loader_res.js`

HTML 中预留占位符（如 `<!--LOADER-->`），插件做字符串替换。

**理由**：更接近未来 PHP 模板的处理方式（PHP 也会根据环境变量条件渲染）。

### 决策 4：生产构建配置

- `build.rollupOptions.input` 多入口（同 rollup 配置一一对应）
- `build.lib` 不用（lib 只支持单入口）
- `output.format = 'iife'`
- `output.entryFileNames` 自定义路径，落到 `resource/js/dist/{home,result,homeAI}/<name>.js`
- `external: ['vue']`，`output.globals: { vue: 'Vue' }`
- `@vitejs/plugin-legacy` 替代自定义 `collectPolyfillsPlugin`

## 阶段二实施步骤

### Step 1：单模块跑通（最小可行）

只拿 `dev/home/searchbox` 这一个模块走通 Vite dev server + HMR：

1. 安装 Vite 与 `@vitejs/plugin-vue`
2. 写最小 `vite.config.js`：
  - `root: '.'`
  - `server.port = 5173`
  - 一个临时 dev HTML 直接 `<script type="module" src="/dev/home/searchbox/index.js">`
3. 启动 dev server，打开 HTML
4. 修改 `Counter.vue`，验证组件级 HMR 生效

**验收**：浏览器无刷新更新 UI。

### Step 2：扩展到多入口

1. 用 `readdirSync` 扫描 `dev/home/`*、`dev/result/*`、`dev/homeAI`（复用原 rollup 的多入口扫描逻辑）
2. 在 `vite.config.js` 的 `build.rollupOptions.input` 注入多入口
3. dev server 阶段仍然按模块按需 `import()`

### Step 3：实现 `_loader_dev_shim.js`

在 `resource/js/common/_loader_dev_shim.js` 新建。核心逻辑：

```js
// 在 _loader_res.js 之后加载，覆盖 use 方法
(function () {
  if (!window._loader) return;

  // 显式覆盖表（极少数边界情况用，默认走规则反推）
  var overrides = {
    // 'homeAI': '/dev/homeAI/main.js'
  };

  function distUrlToDevUrl(url) {
    if (!url) return null;
    // /resource/js/dist/<area>/<name>.js → /dev/<area>/<name>/index.js
    var m = url.match(/\/resource\/js\/dist\/([^\/]+)\/([^\/]+)\.js$/);
    if (!m) return null;
    var area = m[1], name = m[2];
    if (area === 'homeAI') return '/dev/homeAI/main.js';
    return '/dev/' + area + '/' + name + '/index.js';
  }

  // 内部模块名 → dev 路径（add 时注册）
  var devUrlMap = {};

  var origAdd = window._loader.add;
  window._loader.add = function (name, url) {
    // 原 add 可能传 url 字符串，也可能传对象（real project: { stc: '...' }.stc）
    var resolvedUrl = typeof url === 'string' ? url : (url && url.stc) || '';
    var devUrl = overrides[name] || distUrlToDevUrl(resolvedUrl);
    if (devUrl) devUrlMap[name] = devUrl;
    return origAdd.apply(this, arguments);
  };

  var origUse = window._loader.use;
  window._loader.use = function (names, callback) {
    var list = names.split(/\s*,\s*/g);
    // 过滤掉非业务模块（如 jquery / require.2.1.11），交还原 _loader
    var bizNames = list.filter(function (n) { return devUrlMap[n]; });
    var libNames = list.filter(function (n) { return !devUrlMap[n]; });

    function loadBiz() {
      return Promise.all(bizNames.map(function (n) {
        return import(/* @vite-ignore */ devUrlMap[n]);
      }));
    }

    if (libNames.length === 0) {
      loadBiz().then(callback);
    } else {
      // 库依赖仍走原 _loader，业务依赖走 Vite
      origUse.call(window._loader, libNames.join(','), function () {
        loadBiz().then(callback);
      });
    }
  };
})();
```

### Step 4：HTML transform 插件

写一个 Vite plugin，根据 `command === 'serve' | 'build'` 注入不同脚本：

```js
function htmlInjector() {
  return {
    name: 'mock-html-injector',
    transformIndexHtml(html, ctx) {
      const isDev = ctx.server != null;
      const injection = isDev
        ? `<script src="/resource/js/common/_loader_res.js"></script>
           <script src="/resource/js/common/_loader_dev_shim.js"></script>`
        : `<script src="/resource/js/common/_loader_res.js"></script>`;
      return html.replace('<!--LOADER-->', injection);
    }
  };
}
```

HTML 中预留占位符：

```html
<head>
  <!--LOADER-->
</head>
```

### Step 5：完整 dev 流程验证

跑 `npm run dev`，依次验证：

1. `pages/home.html` 中两个 `_loader.use` 调用（searchbox、skin）都能加载并渲染
2. 修改 `dev/home/searchbox/components/Counter.vue` → HMR 无刷新更新
3. 修改 `dev/home/searchbox/index.js` 入口 → 触发 full-reload（合理行为）
4. 跨模块切换：访问 `pages/result.html`，验证 ai-searchbox 模块也能 HMR

### Step 6：生产构建对齐（Modern ESM + Legacy SystemJS 双发）

> 经过方案讨论，Step 6 不再延续原 Rollup 的"全量 IIFE"产物结构，而是直接走阶段三最终态的**双发架构**，把 `_loader_res.js` 的改造一并提前到 mock 中验证。原 Rollup 产物仍保留作为体积/行为对比的基线。

#### 双发架构总览

```
┌──────────────────────────────────────────────────────────────┐
│ 现代浏览器（'noModule' in HTMLScriptElement.prototype）        │
│   _loader.use(name, cb)                                       │
│     → import('/resource/js/dist/home/searchbox.js')          │
│         ├─ 业务 chunk（ESM）                                  │
│         └─ vendor/vue-[hash].js（共享 chunk，跨入口自动去重）   │
├──────────────────────────────────────────────────────────────┤
│ 老浏览器（IE / 不支持 ESM）                                    │
│   HTML 已通过 nomodule 静态注入：                              │
│     - SystemJS runtime                                       │
│     - polyfills-legacy.js (core-js + regenerator)            │
│   _loader.use(name, cb)                                       │
│     → System.import('/resource/js/dist/home/searchbox-legacy.js')│
└──────────────────────────────────────────────────────────────┘
```

#### 关键决策

| 决策项 | 选择 | 理由 |
| --- | --- | --- |
| Modern 产物格式 | **ESM**（不再 IIFE） | 享受 Vite code-splitting，Vue 自动抽 vendor chunk 跨入口共享 |
| Legacy 产物格式 | **SystemJS**（plugin-legacy 默认） | 在 IE 上保留 ESM 语义、仍能 code-split；多付 ~3KB runtime |
| Vue 处理 | **不做 external，纳入依赖图** | Modern 端共享 chunk 去重 + tree-shake；Legacy 端依赖 SystemJS 共享 chunk |
| Polyfill 引导 | **HTML 静态注入 `nomodule` SystemJS + polyfills** | 与 plugin-legacy 设计对齐；modern 浏览器 0 开销 |
| `_loader_res.js` | **改造 `add` / `use`，能力检测分流**；其他 API（addAll 等）保留 | 用户裁定：阶段三 `_loader_res.js` 可改 |
| 产物输出目录 | 先输出到 `resource/js/dist-vite/` | 保留 Rollup 产物作对比基线，确认无误再切回 `dist/` |

#### 实施步骤

1. **依赖安装**（已完成）：`@vitejs/plugin-legacy`、`terser`
2. **`vite.config.js` build 段补全**：
   - `build.outDir = 'resource/js/dist-vite'`
   - `build.rollupOptions.output.entryFileNames = '[name].js'`（保留 `<area>/<name>` 路径，去 hash、去 `assets/` 前缀）
   - `build.rollupOptions.output.chunkFileNames = 'vendor/[name]-[hash].js'`（共享 vendor chunk 落点）
   - 接入 `@vitejs/plugin-legacy`：`renderLegacyChunks: true`，`polyfills` / `modernPolyfills` 按需，固定 polyfill 产物名（去 hash）
3. **HTML 模板改造**：在原 `<!--LOADER-->` 占位符基础上，prod 分支额外注入 `<script nomodule>` SystemJS runtime + polyfills；占位符方案二选一（合并到 `<!--LOADER-->` 注入，或新增 `<!--LEGACY-POLYFILL-->`）
4. **`_loader_res.js` 改造**：
   - 新增能力检测：`var supportsModule = 'noModule' in HTMLScriptElement.prototype`
   - `add(name, url)`：保存 modern URL，同时按规则推导 legacy URL（`/foo/bar.js` → `/foo/bar-legacy.js`）
   - `use(name, cb)`：modern 走 `new Function('u','return import(u)')(modernUrl)`；legacy 走 `System.import(legacyUrl)`
   - 其他 API（addAll 等）暂不改
5. **产物对比验证**：跑 `npx vite build`，确认
   - 产物落点正确（`dist-vite/home/searchbox.js`、`dist-vite/home/searchbox-legacy.js` 等）
   - 共享 vendor chunk 确实生成且 Vue 被抽出
   - Legacy 产物为 SystemJS 格式
6. **浏览器双场景实测**：
   - Modern：Chrome 直接 `npx serve . -l 3000` 访问 `pages/home.html`
   - Legacy：DevTools 关掉 ESM 支持（或模拟旧 UA），验证 SystemJS 分支
7. **dev shim 兼容确认**：dev shim 覆盖 `_loader.use`，会完全替换新版 `_loader_res.js` 的 use，能力检测分支在 dev 阶段不会触发，无冲突

## 已知风险与边界 case


| 风险点                                                                                     | 应对                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `_loader.add` 在原项目中传的是 `{ stc: '...' }.stc` 形式                                          | shim 中容错处理（已支持）                                                     |
| 库模块（jquery、require、solib-*）应继续走原 `_loader`                                              | shim 通过 `devUrlMap` 区分业务 vs 库                                       |
| `import()` 是异步的，原 `_loader.use` callback 也是异步的，但执行时机不完全一致                               | mock 中验证多模块顺序依赖场景，必要时用 `Promise.all` 保序                             |
| Vite dev server 的 ESM 模块带 query（`?import`、`?t=`），路径含 hash 时映射可能失效                       | 反推规则使用 url 主干，忽略 query                                              |
| `@vitejs/plugin-legacy` 输出的 polyfill bundle 文件名 hash 化，与现有 `polyfill_home.min.js` 路径不一致 | prod 配置中固定 `entryFileNames`，或在 PHP 模板侧通过 manifest 引用                |
| plugin-legacy 默认会改写 HTML 自动注入 modern/legacy script                                       | 已有自定义 `htmlInjector()`，需关掉 plugin-legacy 的 HTML 注入（或让两者执行顺序明确），改由我们自己控制 |
| Modern ESM 下 Vue 共享 chunk 的实际形态                                                          | Step 6 build 完后实测，确认 `vendor/vue-*.js` 真的被多入口共享                       |
| Legacy SystemJS 产物相对路径解析与原生 import 不同                                                    | `_loader_res.js` 在 legacy 分支显式拼绝对 URL 再传给 `System.import`              |
| Modern 与 Legacy URL 推导规则                                                                 | `add(name, url)` 中保存 modern URL，legacy URL 由 `url.replace(/\.js$/, '-legacy.js')` 推导 |


## 决策检查点（阶段二完成后）

整理「迁移兼容性清单」交付给阶段三：

- `vite.config.js` 完整配置（可直接拷给原项目）
- `_loader_dev_shim.js` 完整实现（已覆盖原项目所有 `_loader.add` / `_loader.use` 调用形态）
- HTML/PHP 模板的最小改动清单（占位符 + 环境判断）
- `@vitejs/plugin-legacy` 与自定义 `collectPolyfillsPlugin` 的产物差异说明
- 原项目中可能踩坑的边界 case 列表

## 关键技术决策记录


| 决策                  | 选择                                           | 理由                   |
| ------------------- | -------------------------------------------- | -------------------- |
| Dev 环境 `_loader` 处理 | Shim 拦截 `window._loader.use`                 | 业务代码零改动，HMR 完整       |
| 模块名 → 路径映射          | URL 反推 + 显式覆盖兜底                              | 零维护，特殊模块仍可手动声明       |
| HTML 模板区分 dev/prod  | 单 HTML + Vite plugin transform 注入            | 接近未来 PHP 模板的处理方式     |
| 生产产物格式（Modern）      | **ESM**（不再 IIFE）                             | 共享 vendor chunk 跨入口去重 Vue，享受 Vite tree-shake / code-split |
| 生产产物格式（Legacy）      | **SystemJS**（plugin-legacy 默认）               | IE 上保留 ESM 语义、仍能 code-split；多付 ~3KB runtime |
| Polyfill            | `@vitejs/plugin-legacy`                      | 官方维护，替换自定义插件         |
| Vue 依赖              | **不 external，纳入依赖图**                         | Modern 端共享 chunk 自动去重 + tree-shake，比 external 体积更小 |
| `_loader_res.js`    | **改造 add / use 做能力检测分流**（其他 API 保留）          | 用户裁定阶段三 `_loader_res.js` 可改 |


---

# 阶段三方向参考：分层加载架构

> 阶段三在原项目落地，不在 mock 范围内。本节作为方向锚点：阶段二的 shim 设计本质上是这套架构在 dev 期的体现，阶段三只需把这个分工推广到生产即可。

## 核心问题：IE 兼容下，jQuery 等全局库怎么办

ESM 迁移有两个互相独立的层面，容易混在一起：

1. **模块系统**：业务代码用什么格式分发（ESM vs IIFE）
2. **运行时依赖**：jQuery、Vue 这些库本身能不能在 IE 上跑

`@vitejs/plugin-legacy` 只解决第 1 个问题——通过 `<script type="module">` + `<script nomodule>` 双发，业务代码在 IE 上走 ES5 IIFE 版本。

但 jQuery 等全局库本身**就是 UMD/IIFE 格式，从来不是 ESM**——它不存在"迁移到 ESM"这件事。硬塞进 Vite 依赖图会带来：

- 每个 chunk 重复打包（体积爆炸），或
- 配 `external` 让它继续走全局（绕一圈又回到原点）

## 设计原则：按"模块类型"分层，而不是按"浏览器版本"分层

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: 全局运行时（所有浏览器都加载）                    │
│   <script src="jquery.min.js">                          │  ← 走"瘦身版 _loader" 或直接 <script>
│   <script src="solib-*.js">                             │
│                                                         │
│   IE 上额外加载：                                         │
│   <script src="polyfills-legacy.js">                    │  ← plugin-legacy 产物
├─────────────────────────────────────────────────────────┤
│ Layer 2: 业务模块（双发，浏览器自动二选一）                  │
│   现代浏览器：                                            │
│     <script type="module" src=".../searchbox.esm.js">   │
│   IE：                                                   │
│     <script nomodule src=".../searchbox-legacy.js">     │
└─────────────────────────────────────────────────────────┘
```

**核心思路**：

1. **全局库（jQuery、solib-* 等）的加载方式不变**——它们本来就不是 ESM，不需要"迁移"，继续走 `<script>` 标签挂全局
2. **业务代码走 ESM 双发**——Vite + `plugin-legacy` 自动产出现代/legacy 两套，浏览器按能力自动选择
3. **`_loader` 不是被消灭，而是被收窄职责**——只管全局库与第三方 SDK，不再管业务模块

## 与阶段二 shim 的对应关系

阶段二的 `_loader_dev_shim` 内部已经做了这个分工：

```js
var bizNames = list.filter(function (n) { return devUrlMap[n]; });  // → import()
var libNames = list.filter(function (n) { return !devUrlMap[n]; }); // → origUse
```

这个 `bizNames` vs `libNames` 的分流**不只是 dev 期的权宜**，正是阶段三的最终态。

## 迁移目标的重新表述

| 旧目标               | 新目标                                          |
| ----------------- | -------------------------------------------- |
| 干掉 `_loader`      | 把 `_loader` 从"业务模块加载器"退化为"全局库加载器"            |
| 业务 + 库都走 ESM 依赖图  | 业务走 ESM 依赖图，库继续走全局 `<script>`                |

新目标的实施风险显著低于旧目标：

- IE 上 jQuery 老业务代码（散落的内联 `<script>`、独立 JS 文件）完全照常工作，因为它们引用的 `window.jQuery` 由 Layer 1 提供
- 现代浏览器享受 ESM + HMR + tree-shaking 全套
- `_loader` 代码量大幅缩减（保留注册/去重/缓存能力，删除"模块依赖图"相关逻辑），迁移粒度可控


## 阶段三落地方案：Manifest + PHP 风格 B

Vite 构建（开启 `build.manifest: true` 且恢复 hash）后，产物路径无法硬编码。生产 PHP 渲染 HTML 的最佳实践是读取 `manifest.json`。

**核心决策：采用风格 B（PHP 注入 Manifest + `_loader` 查表）**。

```php
<script>
  window.__ASSET_MANIFEST__ = <?= json_encode($manifest) ?>;
</script>
<script src="_loader_res.js"></script>
<script>
  // 业务侧调用代码零改动！只传逻辑名
  _loader.add('home-searchbox', 'home/searchbox');
  _loader.use('home-searchbox', cb);
</script>
```

**为什么选风格 B？**
1. **HTML 模板与业务代码零侵入**：原有的上百个 `_loader.use` 回调模式完全不需要改写。
2. 相比"PHP 直接渲染 `<script type=module>`"（风格 C），风格 B 风险最小，最适合平稳过渡，晚期再考虑切风格 C。
3. **统一解决 CSS 加载**：Manifest 提供了入口对应的 `css: [...]` 字段，PHP 端在入口 script 渲染前统一渲染 `<link>`，不需要 `_loader` 自己发网络请求拉 CSS。

**需要配合的改造（mock 需预演）**：
1. plugin-legacy 产物（`*-legacy.js`、`polyfills-legacy.js`）默认可能不进标准 manifest。需写一个 `manifest-unify` 插件在 `closeBundle` 阶段将其合并进去。
2. `_loader_res.js` 需改造：`add(name, ...)` 支持接收"逻辑名"，然后去 `window.__ASSET_MANIFEST__` 表里获取对应的 modernURL、legacyURL 等。

## 阶段三需要确认的事项

- 原项目中 `_loader.add` / `_loader.use` 的调用统计：业务模块 vs 全局库的实际比例
- 全局库清单：jquery、require、solib-* 之外还有哪些必须保留为全局
- PHP 模板读取 Vite `manifest.json` 的方案（业务模块的 hash URL 注入）
- IE 用户占比与"是否真的要保留 nomodule 兜底"的产品决策


---

# 阶段二进度记录

> 给下一个接手的 agent：这一节记录当前实际进度，而不是计划。开始工作前先读这里，再回头对照前面的 Step 1-6 章节。

## 已完成

### Step 1 — 单模块跑通 Vite + HMR ✅（已 commit: `2ee8d0e`）

- 安装：`vite ^8.0.12`、`@vitejs/plugin-vue ^6.0.6`（devDependencies）
- 新建 `vite.config.js`（最小配置：`root: '.'`、`server.port: 5173`、`plugins: [vue()]`）
- `package.json` 新增 `"dev:vite": "vite"` 脚本（保留原 `dev`/`build`/`serve`，便于和 rollup 对比）
- Vue 在 dev 阶段走 `node_modules` 解析（`import 'vue'`），不走 CDN；prod 阶段再切回 external
- 验收已通过：浏览器 `http://localhost:5173/pages/_dev_searchbox.html`，`Counter.vue` 改动触发组件级 HMR、count 状态保留

### Step 2 — 多入口扫描 ✅（**未单独 commit**，代码已随 Step 1 一并入库）

- `vite.config.js` 实现了 `scanModules()` 扫描 `dev/home/*`、`dev/result/*`，外加 `homeAI` 单文件特例
- 当前 input map：
  | key                    | source                              |
  | ---------------------- | ----------------------------------- |
  | `home/searchbox`       | `dev/home/searchbox/index.js`       |
  | `home/skin`            | `dev/home/skin/index.js`            |
  | `result/ai-searchbox`  | `dev/result/ai-searchbox/index.js`  |
  | `homeAI/homeAI`        | `dev/homeAI/main.js`                |
- key 用 `<area>/<name>` 形式，对齐原 rollup 产物路径 `resource/js/dist/<area>/<name>.js`
- **build 验证已通过**（2026-05-13）：`npx vite build` 顺利识别并编译 4 个入口，产物默认落在 `dist/assets/` 下并带 hash，Vue 被打进 bundle（`runtime-dom.esm-bundler-*.js` 61.21 kB）。这些"偏差"已知，留给 Step 6 修正。

### Step 3 — 实现 `_loader_dev_shim.js` ✅（已 commit: `10e6fb0`）

- 新建 `resource/js/common/_loader_dev_shim.js`，按 CLAUDE.md 模板实现：
  - 拦截 `_loader.add`：兼容字符串与 `{ stc: '...' }` 两种形态，用正则反推 dist URL → dev URL，写入内部 `devUrlMap`，然后回调原 `add` 保留老 `_loader` 状态
  - 拦截 `_loader.use`：按 `devUrlMap` 命中与否将依赖列表分流为 `bizNames`（走 Vite 动态 import）与 `libNames`（回交原 `_loader`），库先于业务加载，业务用 `Promise.all` 保序后再触发 callback

### Step 4 — HTML transform 插件 ✅（已 commit: `10e6fb0`）

- `vite.config.js` 增加 `htmlInjector()` 插件，根据 `ctx.server != null` 判断 dev/prod：
  - **dev**：注入 `_loader_res.js` + `_loader_dev_shim.js`（不注入 Vue CDN，dev 走 `node_modules`）
  - **prod**：注入 Vue CDN + `_loader_res.js`（不注入 shim）
- `pages/home.html`、`pages/result.html` 内的硬编码 `<script>` 已删除，替换为 `<!--LOADER-->` 占位符

### Step 5 — 完整 dev 流程验证 ✅

- `pages/home.html` 与 `pages/result.html` 端到端跑通：业务模块通过 shim → `import()` 加载，HMR 在浏览器实测生效
- 期间踩过两个坑（已修复，记录在下方"重要上下文"）：
  1. **正则只匹配绝对路径**：原模板用 `../resource/js/dist/...` 这种相对路径，正则放宽去掉 `^/` 限制后通过
  2. **Vite 给 shim 文件头部注入了顶层 `import`**：因为 shim 里写了字面量 `import()`，Vite 静态分析后把它当 ESM 处理，导致 `<script>`（非 module）首行报 `Cannot use import statement outside a module`。改用 `new Function('url', 'return import(url)')` 隐藏字面量后解决

### Step 6a-6b — vite.config 接入 plugin-legacy + dist-vite 输出 ✅（已 commit: `630d1f9`）

- `vite.config.js`：`build.outDir = 'resource/js/dist-vite'`、`entryFileNames=[name].js`、`chunkFileNames=vendor/[name]-[hash].js`、`assetFileNames=assets/[name]-[hash][extname]`、`emptyOutDir=true`
- 接入 `@vitejs/plugin-legacy`：`targets:['defaults','not IE 11']`、`renderLegacyChunks:true`、`polyfills:true`、`modernPolyfills:false`
- Vue **不**走 external，纳入依赖图（确认 `vendor/runtime-dom.esm-bundler-*.js` 共享 chunk 生成，约 61 kB）
- `npx vite build` 跑通：4 个入口 → 8 个产物（modern + legacy）+ 1 份 polyfills-legacy + 1 份 systemjs runtime + vendor chunk

### Step 6c — `_loader_res.js` 双发改造 + HTML 切到 dist-vite ✅（已 commit: `65b1f40`）

- `_loader_res.js`：
  - 新增 `supportsModule = 'noModule' in HTMLScriptElement.prototype` 能力检测
  - 新增 `BIZ_DIST_PATTERN = /resource\/js\/dist(?:-vite)?\/[^\/]+\/[^\/]+\.js/`，与 dev shim 反推规则一致
  - `add(name, url)`：业务 URL 登记到 `bizModules` 表（同时存 modernUrl + legacyUrl，legacy 由 `url.replace(/\.js(\?.*)?$/,'-legacy.js$1')` 推导），不进 `modules` 表；非业务 URL 维持原逻辑；兼容 `{ stc: '...' }` 对象形态
  - `use(names, cb)`：拆 `bizNames` / `libNames`；biz 走 `dynamicImport(modernUrl)` 或 `System.import(toAbsoluteUrl(legacyUrl))`；混合时库先于业务，业务用 `Promise.all` 保序后再 callback
  - 其他 API（addAll、loadCss 等）保留不动
- `_loader_dev_shim.js`：反推正则放宽为 `dist(?:-vite)?`，兼容两种产物路径
- `pages/home.html`、`pages/result.html`：4 处 `_loader.add` URL 全部从 `dist/` 切到 `dist-vite/`

### Vitest 引入 — 单测覆盖核心分流逻辑 ✅（已 commit: `3045c71`）

- 安装 `vitest ^4.1.6` + `jsdom ^29.1.1`；`package.json` 加 `test` / `test:run` 脚本
- `vitest.config.js`：jsdom 环境，URL 设为 `http://localhost:3000/`
- `tests/helpers.js`：用 `new Function('window', SRC)(window)` 在 jsdom 里注入 `_loader_res.js` / `_loader_dev_shim.js`，提供 `setupGlobals` / `setSupportsModule` / `loadLoaderRes` / `loadDevShim` / `resetLoader` / `tick` 等工具；桩 `XMLHttpRequest` 防止 `_loader.use('jquery',…)` 触发真实网络
- `tests/_loader_res.test.js` + `tests/_loader_dev_shim.test.js`：覆盖 `add` / `use` 在 modern + legacy + dev 三条路径下的分流行为，混合 biz+lib 顺序保证，dev shim 完全覆盖原 use 不触发能力检测分支
- 测试钩子模式：两个 loader 末尾都有 `if (window._LOADER_TEST) { window._loader.__test__ = {…} }` / `__test_dev__`，用 getter/setter 暴露 IIFE 内部状态（`bizModules` / `devUrlMap` / `dynamicImport` 可被 mock 替换）

### Step 6d — HTML 静态注入 nomodule polyfills + 修复 modern URL 解析 ✅（已 commit: `24e2942`）

- `pages/home.html`、`pages/result.html`：静态写入 `<script nomodule src="../resource/js/dist-vite/polyfills-legacy.js">` + `<script src="../resource/js/common/_loader_res.js">`
- `vite.config.js htmlInjector()`：prod 分支变 no-op（HTML 已静态写好），dev 分支只注入 `_loader_dev_shim.js`；移除 Vue CDN 注入（Vue 现在纳入 vendor chunk）
- `_loader_res.js` modern 路径修复：`new Function('u','return import(u)')(url)` 里 import 的 base URL 是定义这个 Function 的脚本（`_loader_res.js` 自身）所在目录，不是 `document.baseURI`，导致相对路径 `../resource/...` 被错误解析成 `/resource/js/resource/js/...`。修复：modern 分支也走 `toAbsoluteUrl()`，与 legacy 分支一致
- `_loader_res.js` 调试开关：`?forceLegacy=1` query 强制 `supportsModule = false`，方便在现代浏览器测试 SystemJS 分支
- `package.json`：新增 `build:vite` 脚本（保留 `build` 走 rollup 做基线对比）；`serve` 加 `--no-clean-urls` 防止 query 被 redirect 丢掉
- 单测断言更新：业务模块测试 expected URL 从相对路径改为 `new URL(..., document.baseURI).href` 绝对形态

### Step 6e — 浏览器双场景实测 + dev 回归 ✅

实测三条路径都通过：

1. **Dev（HMR）**：`npm run dev:vite` → `http://localhost:5173/pages/home.html`，业务模块加载 + Counter HMR OK
2. **Prod modern**：`npm run build:vite` → `npx serve . -l 3000` → `http://localhost:3000/pages/home.html`，modern bundle + vendor chunk 加载，业务渲染 OK
3. **Prod legacy**：同上 URL 加 `?forceLegacy=1`（开关 + `--no-clean-urls` 双重保证 query 不丢），SystemJS 分支加载 polyfills-legacy + 各 `*-legacy.js` 入口 + legacy vendor chunk，业务渲染 OK

## 当前状态快照（截至 2026-05-14）

- 生产构建链路（Modern ESM + Legacy SystemJS 双发）端到端全通，modern + legacy + dev 三条路径浏览器实测 OK
- `_loader_res.js` 能力检测分流稳定，modern/legacy URL 解析一致（调用加载器前统一走 `toAbsoluteUrl`），`?forceLegacy=1` 调试开关到位
- CSS 轻量验证已完成：`build.manifest: true` 输出 manifest，`scripts/render-mock-pages.mjs` 读取各入口 `css: [...]` 字段，生成 `pages-rendered/*.html` 注入 `<link>`
- 单测 23/23 全绿，核心分流路径有断言保护
- **未做**：迁移兼容性清单交付
- 原 rollup 链路仍可用：`npm run build` 产 `dist/`，`npm run build:vite` 产 `dist-vite/`，两套并存方便对比

## 阶段二收尾记录

### 1. CSS 处理（Step 6f）✅

本轮按“轻量验证 manifest + CSS 注入方向”收尾，完整 hash manifest 架构留到阶段三。

已完成：
- `vite.config.js` 开启 `build.manifest: true`，保持当前稳定 JS 文件名（不恢复 JS hash）。
- `pages/home.html`、`pages/result.html` 增加 `<!--CSS_LINKS-->` 占位符，仅用于 mock 渲染。
- 新增 `scripts/render-mock-pages.mjs`，读取 `resource/js/dist-vite/.vite/manifest.json` 中 modern entry 的 `css: [...]` 字段，生成 `pages-rendered/home.html`、`pages-rendered/result.html`。
- `npm run build:vite` 现在执行 `vite build && node scripts/render-mock-pages.mjs`，构建后输出：
  - `pages-rendered/home.html`：注入 3 个 CSS link（searchbox、skin、homeAI）
  - `pages-rendered/result.html`：注入 1 个 CSS link（ai-searchbox）

结论：
- CSS 不进入 `_loader_res.js` 职责；生产应由模板层/PHP 读取 manifest 后渲染 `<link>`。
- modern 与 legacy JS 双发可以共用同一份 CSS 产物；legacy 不需要单独设计 CSS 加载链路。
- 阶段二不做 `_loader.add(name, logicalEntry)`、hash manifest 查表、legacy/polyfills manifest 合并，这些进入阶段三。

### 2. 迁移兼容性清单交付（Step 6g）

整理交付阶段三（见上文「决策检查点」章节）：

- `vite.config.js` 完整配置（可直接拷给原项目）
- `_loader_dev_shim.js` 完整实现（已覆盖原项目所有 `_loader.add` / `_loader.use` 调用形态）
- HTML/PHP 模板的最小改动清单（`<!--LOADER-->` 占位符 + nomodule polyfills 静态写入 + `<link>` CSS 注入）
- `@vitejs/plugin-legacy` 与自定义 `collectPolyfillsPlugin` 的产物差异说明
- `_loader_res.js` 的双发改造 diff（modern URL 必须 `toAbsoluteUrl`，`?forceLegacy=1` 调试开关）
- 原项目中可能踩坑的边界 case 列表（汇总下文「重要上下文」）

## 重要上下文 / 容易踩的坑

1. **`npm run serve` 的根目录是项目根，不是 `pages/`**：`package.json` 里是 `npx http-server . -p 3000 -c-1`，所以老链路验证时访问 `http://localhost:3000/pages/home.html` 或 `http://localhost:3000/pages-rendered/home.html`（不是根路径 `/home.html`）。`pages/*.html` 里用的是 `../resource/...` 相对路径，根目录必须是项目根才能解析到。

2. **shim 内禁止出现字面量 `import()`**：因为 shim 是普通 `<script>`（非 module），Vite 又会对内含 `import` 关键字的文件做 ESM 改写并在头部注入 `/@vite/client`。当前实现已用 `new Function('url', 'return import(url)')` 规避，后续若改动此文件务必保持这个规避手法。

3. **shim 的 dist→dev 反推正则必须兼容相对路径**：原项目模板里 `_loader.add` 传的可能是 `../resource/js/dist/...`、`/resource/js/dist/...` 或绝对 URL，正则不要锁死开头的 `/`。当前实现已放宽。

4. **Vue 不再走 CDN external**：dev 与 prod 都把 Vue 纳入 Vite 依赖图；prod 由 Vite 抽到 shared vendor chunk，modern/legacy 各有一份运行时 chunk。`htmlInjector()` 现在只负责 dev 阶段注入 `_loader_dev_shim.js`。

5. **阶段三方向已和阶段二 shim 设计对齐**：见上一章"分层加载架构"。`_loader_dev_shim` 里 `bizNames` / `libNames` 分流的语义就是阶段三的最终态。

6. **commit 习惯**：用户偏好中文 commit message，参考已有 `阶段二 Step 1: 引入 Vite + 单模块 HMR`、`阶段二 Step 3-5: 实现 dev shim 拦截及 HTML 注入插件`。每个 Step 完成后用户会主动要求 commit，不要自动提交。

7. **执行前确认**：涉及 npm install、commit、删除文件等动作前需要先和用户确认，不要直接动手。

8. **`_loader_res.js` 是 CRLF 行尾**：Edit 工具按字面匹配，CRLF 文件必须用 CRLF 串去匹配；用 sed/awk 改写时也要保留 `\r`。`_loader_dev_shim.js` 是 LF，不混淆。

9. **测试钩子模式 (`window._LOADER_TEST` + `__test__`)**：两个 loader 末尾的 `if (window._LOADER_TEST) { window._loader.__test__ = {…} }` 是单测专用反射出口。规则：
   - 默认门控关闭（生产 `_LOADER_TEST` 未定义，整段不执行，0 副作用）
   - 用 getter 暴露 IIFE 局部变量的当前值；用 setter 让测试替换可变绑定（如 `dynamicImport` 用 `vi.fn()` mock 后断言被调用的 URL）
   - dev shim 里的 `dynamicImport` 已从 `use` 函数内提到 IIFE 顶层，**就是为了让 setter 能改到它**；后续重构若再次内联，记得同步改测试钩子

10. **commit 拆分习惯**：用户偏好 per-substep commit。需要把混杂改动拆 commit 时，路径示例：
    - 备份完整文件到 `/tmp`（注意 `/tmp` 跨 turn 可能被清掉，**不要依赖**，宁可在内存里记下要恢复的内容）
    - 用 sed/awk 或 Edit 工具临时剥出某子集 → `git add` 子集 → commit
    - 从备份恢复 → `git add -A` 剩下的 → commit

11. **方案 C（手动 HTML 改动）的代价**：mock 项目可以接受。生产 PHP 项目接手后必须换成 closeBundle 或 manifest 渲染方案，不能保留方案 C；这是「mock 项目宽容化」的一次取舍，不要回流到迁移兼容性清单里推荐。

12. **`new Function('u','return import(u)')(url)` 的 import base URL 是脚本自身路径，不是 `document.baseURI`**：这是踩过的最隐蔽的坑。在 `_loader_res.js`（位于 `/resource/js/common/`）里调用，传入相对路径 `../resource/js/dist-vite/...`，会被解析成 `/resource/js/resource/js/dist-vite/...`（从 `_loader_res.js` 所在目录回溯）。修复办法：`loadBizModule` 在调用 `dynamicImport` / `System.import` 之前统一执行 `toAbsoluteUrl(url) = new URL(url, document.baseURI).href`。dev shim 那边因为是 vite dev server 注入的 `<script>`，base 又是 page URL，看上去像没事——其实是巧合，规则上 modern/legacy/dev 三条都该统一过 `toAbsoluteUrl`。

13. **静态服务器不要丢 query**：`?forceLegacy=1` 依赖 query 保留。当前 `npm run serve` 使用 `http-server -c-1`，访问 `/pages-rendered/home.html?forceLegacy=1` 可以保留 query 并测试 legacy 分支。若临时换回 `serve` 包，需要关闭 clean URLs，否则可能 301 后丢掉 query。

14. **测 SystemJS 分支用 `?forceLegacy=1` 而非真旧浏览器**：Chrome DevTools 没有"关闭 ESM 支持"开关，IE11 VM/BrowserStack 又太重。`_loader_res.js` 加了一行 `var forceLegacy = /[?&]forceLegacy=1\b/.test(location.search); var supportsModule = !forceLegacy && ('noModule' in HTMLScriptElement.prototype);`，在现代浏览器加 `?forceLegacy=1` 即可强制走 SystemJS 分支。这是 mock 项目的调试便利开关，**生产项目接手时要决定是删掉、还是改成 `__forceLegacy__` 之类的非公开 hook**——保留在生产对真实用户无害但属于"测试代码进生产"，看团队规范。
