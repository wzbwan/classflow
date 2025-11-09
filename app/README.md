# 课堂数据管理与作业收发 - MVP

最小可运行版本，基于设计草案实现核心流程：认证、课程、作业、提交、评分、成绩簿导出（CSV）。

## 目录结构

```
app/
  server/        # Fastify + Prisma + SQLite 后端
  web/           # React + Vite 前端
  docker-compose.yml (可选后续)
```

## 快速开始

前置：已安装 Node.js 18+ 与 pnpm 或 npm。

### 1) 启动后端

```
cd app/server
cp .env.example .env
pnpm i   # 或 npm i
pnpm prisma:generate
pnpm prisma:migrate
pnpm seed
pnpm dev
```

默认监听：`http://localhost:3001`

种子账户（示例）：

- 教师：`t001 / pass1234`
- 学生：`s001 / pass1234`
- 管理员：`admin / pass1234`（账号管理入口）

### 2) 启动前端

```
cd app/web
pnpm i   # 或 npm i
pnpm dev
```

默认访问：`http://localhost:5173`

### 环境变量（后端）

见 `app/server/.env.example`：

- `DATABASE_URL`：SQLite 文件路径
- `JWT_SECRET`：JWT 密钥
- `UPLOAD_DIR`：作业文件上传目录
- `MAX_UPLOAD_MB`：最大上传大小（MB）

## 功能覆盖（MVP）

- 认证：`/api/auth/login`（JWT）
- 课程：`GET /api/courses`，`POST /api/courses`
- 名册导入：`POST /api/courses/:id/enrollments:import`（CSV）
- 作业：`POST /api/courses/:id/assignments`，`GET /api/assignments/:id`
- 作业资料分发：`POST /api/assignments/:id/materials`（教师上传多文件），`GET /api/assignments/:id/materials`、`GET /api/assignments/:id/materials/:idx/download`
- 提交：`POST /api/assignments/:id/submissions`（multipart）
- 评分：`POST /api/submissions/:id/grade`
- 成绩簿：`GET /api/courses/:id/gradebook?format=csv`

### 管理员功能

- 账号管理页面（前端顶栏“管理账号”，仅 ADMIN 可见）：
  - 列表与查询用户
  - 新建教师/学生/助教/管理员账号
  - 批量导入 Excel/CSV（模板下载按钮提供示例）
- 后端端点：
  - `GET /api/admin/users`（支持 `role`、`q`）
  - `POST /api/admin/users`、`PUT /api/admin/users/:id`
  - `GET /api/admin/users/template?format=xlsx|csv`
  - `POST /api/admin/users:import`（上传 Excel/CSV）

### 示例：导入名册

```
curl -H "Authorization: Bearer <TOKEN>" \
     -F file=@sample/roster.csv \
     http://localhost:3001/api/courses/1/enrollments:import
```

## 开发提示

- 数据库位于 `app/server/prisma/dev.db`（默认）。
- 上传文件位于 `app/server/uploads/`。
- 前端使用简单的本地状态管理与 `fetch`，后续可替换为 React Query。
