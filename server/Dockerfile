FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

# 生产统一使用 MySQL：用 MySQL 版 schema 覆盖开发用的 SQLite schema，再生成客户端
COPY prisma ./prisma
RUN cp prisma/schema.mysql.prisma prisma/schema.prisma && npx prisma generate

COPY . .
# COPY . . 会带回 SQLite 版 schema.prisma，构建前再次覆盖为 MySQL 版
RUN cp prisma/schema.mysql.prisma prisma/schema.prisma && npm run build

EXPOSE 3000
# 启动时同步表结构（首次空库直接建表；后续迭代建议改用 prisma migrate deploy），
# 并按 SEED_DEMO 开关决定是否写入演示数据
CMD ["sh", "-c", "npx prisma db push && if [ \"$SEED_DEMO\" = \"true\" ]; then npx tsx prisma/seed.ts; fi && node dist/main.js"]
