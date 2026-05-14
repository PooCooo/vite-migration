# Mock Vite Migration

验证 `local.so.com` 从 **Rollup/IIFE** 迁移到 **Vite** 的可行路径。

真实项目的架构是"PHP 模板通过 `_loader.add` / `_loader.use` 声明依赖，Rollup 打 IIFE 产物按需加载"。这个 mock 项目用静态 HTML + 真 PHP 模板模拟该架构，验证 Vite 能否在**不大改 PHP 调用形态**的前提下接管构建和 HMR。

---

## 已验证的三条链路

| 链路 | 入口 | 关键特性 |
|---|---|---|
| **Dev HMR** | `localhost:8000/pages-php/home.php` | PHP 注入 `@vite/client` + dev shim，修改 Vue SFC 无刷新更新 |
| **Prod Modern** | `localhost:8000/pages-php/home.php`（build 后） | ESM + code-splitting，CSS 由 PHP 读 manifest 注入 |
| **Prod Legacy** | 同上，加 `?forceLegacy=1` | SystemJS 产物，polyfills-legacy，兼容旧浏览器 |

---

## 快速开始

**前提：装有 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，无需本机安装 PHP 或 Node。**

### Dev 模式（含 HMR）

```bash
make dev
```

首次运行会拉取镜像并安装 npm 依赖，约 1–2 分钟。之后启动秒级。

启动后访问：

```
http://localhost:8000/pages-php/home.php    ← 主入口（PHP 模板 + Vite HMR）
http://localhost:8000/pages-php/result.php
```

> ⚠️ `pages-php/*.php` 必须通过 `:8000` 访问（PHP 容器）。`:5173` 是 Vite dev server，不执行 PHP，直接访问会显示 PHP 源码。

修改 `dev/` 下任意 Vue/JS 文件，浏览器无刷新即更新。

### Prod 模式

```bash
make build    # 构建，产物写入 resource/js/dist-vite/
make serve    # 启动 PHP 服务 prod 产物（无 MOCK_DEV，:8000）
```

验证 Legacy 链路：

```
http://localhost:8000/pages-php/home.php?forceLegacy=1
```

### 运行单测

```bash
make test     # 25 个用例，覆盖 _loader_res / _loader_dev_shim 核心分流逻辑
```

### 其他命令

```bash
make down        # 停止 dev 容器（保留 node_modules 卷，下次秒起）
make clean       # 停止 + 删除卷（重置 node_modules 时用，下次需重新安装）
make dev-build   # 重新构建镜像后启动（package.json 有变更时用）
```

---

## 项目结构

```
mock-vite-migration/
├── dev/                          # Vite 业务源码入口
│   ├── home/searchbox/index.js
│   ├── home/skin/index.js
│   ├── result/ai-searchbox/index.js
│   └── homeAI/main.js
│
├── pages/                        # 静态 HTML（直连 Vite :5173，无需 PHP）
│   ├── home.html
│   └── result.html
│
├── pages-php/                    # 真 PHP 模板（模拟原项目，主要验证对象）
│   ├── home.php
│   └── result.php
│
├── lib/
│   └── manifest.php              # PHP 端工具函数：manifest 查表、dev/prod 分支
│
├── resource/js/common/
│   ├── _loader_res.js            # 改造后的 loader：modern/legacy 分流
│   └── _loader_dev_shim.js      # Dev 专用：拦截 _loader.add/use，转接 Vite HMR
│
├── resource/js/dist-vite/        # Vite 构建产物（git ignored，make build 生成）
├── pages-rendered/               # Node 脚本生成的静态基线（git ignored）
│
├── tests/                        # Vitest + jsdom 单测
├── scripts/render-mock-pages.mjs # 读 manifest 生成 pages-rendered/*.html
├── rollup/                       # 原 Rollup 配置（保留作基线对比）
│
├── Dockerfile.vite               # Vite/Node 容器镜像
├── docker-compose.yml            # Dev 双容器编排（PHP + Vite）
├── Makefile                      # 常用操作快捷命令
└── docs/
    └── docker-network-and-volumes.md  # Docker 网络与 Volumes 原理
```

---

## 架构概览

### 为什么不继续打 IIFE？

IIFE 方案最省力，但收益最低——没有 HMR、没有 tree-shaking、没有 code-splitting。这个 mock 直接验证**目标态**：业务模块进 Vite，全局库不动。

### Dev 链路

```
PHP :8000 渲染 home.php
  └─ 注入 _loader_res.js
  └─ 注入 @vite/client（来自 Vite :5173）
  └─ 注入 _loader_dev_shim.js（来自 Vite :5173）
  └─ _loader.add('home-searchbox', 'http://localhost:5173/dev/home/searchbox/index.js')

浏览器执行 _loader.use('home-searchbox', cb)
  └─ dev shim 拦截，dynamicImport('http://localhost:5173/dev/...')
  └─ Vite 提供 ESM + HMR
```

### Prod 链路

```
PHP :8000 渲染 home.php（无 MOCK_DEV）
  └─ 注入 polyfills-legacy.js（<script nomodule>）
  └─ 注入 _loader_res.js
  └─ PHP 读 manifest → 注入 CSS <link>
  └─ _loader.add('home-searchbox', { stc: '...modern-hash.js', legacy: '...legacy-hash.js' })

浏览器执行 _loader.use('home-searchbox', cb)
  └─ _loader_res 检测 ES module 支持
  └─ Modern: dynamicImport(stc URL)   → ESM 产物
  └─ Legacy: System.import(legacy URL) → SystemJS 产物
```

### 关键分层原则

业务模块（`dev/` 下）进入 Vite，享受 HMR / tree-shaking / code-splitting。全局库（jQuery、soLib、第三方 SDK 等）**不进 Vite**，继续由 `_loader` 或 `<script>` 管理，保持 `window.jQuery` 等运行时契约不变。

### manifest 是 URL 的唯一来源

开启 hash 文件名后，modern 产物（`foo-<hash1>.js`）和 legacy 产物（`foo-legacy-<hash2>.js`）的 hash 独立，无法用字符串变换互相推导。PHP 模板通过两次 `manifest_url()` 查表分别获取两个 URL，注入 `_loader.add` 的 `{ stc, legacy }` 对象。

---

## 进一步阅读

| 文件 | 内容 |
|---|---|
| `CLAUDE.md` | 完整实现细节、阶段记录、关键难点与处理方式 |
| `MIGRATION_COMPATIBILITY_CHECKLIST.md` | 阶段三在原项目落地的迁移清单与风险点 |
| `docs/docker-network-and-volumes.md` | Docker 网络（namespace / veth / iptables）和 Volumes 底层原理 |
