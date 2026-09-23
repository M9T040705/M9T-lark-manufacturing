# 贡献指南

感谢你对 flybook-saas 的关注！欢迎提交 Issue 和 Pull Request。

## 开发环境搭建

```bash
# 1. 克隆项目
git clone https://github.com/your-username/flybook-saas.git
cd flybook-saas

# 2. 后端
cd server
cp .env.example .env
npm install
npx prisma db push
npm run dev    # http://localhost:3000/api

# 3. 前端（新开终端）
cd web
npm install
npm run dev    # http://localhost:5173
```

## 代码规范

- **后端**：TypeScript + NestJS，遵循 NestJS 模块化规范
- **前端**：Vue 3 `<script setup>` + Element Plus + Pinia
- **提交信息**：使用 Conventional Commits 格式
  - `feat: 新功能`
  - `fix: 修复 bug`
  - `docs: 文档更新`
  - `refactor: 重构`
  - `style: 格式调整`
  - `perf: 性能优化`
  - `test: 测试相关`

## 提交流程

1. Fork 本仓库
2. 创建功能分支 `git checkout -b feature/your-feature`
3. 提交改动 `git commit -m 'feat: 添加 xxx 功能'`
4. 推送分支 `git push origin feature/your-feature`
5. 提交 Pull Request

## PR 要求

- 确保 `npm run build`（前端）和 `npx tsc --noEmit`（后端）通过
- 新增功能请附带说明和使用示例
- 涉及数据库变更需更新 `prisma/schema.prisma`
- 涉及安全相关改动请在 PR 描述中说明

## 问题反馈

- 使用 GitHub Issues 提交 bug 或功能建议
- 提交 bug 时请附上：操作系统、Node 版本、复现步骤、错误日志
