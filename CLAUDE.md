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

### Step 6：生产构建对齐

1. 写 `vite.config.js` 的 `build` 段，多入口 IIFE 输出
2. `external: ['vue']`，`globals: { vue: 'Vue' }`
3. 接入 `@vitejs/plugin-legacy`
4. 对比产物：`resource/js/dist/home/searchbox.js`（Vite vs Rollup）
  - 产物结构（IIFE 包裹）
  - external 处理（`window.Vue` 引用）
  - polyfill bundle 是否独立出来
5. 在浏览器中直接打开 `pages/home.html`（不走 dev server），验证 prod 产物可工作

## 已知风险与边界 case


| 风险点                                                                                     | 应对                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `_loader.add` 在原项目中传的是 `{ stc: '...' }.stc` 形式                                          | shim 中容错处理（已支持）                                                     |
| 库模块（jquery、require、solib-*）应继续走原 `_loader`                                              | shim 通过 `devUrlMap` 区分业务 vs 库                                       |
| `import()` 是异步的，原 `_loader.use` callback 也是异步的，但执行时机不完全一致                               | mock 中验证多模块顺序依赖场景，必要时用 `Promise.all` 保序                             |
| Vite dev server 的 ESM 模块带 query（`?import`、`?t=`），路径含 hash 时映射可能失效                       | 反推规则使用 url 主干，忽略 query                                              |
| `@vitejs/plugin-legacy` 输出的 polyfill bundle 文件名 hash 化，与现有 `polyfill_home.min.js` 路径不一致 | prod 配置中固定 `entryFileNames`，或在 PHP 模板侧通过 manifest 引用                |
| 多入口 IIFE 输出时，公共 chunk（splitChunks）如何处理                                                  | Vite 默认会拆 chunk，IIFE 模式下需禁用 manualChunks 或配置 `inlineDynamicImports` |


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
| 生产 IIFE 输出          | `build.rollupOptions` 多入口 + `format: 'iife'` | 兼容现有部署，无需改 `_loader` |
| Polyfill            | `@vitejs/plugin-legacy`                      | 官方维护，替换自定义插件         |
| Vue 依赖              | 保持 external + CDN                            | 不改部署，风险最低            |


