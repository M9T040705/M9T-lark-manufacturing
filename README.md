# 飞书智造云 · 中小机械制造业数字化 SaaS（flybook-saas）

面向 **50–200 人精密机械零部件厂**（五金 / 机加工 / 非标定制，下游汽配、自动化设备）的
**飞书 + CRM + ERP/MES + 部门智能体 + RAG 知识库** 一体化、多租户 SaaS。

把当前"Excel + 纸质单 + 微信群"的模式，升级为
**客户 → 报价 → 订单 → 工单 → 派工 → 扫码报工 → 质检 → 出入库 → 对账回款 → 数据看板 → 智能问答** 的全链路在线系统，
并以 **飞书** 作为统一登录、组织、消息、审批入口。

> 技术栈：后端 NestJS 10 + Prisma 6 + TypeScript；前端 Vue 3 + Vite + Element Plus + Pinia + ECharts。
> 开发默认 **SQLite（零外部依赖，clone 即可跑）**，生产用 **Docker Compose（MySQL 8 + Redis + Nginx）**。

---

## 目录

- [快速开始](#一快速开始开发环境sqlite)
- [业务模块](#二业务模块与核心闭环)
- [部门智能体（数据隔离）](#三部门智能体数据隔离)
- [RAG 知识库](#四rag-知识库)
- [订阅计费](#五订阅计费)
- [多租户与权限](#六多租户与权限)
- [生产级能力](#七生产级能力)
- [飞书集成](#八飞书集成)
- [生产部署](#九生产部署docker-composemysql-8--redis-7--nginx)
- [目录结构](#十目录结构)
- [技术栈](#十一技术栈)

---

## 一、快速开始（开发环境，SQLite）

### 1. 后端（端口 3000）

```bash
cd server
cp .env.example .env
npm install
npx prisma db push     # 建表
npm run seed           # 写入演示数据（可选）
npm run dev            # http://localhost:3000/api
```

### 2. 前端（端口 5173）

```bash
cd web
npm install
npm run dev            # http://localhost:5173
```

### 3. 演示账号

| 企业编码 | 账号 | 角色 | 密码 |
| --- | --- | --- | --- |
| `demo` | `admin` | 老板（全权限） | `123456` |
| `demo` | `sales01` | 销售 | `123456` |
| `demo` | `manager01` | 生产经理 | `123456` |
| `demo` | `worker01` / `worker02` | 操作工 | `123456` |
| `demo` | `warehouse01` | 仓管 | `123456` |
| `demo` | `quality01` | 质检 | `123456` |
| `demo` | `hr01` | 人事 | `123456` |
| `demo` | `finance01` | 财务 | `123456` |

> 前端菜单按角色自动隐藏，销售登录只能看到 CRM + 智能助手，看不到生产/仓储等模块。

---

## 二、业务模块与核心闭环

| 模块 | 路由 | 功能 |
| --- | --- | --- |
| 经营总览 BI | `/dashboard` | 订单总额、完工率、延期、合格率、库存金额、低库存、应收/已收、待审批 |
| 客户 CRM | `/crm/customers` | 客户档案、终端/经销商、等级、结算方式、对账周期 |
| 销售订单 | `/crm/orders` | 报价转订单、订单转工单、状态跟踪、发货、对账 |
| 生产 MES | `/mes/work-orders` | 订单转工单、派工、扫码报工、进度条、交期延期预警 |
| 扫码报工 | `/mes/reports` | 工序、机台、原料批次、工时、产量实时汇总 |
| 仓储 WMS | `/wms/inventory` | 库存汇总、安全库存预警、批次管理 |
| 出入库 | `/wms/moves` | 采购入库、销售出库、生产领料；上料防错（批次/库存不足拦截） |
| 质量 QMS | `/qms/inspections` | 来料 IQC / 工序 IPQC / 成品 FQC，不良返工/报废/让步 |
| 审批 OA | `/oa/approvals` | 请假、加班、采购、领料、报废、订单变更、报销 |
| 账号权限 | `/system/users` | 多租户用户、RBAC 九种角色、启停用、重置密码 |

**核心闭环（可完整走通）**
客户 → 报价 → 销售订单 → 一键转工单 → 派工 → 扫码报工（产量回写、完工自动关单）→ 质检 → 成品入库 / 发货出库 → 对账回款 → 看板自动汇总。

---

## 三、部门智能体（数据隔离）

系统内嵌部门级数据助手，**隔离不依赖大模型自觉，而是两道服务端硬控制**：

### 数据隔离机制

1. **工具白名单**：每个部门只暴露本部门受控查询工具（销售部=客户/报价/订单，仓储部=库存/出入库）；工具内部强制 `tenantId`、限条数、只返回安全字段，**不提供任意 SQL / 任意表能力**。
2. **执行前二次校验**：即使提示词被注入，执行器在调用前仍按部门再校验一次，越权工具直接拒绝。
3. **角色→部门映射**：boss/超管→总经办（全局可见）、sales→销售部、manager/worker→生产部、warehouse→仓储部、quality→质量部、hr→人事行政部、finance→财务部。

### 智能体能力

| 功能 | 说明 |
| --- | --- |
| 意图识别 | 轻量 LLM 调用，自动判断查询意图（查数据/问流程/写操作） |
| 深度思考 | 前端可开关，回答下方展示思考过程（thinking） |
| 对话反馈 | 每条回答可 👍/👊 + 评论，用于优化 |
| 执行轨迹 | 每步工具调用记录输入/输出/耗时，可追溯 |
| Token 统计 | 按部门/人员统计 token 消耗，全员可见 |
| 群会话记录 | 管理员按部门查看群问答（总结视图 + 详细日志） |
| 多维表浏览 | 平台内直接查看飞书多维表记录 |

### 部门群 & 多维表（即插即用）

- **部门群**：建好部门群、把机器人拉入群并取得 `open_chat_id`，在「智能体管理 → 部门与群配置」填入；群内提问经事件回调进入，只回答本部门数据。
- **多维表**：在「智能体管理 → 数据源」新增类型 `FEISHU_BASE`，填 `app_token / table_id / view_id` 并绑定部门，自动转成该部门专属查询工具。

### LLM 可插拔

配置 `LLM_BASE_URL / LLM_API_KEY / LLM_MODEL` 即接入 OpenAI 兼容大模型（DeepSeek / 硅基流动 / 通义 / 火山方舟）；**不配置时自动降级为内置规则引擎，数据隔离能力不降级**。

---

## 四、RAG 知识库

标准化流水线：**清洗 → 智能切片（重叠窗口）→ 向量化 → 双路召回（关键词+向量）→ 重排序**

| 功能 | 说明 |
| --- | --- |
| 数据源 | 飞书群消息、飞书多维表、SOP 文件、人工录入 |
| 文档上传 | 支持 txt/md/csv/json/xlsx，自动解析入库 |
| 智能切片 | 按章节段落切片，重叠窗口保证语义连贯，附带章节路径溯源 |
| 向量化 | 硅基流动 BAAI/bge-m3（1024维），多线程批量处理 |
| 双路召回 | 关键词 + 向量混合检索，提升准确率 |
| 权限隔离 | 文档绑定部门，仅本部门可见可检索 |
| 溯源 | 回答附带来源文档、章节路径 |

---

## 五、订阅计费

| 套餐 | 月付 | 年付 | 用户上限 | 智能体/天 |
| --- | --- | --- | --- | --- |
| 标准版 | ¥299 | ¥2,990 | 10人 | 100次 |
| 专业版 | ¥799 | ¥7,990 | 100人 | 不限 |

### 到期权限变化（三阶段）

```
正常使用 ──到期──→ 只读宽限期(7天) ──到期──→ 账号停用
   │                    │                        │
   │ 全部功能            │ 只能查看不能改          │ 无法登录
   ↓                    ↓                        ↓
status=active      status=read_only         status=suspended
```

### 定时任务

- 每天凌晨 2:00 自动检查所有租户
- 到期前 7/3/1 天发站内通知提醒
- 到期当天自动降级为只读，设 7 天宽限期
- 宽限期结束自动停用
- 开启自动续费的租户，到期当天自动续 1 个月

### API

| 接口 | 说明 |
| --- | --- |
| `GET /api/subscription/status` | 当前订阅状态（剩余天数、是否只读） |
| `GET /api/subscription/plans` | 套餐价格表 |
| `POST /api/subscription/subscribe` | 开通/续费（老板/超管） |
| `PATCH /api/subscription/auto-renew` | 开关自动续费 |

---

## 六、多租户与权限

- **多租户**：共享库 + 行级隔离，所有业务表带 `tenantId`，按"企业编码 + 账号 + 密码"登录。
- **认证**：JWT 双令牌（accessToken 2h + refreshToken 7d），401 自动刷新，全局 `JwtAuthGuard`。
- **前端权限**：菜单按角色自动隐藏，无权限路由自动跳转首页。
- **后端授权**：RBAC 九种角色 + 细粒度权限点（32个内置权限点），`@Roles(...)` + `RolesGuard`。
- **登录安全**：5 分钟内失败 5 次锁定 15 分钟。
- **数据模型**：见 `server/prisma/schema.prisma`（33 个模型）。

---

## 七、生产级能力

| 能力 | 说明 |
| --- | --- |
| 操作审计日志 | 所有 POST/PUT/PATCH/DELETE 自动记录（操作人、方法、路径、实体、请求体，密码/密钥自动脱敏） |
| 接口限流 | 滑动窗口：登录 10次/分，智能体 30次/分，普通接口 120次/分 |
| 消息通知中心 | 站内通知、未读计数、已读标记、全员广播 |
| 文件/附件管理 | 本地上传/下载/删除，支持关联业务对象 |
| Excel 导入导出 | 通用导入导出服务（exceljs） |
| 数据字典 | 可配置枚举管理（订单状态、缺陷类型等） |
| 敏感数据脱敏 | 手机号/身份证/邮箱/姓名/金额脱敏工具 |
| 多环境配置 | development/production 环境变量分离 |
| 异常日志 | 全局异常拦截，请求 ID 追踪 |

---

## 八、飞书集成

### 1. 自建应用配置

1. 飞书开放平台创建「企业自建应用」，获取 **App ID / App Secret**。
2. 开通身份验证、通讯录、消息与机器人、审批等权限。
3. 在「系统 → 飞书集成」填入配置，打开总开关与 SSO 开关。
4. 网页授权重定向地址：`http://localhost:5173/feishu/callback`（开发）/ `https://你的域名/feishu/callback`（生产）。
5. 事件订阅请求地址：`POST /api/feishu/event/{租户编码}`（含 URL 校验 challenge）。
6. 群机器人：飞书群「设置 → 群机器人 → 添加自定义机器人」，把 Webhook 填入配置页。

> ⚠️ 事件回调需要**公网可访问的 URL**，本地开发需用内网穿透（cpolar / ngrok）。

### 2. 飞书一键登录（SSO）

登录页提供「飞书一键登录」，流程：code → 换飞书用户信息 → 匹配系统账号（openId → 手机号 → 姓名）。首次匹配成功自动绑定 openId，**不会自动创建账号**。

### 3. 业务预警自动推送

| 触发点 | 条件 | 推送内容 |
| --- | --- | --- |
| 仓储 WMS | 出库后库存 ≤ 安全库存 | 【低库存预警】物料、当前库存、安全库存 |
| 生产 MES | 报工后已过计划完工日 | 【交期延期】工单号、计划完工日、当前进度 |
| 审批 OA | 提交审批单 | 【待审批】申请人、审批标题 |

- 同类预警 1 小时内只推一次（去重），多实例生产请替换为 Redis。
- 未配置 Webhook / 网络异常时仅记日志，**不阻断业务**。

> 未配置飞书时，CRM/ERP/MES 全部功能照常可用，飞书为协同入口而非硬依赖。

---

## 九、生产部署（Docker Compose，MySQL 8 + Redis 7 + Nginx）

```bash
cp .env.production.example .env
# 编辑 .env：修改 MYSQL_PASSWORD、JWT_SECRET、APP_DOMAIN 等
docker compose up -d --build
docker compose logs -f api
```

- 前端（Nginx）：http://localhost:8080
- 后端 API：http://localhost:3000/api
- MySQL：localhost:3306；Redis：localhost:6379

容器启动自动执行 `prisma db push` 建表，按 `SEED_DEMO` 决定是否写入演示数据。

---

## 十、目录结构

```
flybook-saas/
├── server/                    # NestJS 后端
│   ├── prisma/
│   │   ├── schema.prisma       # 数据模型（33个模型）
│   │   └── seed.ts             # 演示数据
│   └── src/
│       ├── auth/               # 登录/JWT双令牌/刷新
│       ├── tenants/            # 租户/订阅计费
│       ├── users/              # 用户/RBAC
│       ├── crm/                # 客户/报价/订单/回款
│       ├── mes/                # 产品/BOM/工单/报工
│       ├── wms/                # 库存/出入库
│       ├── qms/                # 检验/不良
│       ├── oa/                 # 审批
│       ├── bi/                 # 看板聚合
│       ├── agent/              # 部门智能体（隔离/工具/LLM/意图识别）
│       ├── knowledge/          # RAG知识库（切片/向量化/召回）
│       ├── feishu/             # 飞书SSO/消息/事件/多维表
│       ├── subscription/       # 订阅计费/到期检查
│       ├── notification/       # 消息通知中心
│       ├── file/               # 文件附件管理
│       ├── dict/               # 数据字典
│       ├── rbac/               # 细粒度权限
│       ├── audit/              # 操作审计
│       ├── import-export/      # Excel导入导出
│       └── common/             # 中间件/工具/脱敏/限流
├── web/                       # Vue3 前端
│   └── src/{api,store,router,layout,utils,views}
├── docs/                      # 文档
│   └── 飞书配置指南.md
├── docker-compose.yml         # 生产编排
├── .env.production.example    # 生产环境变量模板
├── CONTRIBUTING.md            # 贡献指南
├── CHANGELOG.md               # 更新日志
└── LICENSE                    # MIT
```

---

## 十一、技术栈

| 层级 | 技术 |
| --- | --- |
| 后端框架 | NestJS 10 + TypeScript |
| ORM | Prisma 6 |
| 数据库 | SQLite（开发）/ MySQL 8（生产） |
| 缓存 | Redis 7（生产） |
| 前端框架 | Vue 3 + Vite + TypeScript |
| UI 组件 | Element Plus |
| 状态管理 | Pinia |
| 图表 | ECharts |
| 认证 | JWT（passport-jwt）双令牌 |
| 大模型 | OpenAI 兼容接口（DeepSeek / 硅基流动 / 通义） |
| 向量化 | BAAI/bge-m3（硅基流动） |
| 部署 | Docker Compose + Nginx |

---

## License

MIT © flybook-saas contributors
