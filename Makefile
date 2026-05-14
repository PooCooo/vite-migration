.PHONY: dev dev-build build test serve down clean

# Dev 模式：PHP (MOCK_DEV=1) + Vite dev server，双容器并起
dev:
	docker compose up

# 依赖变更后重新构建镜像再启动
dev-build:
	docker compose up --build

# Vite 生产构建（产物写回宿主机 resource/js/dist-vite/）
build:
	docker compose run --rm vite npm run build:vite

# 运行单测
test:
	docker compose run --rm vite npx vitest run

# 生产预览：PHP 服务 prod 构建产物（需先 make build）
serve:
	docker run --rm \
		-v "$(CURDIR):/app:ro" \
		-p 8000:8000 \
		-w /app \
		php:8.2-cli \
		php -S 0.0.0.0:8000 -t /app

# 停止 dev 容器
down:
	docker compose down

# 清理容器 + 命名卷（重置 node_modules 时用）
clean:
	docker compose down -v --remove-orphans
