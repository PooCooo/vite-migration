# Docker 网络与 Volumes 底层原理

## 一、容器隔离的基础：Linux 命名空间

Docker 的隔离能力来自 Linux 内核的 **network namespace**（网络命名空间）。每个命名空间有完全独立的：

- 网卡（network interface）
- 路由表
- iptables 规则
- 端口空间（0–65535）

容器启动时，Docker 为它创建一个新的 network namespace，使容器内进程看到的网络世界是一个独立副本，与宿主机和其他容器完全隔离。

```
宿主机 namespace              容器 A namespace       容器 B namespace
  eth0: 192.168.1.100           eth0: 172.17.0.2       eth0: 172.17.0.3
  lo:   127.0.0.1               lo:   127.0.0.1         lo:   127.0.0.1
  docker0: 172.17.0.1
```

`docker0` 是 Docker 在宿主机上创建的**虚拟网桥（bridge）**，作用类似家用路由器，负责同一网络内各容器之间的流量转发。

---

## 二、veth pair：容器与宿主机的"网线"

容器和宿主机通过 **veth pair**（虚拟网卡对）连接，两端各有一个虚拟网卡：

- 一端（`eth0`）插在容器的 namespace 里
- 另一端（`vethXXXX`）插在宿主机的 `docker0` 网桥上

```
容器内:                       宿主机内:
  eth0 (172.17.0.2)             vethXXXX ──── docker0 (172.17.0.1)
      │                             │
      └────── veth pair ────────────┘
```

数据流：容器发出 → `eth0` → 穿越 namespace 边界 → `vethXXXX` → `docker0` 网桥 → 路由 / NAT。

在宿主机执行 `ip link show`，Docker 运行时可以看到若干 `vethXxx` 接口，每个对应一个在运行的容器。

---

## 三、Docker Compose 网络：服务名 DNS

`docker compose up` 会自动创建一个**用户定义的 bridge 网络**，比 `docker0` 默认网络多一项能力：**内置 DNS 解析**。

每个服务名会自动注册到该网络的 DNS：

```
php  → 172.20.0.2
vite → 172.20.0.3
```

因此在 php 容器内执行 `curl http://vite:5173/` 是通的——`vite` 这个主机名会被解析成对应容器的 IP。

> 本项目中 PHP 容器不需要直接访问 Vite 容器。PHP 只是在 HTML 里输出了一个 URL，浏览器直接连宿主机端口转发即可，两个容器之间没有服务间通信。

---

## 四、端口转发（Port Forwarding）的实现

```yaml
ports:
  - "8000:8000"   # 宿主机端口:容器端口
```

背后是 **iptables DNAT（Destination NAT）规则**。

Docker 在宿主机 iptables 中加入规则：

```
访问宿主机 :8000 的流量
  → 目标地址改写（DNAT）
  → 容器 IP:8000（如 172.20.0.2:8000）
```

回包时反向做 SNAT（Source NAT），对调用方透明。

### 容器内必须监听 `0.0.0.0` 的原因

`0.0.0.0` 表示监听所有网络接口。如果绑定 `127.0.0.1`（loopback），只接受来自本 namespace 内部的连接，经 DNAT 转发过来的流量来自 `docker0` 接口，不走 loopback，会被拒绝。

### macOS 的额外一跳

macOS 上 Docker Desktop 在内部运行一个 Linux VM（HyperKit 或 Apple Virtualization），实际路径是：

```
浏览器 → localhost:8000
  → macOS TCP 栈
  → Docker Desktop Linux VM
  → Linux VM 的 iptables DNAT
  → 容器 eth0:8000
  → 进程
```

对使用者透明，但解释了为什么 macOS 上 Docker 比纯 Linux 宿主机稍慢。

---

## 五、Volumes 三种挂载方式

```
┌──────────────────────────────────────────────┐
│                  容器进程                     │
│   读写 /app/...    /app/node_modules/        │
└────────────┬──────────────────┬──────────────┘
             │                  │
      bind mount           named volume
             │                  │
    宿主机文件系统        Docker 管理的存储区
    ~/code/project/       /var/lib/docker/volumes/...
```

### 1. Bind Mount（绑定挂载）

```yaml
volumes:
  - .:/app
```

实现层是 Linux VFS 的 `mount --bind`：

```bash
mount --bind /宿主机路径 /容器内路径
```

效果是让内核 VFS 层把两个路径指向**同一个 inode 树**。访问容器内 `/app/foo.js` 和访问宿主机 `~/project/foo.js` 走完全相同的内核路径，读写同一块磁盘扇区。

**没有任何拷贝或同步**，因此修改源码后容器立刻能读到——本就是同一个文件。

`:ro`（只读）通过 mount 的 `MS_RDONLY` 标志实现，内核层面拒绝写操作，不是应用层权限控制。

### 2. Named Volume（命名卷）

```yaml
volumes:
  - node_modules:/app/node_modules

volumes:
  node_modules:  # 顶层声明，由 Docker 管理
```

数据实际存储在宿主机的：

```
/var/lib/docker/volumes/<卷名>/_data/
```

（macOS 上在 Docker Desktop 的 Linux VM 内，宿主机文件系统看不到，但逻辑相同。）

**关键：初始化行为**

当一个**空的命名卷**挂载到容器内某路径，而该路径在镜像里已有内容时，Docker 会把镜像里的内容**复制进卷**（仅在卷首次创建时触发一次）。

```
1. docker build 阶段
     RUN npm install → node_modules 写入镜像层（Linux 版二进制）

2. 首次 docker compose up
     卷为空 → Docker 把镜像里的 /app/node_modules 复制进卷

3. 后续启动
     卷已有内容，不再初始化，持久保留
```

这就是"命名卷隔离 node_modules"技巧的原理：卷里装的是 Linux 版 npm 包，宿主机 macOS 版的 node_modules 被完全屏蔽。

### 3. 匿名卷（Anonymous Volume）

```yaml
volumes:
  - /app/node_modules   # 没有左侧的卷名
```

行为与命名卷相同，但 Docker 自动生成随机 ID 作为卷名。问题是 `docker compose down` 不会删除它，久了会堆积大量无名卷（可用 `docker volume ls` 查看）。**推荐用命名卷**，可以精确管理生命周期。

---

## 六、两层挂载的叠加顺序

```yaml
volumes:
  - .:/app                          # ① 先挂载，bind mount
  - node_modules:/app/node_modules  # ② 后挂载，named volume
```

Linux 内核的 mount 可以叠加（stackable mounts）：**后挂载的在该路径上遮住先挂载的**。

```
容器内 /app/             ← bind mount（宿主机项目目录）
容器内 /app/node_modules ← named volume（Linux 版包）
                           ↑ 遮住了 bind mount 在这个子目录的宿主机内容
```

宿主机的 `node_modules`（如果存在）对容器完全不可见。

---

## 七、完整关系图

```
宿主机（macOS + Docker Desktop Linux VM）
│
├── ~/code/vite-migration/              ← 项目文件（bind mount 源）
│       pages-php/home.php
│       resource/js/dist-vite/          ← vite 容器写入，出现在宿主机
│
├── Docker 管理的卷
│       .../volumes/project_node_modules/_data/
│           node_modules/               ← Linux 版 npm 包
│
├── 虚拟网络 project_default（bridge）
│       内置 DNS: php→172.20.0.2, vite→172.20.0.3
│
├── iptables DNAT
│       宿主机 :8000 → 172.20.0.2:8000（php 容器）
│       宿主机 :5173 → 172.20.0.3:5173（vite 容器）
│
├── [容器] php                          namespace: 172.20.0.2
│       /app/          ← bind mount 只读（宿主机项目目录）
│       进程: php -S 0.0.0.0:8000
│
└── [容器] vite                         namespace: 172.20.0.3
        /app/          ← bind mount 读写（可写 dist-vite/ 回宿主机）
        /app/node_modules/ ← named volume（Linux 版包，遮住 bind mount）
        进程: npx vite --host
```

---

## 八、常见问题

**Q：为什么改了源码不需要重启容器？**

bind mount 没有拷贝，容器内读的就是宿主机的实际文件。PHP 每次请求读最新 `.php`；Vite 通过 `chokidar` 监听文件系统事件触发 HMR。只有镜像内容需要变化（如新增 npm 依赖）时才需要重建镜像。

**Q：`make clean` 后 `make dev` 为什么变慢？**

`make clean`（`docker compose down -v`）删掉了命名卷，下次启动触发卷初始化——从镜像层复制 `node_modules` 进新卷。若同时用 `--build` 重建镜像，则 `npm install` 要重新跑。仅 `make down`（不加 `-v`）保留卷，下次秒起。

**Q：两个容器为什么不需要直接通信？**

本项目的架构是：PHP 只输出 HTML（包含指向 `:5173` 的 URL），浏览器直接连 Vite 容器获取 JS 模块和 HMR WebSocket。PHP → Vite 的通信在浏览器端发生，不在服务端。若需要服务端容器间通信（如 PHP 调用 Node.js API），才会用 Compose 内置 DNS（`http://vite:端口`）。
