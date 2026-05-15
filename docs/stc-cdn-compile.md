# 燕尾服编译（STC）：CDN 上传与模板路径重写

本文档说明项目构建链中 "燕尾服编译" 这一步骤的执行逻辑，以及它对静态资源路径与 PHP 模板的约束。**面向正在做 rollup → vite 迁移的同事**：在你改动前端打包链路前，务必先理解本文档列出的"契约"，否则会破坏线上 CDN 资源解析。

---

## 1. 这一步在做什么

把本地 PHP 模板里出现的 `/resource/...` 路径，替换为 CDN 上的指纹化地址。

构建前（源码）：

```php
<?php if ($show_ai_searchbox) { ?>
    _loader.add('searchbox_ai', { stc: '/resource/js/dist/home/ai-searchbox.js' }.stc);
    _loader.use('vue3.3.9,searchbox_ai', function () { });
<?php } ?>
```

构建后（产物）：

```php
<?php if ($show_ai_searchbox) { ?>
    _loader.add('searchbox_ai', "https://ss5.360tres.com/ssl/3531e8db14bb028f/dist/home/ai-searchbox.js");
    _loader.use('vue3.3.9,searchbox_ai', function () { });
<?php } ?>
```

注意两点：
- `{ stc: '...' }.stc` 这种"用对象字面量取属性"的写法是 STC 识别替换点的一种约定，替换后变成纯字符串。
- URL 含内容指纹（`3531e8db14bb028f`）和多域名分片（`ss1..ss5.360tres.com`）。

---

## 2. 项目结构速览（rollup 时代实况）

迁移 agent 在 mock 项目中工作，本节给出主仓库的真实路径与约定，所有"必须保持不变"的契约都基于这里。

### 2.1 顶层目录

```
local.so.com/
├── application/views/        # PHP 模板（STC 扫描+重写的对象）
│   ├── home/                 # 首页模板：index.php、include/*.php
│   ├── home_ai/
│   ├── index/、pandora/、wallpaper/、browser/、cache/、error/
│   ├── http/、https/         # ← STC 编译产物（双 schema），构建前会清空
├── dev/                      # 前端源码（rollup 的输入）
│   ├── home/                 # 每个子目录一个业务模块
│   │   ├── ai-searchbox/index.js
│   │   ├── aitools/index.js
│   │   ├── searchbox/index.js
│   │   └── skin/index.js
│   ├── homeAI/main.js
│   ├── result/<module>/index.js
│   ├── polyfill_home.js      # polyfill 入口（home 系列共用）
│   └── polyfill_result.js    # polyfill 入口（result 系列共用）
├── resource/                 # 静态资源根（STC 上传 CDN 的对象）
│   ├── js/
│   │   ├── dist/             # ← rollup 产物落点
│   │   │   ├── home/ai-searchbox.js, aitools.js, searchbox.js, skin.js,
│   │   │   │   polyfill_home.min.js
│   │   │   ├── homeAI/homeAI.js
│   │   │   └── result/<module>.js, polyfill_result.min.js
│   │   ├── home/             # 手写的非打包 JS（含 card/loader.js）
│   │   ├── result/           # 手写的非打包 JS（含 news-flow/loader.js）
│   │   ├── common/、lib/、browser/、debug/、jqueryplus/、platform/
│   │   └── guanjia.js、qhcs.js、shaonian.js、MMPlugin.js
│   ├── css/、img/、html/
│   └── http/、https/         # ← STC 编译产物，构建前会清空
├── rollup/
│   ├── rollup.config.mjs     # 基础配置（被 dev/prod 复用）
│   ├── rollup.config.dev.mjs
│   └── rollup.config.prod.mjs
├── scripts/
│   └── rollup-plugin-polyfills.js   # 项目自研 polyfill 收集插件
├── build/
│   ├── build.sh、build_node.sh
│   ├── config_http.php、config_https.php
│   └── package.sh、autotest.sh
└── package.json、Makefile
```

### 2.2 前端打包入口与产物（rollup.config.mjs）

`rollup/rollup.config.mjs` 用 `readdirSync` **按目录自动生成**业务模块配置：

| 源 | 产物 | 说明 |
| --- | --- | --- |
| `dev/home/<m>/index.js` | `resource/js/dist/home/<m>.js` | home 系列业务 |
| `dev/result/<m>/index.js` | `resource/js/dist/result/<m>.js` | result 系列业务 |
| `dev/homeAI/main.js` | `resource/js/dist/homeAI/homeAI.js` | 单独配置 |
| `dev/polyfill_home.js` | `resource/js/dist/home/polyfill_home.min.js` | home 系列共享 polyfill |
| `dev/polyfill_result.js` | `resource/js/dist/result/polyfill_result.min.js` | result 系列共享 polyfill |

打包细节：
- 输出 `format: 'iife'`，挂到 `window`（`context: 'window'`）。
- `external: ['vue']`、`globals: { vue: 'Vue' }` —— **vue 不打进 bundle，运行时从全局 `Vue` 取**，与 `_loader.use('vue3.3.9,...')` 协作（页面先 loader 加载 vue，再加载业务包）。
- 业务模块走基础插件（resolve、commonjs、json、vue、stringHtml include `dev/**/*.html`、node-polyfill）。
- 生产构建（`rollup.config.prod.mjs`）额外：`@rollup/plugin-replace`（NODE_ENV）、`rollup-plugin-postcss`（less + simple-vars + nested + cssnano + autoprefixer）、`@rollup/plugin-babel`（`preset-env`，`targets: { ie: 10 }`，`useBuiltIns: false`）、`@rollup/plugin-terser`（`mangle: false`、剥除 console.log）、`filesize`。
- **自研 polyfill 收集插件** `scripts/rollup-plugin-polyfills.js` 暴露两个钩子：
  - `collectPolyfillsPlugin({ targets, output })`：在每个业务模块编译时扫描需要的 polyfill，**集中收集**到 `dev/polyfill_{home|result}.js`。
  - `cleanupPolyfillIntermediate({ filePath })`：polyfill bundle 打完后清理 `dev/polyfill_*.js` 中间产物。
  - 每个业务模块的 `output.polyfill_path` 字段用来传参给 `collectPolyfillsPlugin`，在传给 rollup 前由 prod 配置 `delete` 掉，避免 rollup 报未知字段。
  - 业务模块的 `polyfill_module` 字段标识它归属于 HOME 还是 RESULT 阵营，决定 polyfill 写到哪个聚合文件。
- 命令：`yarn dev`（watch，dev.mjs）/ `yarn build`（一次性，prod.mjs）；后者在 `Makefile` 的 `fe-build`/`fe-init` 中被 docker centos 镜像调用。

### 2.3 模板里的资源引用形式

STC 主要识别 `{stc: '/resource/...'}.stc` 这种字面量。真实样例（来自 `application/views/home/`）：

```php
// application/views/home/index.php:389
_loader.add('card-loader',   { stc: '/resource/js/home/card/loader.js' }.stc);

// application/views/home/index.php:394
_loader.add('searchbox_ai',  { stc: '/resource/js/dist/home/ai-searchbox.js' }.stc);

// application/views/home/include/ai_modules.php
_loader.add('ai_multitool_searchbox', {stc: '/resource/js/dist/home/searchbox.js'}.stc);
_loader.add('ai_searchbox_button',    {stc: '/resource/js/home/ai_searchbox.js'}.stc);
_loader.add('aitools',                {stc: '/resource/js/dist/home/aitools.js'}.stc);
```

关键观察：模板同时引用 **dist 产物**（`/resource/js/dist/home/*.js`，由前端打包生成）和 **手写非打包 JS**（`/resource/js/home/*.js`、`/resource/js/home/card/loader.js`、`/resource/js/result/news-flow/loader.js` 等）。两类文件**都会**被 STC 上传 CDN 并改写——前端打包工具**只负责前者**。

---

## 3. 执行链

1. `make stc` → `build/build.sh $(PWD)`（见 `Makefile` 中 `stc:` 目标）
2. `build/build.sh` 顺序：
   1. `clear_before_build`：清理 `output/`、`output_http/`、`output_https/`、`application/views/http`、`application/views/https`、`resource/http/`、`resource/https/`
   2. `node_resource_backup`：备份 `resource/js/home/card/loader.js`、`resource/js/result/news-flow/loader.js` 到 `output/`
   3. `node_compile`：在 centos 镜像里跑 `build/build_node.sh`，输出前端产物（`resource/js/dist/...` 等）
   4. `stc_compile`：并行跑 `http` 与 `https` 两个 schema 的燕尾服编译
   5. `node_resource_reset`：把第 2 步备份的两个 `loader.js` 恢复回 `resource/js/`
3. 燕尾服编译核心调用（`build/build.sh:71` 附近）：

   ```sh
   docker run --rm --user $(id -u) \
     -v ~/.STC/data:/home/q/php/STC/data \
     -v "$path":/app -w /app \
     r.so.qihoo.net/qssweb/stc:latest \
     /app www.so.com online build/config_${schema}.php output_${schema}
   ```

   - 实际的"扫描 → 上传 CDN → 重写路径"逻辑**在 `r.so.qihoo.net/qssweb/stc` 镜像内部**，不在本仓库。
   - 本仓库提供输入：源码、`build/config_http.php`、`build/config_https.php`。
4. 编译产物移动：
   - `output_${schema}/application/views` → `application/views/${schema}`
   - `output_${schema}/resource` → `resource/${schema}`
   - 删除 `output_${schema}` 临时目录

---

## 4. 控制替换行为的配置

每个 schema 一份：`build/config_http.php`、`build/config_https.php`。与 CDN 替换最相关的项：

| 配置 | 当前值 | 作用 |
| --- | --- | --- |
| `TPL_PATH` | `application/views/` | **被扫描/重写的 PHP 模板根目录** |
| `STATIC_PATH` | `resource/` | **会被上传 CDN 的静态资源根目录** |
| `MOD_STATIC_TO_CDN` | `true` | 总开关：把静态资源上线到 CDN |
| `JINGCHUANG_CDN_DOMAIN` | `https://ss$.360tres.com` | JS/CSS 主 CDN 域名模板，`$` 替换为分片号 |
| `JINGCHUANG_CDN_MULTI_DOMAIN` | `[1,2,3,4,5]` | JS/CSS 分片域名 |
| `TUCHUANG_CDN_DOMAIN` | `https://so$.360tres.com` | 图床域名模板 |
| `TUCHUANG_CDN_MULTI_DOMAIN` | `[1,2,3,4,5]` | 图床分片 |
| `MOD_JS_COMBINE` / `MOD_CSS_COMBINE` | `true` | 上传前合并 JS/CSS |
| `MOD_JS_COMPRESS` / `MOD_CSS_COMPRESS` | `true` | 上传前压缩 |
| `MOD_STATIC_VERSION` | `1` | 静态版本号策略：1 = query 参数；2 = 新文件名 |
| `STRING_REPLACE_PATTERN` | 见配置 | 顺带把 `qhres/qhimg/qhres2/qhmsg/quc.qhimg` 等旧域名重写成 `360tres.com` |
| `STATIC_TO_SSL` / `CDN_HTTPS` | `true`（https 配置中） | 强制 SSL |
| `MOD_JS_TPL_REPLACE` | `true` | 前端模板替换 |
| `MOD_STRING_REPLACE` | `true` | 启用 `STRING_REPLACE_PATTERN` |
| `MOD_EXTERNAL_TO_INLINE` | `true` | 外链资源转内联（小文件） |

> 想改 CDN 域名、分片数、是否压缩/合并、是否走 SSL —— 改这两份配置即可，**不要去改前端打包工具**。

---

## 5. 哪些路径会触发替换

只有同时满足以下两个条件的引用会被改写：

1. **资源源端**：文件物理位于 `resource/` 下；
2. **引用源端**：在 `application/views/` 下的 PHP 模板里，以 `/resource/...` 这样的路径形式被引用（或者被包装成 STC 识别的形式，例如 `{ stc: '/resource/...' }.stc`）。

**不会触发**的路径：
- `resource/http/`、`resource/https/`（产物目录，构建前会清空，源仓库不应有这些）
- `application/views/http`、`application/views/https`（产物目录，同上）
- `output/`、`output_http/`、`output_https/`（临时产物，构建前清空）
- 仓库其它目录：`api/`、`vendor/`、`public/`、`node_modules/` 等不在 `STATIC_PATH` / `TPL_PATH` 范围内
- 通过 JS 运行时动态拼接、未以字面量形式出现在模板里的路径（STC 是静态扫描，识别不了）

---

## 6. 与前端打包（rollup / 未来的 vite）的契约

**rollup → vite 迁移时必须维持以下约束，否则燕尾服编译会失败或线上 404。**

### 6.1 产物落点（精确路径，必须 1:1 对齐）

迁移后的 vite 配置必须输出与 rollup 完全一致的文件路径（项目根相对）：

| 源 | 必须输出到 |
| --- | --- |
| `dev/home/<m>/index.js` | `resource/js/dist/home/<m>.js` |
| `dev/result/<m>/index.js` | `resource/js/dist/result/<m>.js` |
| `dev/homeAI/main.js` | `resource/js/dist/homeAI/homeAI.js` |
| `dev/polyfill_home.js` | `resource/js/dist/home/polyfill_home.min.js` |
| `dev/polyfill_result.js` | `resource/js/dist/result/polyfill_result.min.js` |

- 入口列表是 `readdirSync(dev/home)` / `readdirSync(dev/result)` **动态枚举**出来的，新加目录就自动加产物。vite 侧也要保持这种"按目录自动入口"能力，否则每加业务都得改配置。
- 现有产物清单（截至迁移前）见 §2.2 表格。新增/删除模块时，回过头确认 `application/views/**/*.php` 里的 `{stc: '/resource/js/dist/...'}.stc` 引用全部对齐。

### 6.2 文件名：禁止内容哈希

- **不要在 vite 阶段做内容指纹哈希**（即不要 `entryFileNames: '[name].[hash].js'`）。指纹是燕尾服 STC 的职责（`MOD_STATIC_VERSION` 控制，当前值为 `1` = query 参数）。
- 如果 vite 输出 `ai-searchbox.[hash].js`，模板里 `'/resource/js/dist/home/ai-searchbox.js'` 字面量引用匹配不到任何文件，STC 会漏替换或报错。
- 不要让 vite 改写已存在的引用形式（`_loader.add('id', { stc: '...' }.stc)`），STC 依赖这个字面量识别替换点。

### 6.3 输出格式与外部依赖

rollup 当前使用：

```js
output: { format: 'iife', globals: { vue: 'Vue' } }
external: ['vue']
context: 'window'
```

- `iife` + `external vue`：业务包被 `_loader.use('vue3.3.9,xxx', cb)` 调度，`vue3.3.9` 这个 loader 提供全局 `Vue`，业务包从全局取。
- **vite 默认会把 vue 打进 bundle**，迁移时必须显式 `build.rollupOptions.external: ['vue']` + `output.globals: { vue: 'Vue' }`，并把 `build.lib.formats` 设为 `['iife']`（或 `build.rollupOptions.output.format = 'iife'`）。
- 由于历史降级目标是 `targets: { ie: 10 }`（rollup.config.prod.mjs:42），vite 默认 ES module/ESBuild 现代输出会不兼容。迁移时需要 `@vitejs/plugin-legacy` 或自定义 `build.target`，并保留 `core-js`/`regenerator-runtime` polyfill 路径。

### 6.4 Polyfill 拆分（最容易踩坑的一项）

rollup 时代用自研插件 `scripts/rollup-plugin-polyfills.js` 做了三件事：

1. 每个业务模块编译时扫描所需 polyfill，**集中写入** `dev/polyfill_home.js` 或 `dev/polyfill_result.js`（按 `polyfill_module: 'HOME' | 'RESULT'` 区分）。
2. 之后单独把这两个聚合文件以 `iife` 打成 `polyfill_home.min.js` / `polyfill_result.min.js`。
3. 打完清理 `dev/polyfill_*.js` 中间产物。

迁移注意：
- vite 没有等价机制，需要等价实现（自定义插件 / 用 `@vitejs/plugin-legacy` 但产物路径要重映射到上述五个文件名）。
- 不能简单地"每个业务模块自带 polyfill"——会大幅增加包体，且页面同时加载 home 多个模块会重复执行 polyfill 注入。
- 必须保留 home/result 两阵营的**共享 polyfill** 模型。

### 6.5 备份/恢复名单（硬编码在 build.sh 里）

`build/build.sh` 里有两条 cp 硬编码：

```sh
cp "${jsOriginPath}/home/card/loader.js"        "${jsBackupPath}/card.loader.js"
cp "${jsOriginPath}/result/news-flow/loader.js" "${jsBackupPath}/news-flow.loader.js"
```

它们在 node 编译"前"备份、"后"还原，目的是不让前端打包覆盖这两份手写的 loader。**这些是手写源文件，不是产物**——它们直接位于 `resource/js/home/card/loader.js` 和 `resource/js/result/news-flow/loader.js`，会被 STC 当作普通静态资源上传 CDN。

迁移时：
- 不要把 `resource/js/home/`、`resource/js/result/`（注意：是不带 `dist/` 的目录）当成可重建的产物目录而清空——里面有大量手写 JS。
- 如果改变这两个 loader 文件的位置或生成方式，务必同步改 `build/build.sh` 的 `node_resource_backup` / `node_resource_reset`（build.sh:34-50）。

### 6.6 不要绕过 STC 直接上传 CDN

CDN 的指纹、多域名分片、`/ssl/<hash>/` 这种前缀都是 STC 注入的。即便 vite 插件支持直传 CDN，也**不要**在前端构建阶段直接上传——会绕过 `~/.STC/data` 的缓存索引，导致灰度/回滚出问题。让 vite 只产出静态文件落到 `resource/`，CDN 上传交给 STC。

### 6.7 schema 双产物由 STC 负责

- STC 会跑两遍：`http` 和 `https`，分别产出 `application/views/http`、`application/views/https`、`resource/http`、`resource/https`。
- vite 自身**只需打一份**前端产物到 `resource/js/dist/`，schema 拆分是 STC 的事。

### 6.8 必须在 docker centos 镜像里能跑

`Makefile` 中的 `fe-build` 用 `r.so.qihoo.net/library/centos:7.4.1708` 镜像跑 `yarn build`。迁移后的 vite 仍要在这个老镜像里能跑——意味着对 Node 版本（centos 7.4 默认 Node 较老）、可执行的 npm 包二进制（如 esbuild 的原生二进制）要做兼容性确认。如果需要升级镜像，要同步改 `Makefile` 和 `build/build_node.sh`。

---

## 7. 排错指引

- 编译失败：查 `stc.error.log`（`build/build.sh` 末尾会判断并报错）。
- 替换没生效：先确认模板里的引用是 `/resource/...` 字面量；再确认对应文件已经被 node 编译输出到 `resource/` 下；最后确认 `MOD_STATIC_TO_CDN` 没被关。
- CDN 域名变了：改 `JINGCHUANG_CDN_DOMAIN` / `TUCHUANG_CDN_DOMAIN`，不要在 vite 里硬编码。
- 想看 `{ stc: '...' }.stc` 这种模板的具体识别规则：在本仓库**找不到**，需要看 `r.so.qihoo.net/qssweb/stc:latest` 镜像内部实现。

---

## 8. 一句话总结给迁移 agent

> vite 只负责把 `dev/{home,result,homeAI}/**` 的源码打包成 **无 hash 的 iife** 文件，落到 `resource/js/dist/{home,result,homeAI}/` 下对应文件名；vue 走 external+global；polyfill 维持 home/result 两阵营聚合产出 `polyfill_{home,result}.min.js`；不要直传 CDN、不要改模板里 `{stc: '...'}.stc` 的形式、不要动 `resource/js/home/`、`resource/js/result/` 这两批手写源文件。CDN 上传与模板路径重写**全部交给燕尾服 STC**。
