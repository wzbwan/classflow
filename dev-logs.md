完成情况

后端 Fastify + Prisma + SQLite：认证、课程、名册导入、作业、提交、评分、成绩簿导出（CSV）。
前端 React + Vite：登录、课程列表、作业列表、作业提交、教师端导出成绩簿。
关键入口：app/server/src/index.js (line 1)，数据模型：app/server/prisma/schema.prisma (line 1)，前端入口：app/web/src/App.jsx (line 1)。
示例数据和账户种子：app/server/prisma/seed.js (line 1)（教师 t001/学生 s001，密码均为 pass1234）。
运行步骤

后端
cd app/server
cp .env.example .env
pnpm i 或 npm i
pnpm prisma:generate && pnpm prisma:migrate && pnpm seed
pnpm dev（默认 http://localhost:3001）
前端
cd app/web
pnpm i 或 npm i
pnpm dev（默认 http://localhost:5173）
登录示例：s001 / pass1234 或 t001 / pass1234
已对接的核心端点

认证：POST /api/auth/login，GET /api/auth/me
课程：GET /api/courses，POST /api/courses
名册导入：POST /api/courses/:id/enrollments:import（CSV，示例文件 app/server/sample/roster.csv）
作业：POST /api/courses/:id/assignments，GET /api/courses/:id/assignments，GET /api/assignments/:id
提交：POST /api/assignments/:id/submissions（multipart：文件与外链）
评分：POST /api/submissions/:id/grade
成绩簿：GET /api/courses/:id/gradebook?format=csv（前端课程页提供“导出成绩簿 CSV”按钮）
文件与路径

后端配置示例：app/server/.env.example (line 1)
上传目录：app/server/uploads/（运行时自动创建）
名册CSV示例：app/server/sample/roster.csv (line 1)
README（运行说明）：app/README.md (line 1)
下一步建议

增加迟交扣分与总评计算逻辑；成绩簿支持分类权重与“丢最低”。
作业/评分页面的批改视图与快捷评语；Rubric UI。
更严格的权限校验与输入校验；限制上传类型/大小；病毒扫描占位。
统计页（提交率、分布图）和CSV/XLSX导入导出增强。
Docker 化与静态资源由后端一体化托管。