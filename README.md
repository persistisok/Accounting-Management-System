# PMS 项目管理系统

面向项目、合同、银行流水、发票、捐赠票据、支持方、执行方、专家和会员的前后端分离业务系统。项目编码是核心业务索引，项目财务金额由来源台账实时汇总，关键操作统一写入审计日志。

## 技术栈

- Web：React、TypeScript、Vite、TanStack Query
- API：NestJS、TypeScript、Prisma、JWT
- 数据库：PostgreSQL
- 部署：Docker Compose、Nginx、Redis、MinIO

完整架构和业务规则见 [设计方案](docs/业务数据管理系统设计方案.md)，日常操作见 [用户使用手册](docs/用户使用手册.md)。

## 本地开发

1. 复制环境变量：`cp .env.example .env`
2. 启动依赖：`docker compose up -d postgres redis minio`
3. 生成并迁移数据库：`npm run db:generate && npm run db:migrate`
4. 写入演示数据：`npm run db:seed`
5. 启动前后端：`npm run dev`
6. 打开 `http://localhost:5173`

演示账号为 `admin`，密码为 `Admin123!`。该密码仅用于本地演示，生产环境必须删除演示数据或修改密码。

## 容器部署

```bash
cp .env.example .env
# 修改 .env 中所有密码和密钥
docker compose build
docker compose up -d
docker compose --profile tools run --rm seed
docker compose --profile tools run --rm backup
```

浏览器打开 `http://服务器地址:8080`。正式服务器应在外层负载均衡器或 Nginx 配置 HTTPS，并限制 SSH 来源。

## 验证

```bash
npm run typecheck
npm test
npm run build
docker compose config --quiet
```

API 健康检查：`GET /api/v1/health/live` 和 `GET /api/v1/health/ready`。

## 生产注意事项

- 必须替换 `POSTGRES_PASSWORD`、`JWT_SECRET`、`FIELD_ENCRYPTION_KEY` 和 MinIO 密钥。
- `FIELD_ENCRYPTION_KEY` 用于专家证件和银行信息加密，必须独立备份且不得与数据库备份存放在一起。
- PostgreSQL 和 MinIO 数据应备份到独立故障域，并定期执行恢复演练。
- 生产环境通过 cron 或 systemd timer 定时执行 `docker compose --profile tools run --rm backup`，并将备份卷同步到异机存储。
- 应用镜像使用固定版本标签，不在生产服务器中直接修改容器文件。
