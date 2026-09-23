import request from './request';

// 认证
export const login = (data: { tenantCode: string; username: string; password: string }) =>
  request.post('/auth/login', data);
export const getMe = () => request.get('/auth/me');
export const refreshToken = (refreshToken: string) =>
  request.post('/auth/refresh', { refreshToken });

// BI 看板
export const getOverview = () => request.get('/bi/overview');
export const getSalesBoard = () => request.get('/bi/sales');
export const getProductionBoard = () => request.get('/bi/production');

// 客户
export const listCustomers = (params?: any) => request.get('/customers', { params });
export const createCustomer = (data: any) => request.post('/customers', data);
export const updateCustomer = (id: string, data: any) => request.patch(`/customers/${id}`, data);

// 报价
export const listQuotes = () => request.get('/quotes');
export const createQuote = (data: any) => request.post('/quotes', data);
export const quoteToOrder = (id: string, deliveryDate?: string) =>
  request.post(`/quotes/${id}/to-order`, { deliveryDate });

// 订单
export const listOrders = (params?: any) => request.get('/orders', { params });
export const createOrder = (data: any) => request.post('/orders', data);
export const updateOrderStatus = (id: string, status: string) =>
  request.patch(`/orders/${id}/status`, { status });

// 回款
export const listPayments = () => request.get('/payments');
export const createPayment = (data: any) => request.post('/payments', data);
export const markPaid = (id: string, paidAmount?: number) =>
  request.post(`/payments/${id}/paid`, { paidAmount });

// 产品
export const listProducts = (params?: any) => request.get('/products', { params });
export const createProduct = (data: any) => request.post('/products', data);

// BOM
export const listBoms = () => request.get('/boms');
export const getBom = (id: string) => request.get(`/boms/${id}`);
export const createBom = (data: any) => request.post('/boms', data);

// 工单
export const listWorkOrders = (params?: any) => request.get('/work-orders', { params });
export const createWorkOrder = (data: any) => request.post('/work-orders', data);
export const createWoFromOrder = (orderId: string, data?: any) =>
  request.post(`/work-orders/from-order/${orderId}`, data || {});
export const assignWorkOrder = (id: string, data: any) =>
  request.post(`/work-orders/${id}/assign`, data);
export const reportWorkOrder = (id: string, data: any) =>
  request.post(`/work-orders/${id}/report`, data);

// 报工
export const listWorkReports = () => request.get('/work-reports');

// 库存
export const listInventory = (params?: any) => request.get('/inventory', { params });
// 出入库
export const listStockMoves = (params?: any) => request.get('/stock-moves', { params });
export const createStockMove = (data: any) => request.post('/stock-moves', data);

// 质检
export const listInspections = (params?: any) => request.get('/inspections', { params });
export const listDefects = (params?: any) => request.get('/inspections/defects', { params });
export const createInspection = (data: any) => request.post('/inspections', data);
export const handleDefect = (id: string, data: any) =>
  request.post(`/inspections/defects/${id}/handle`, data);

// 审批
export const listApprovals = (params?: any) => request.get('/approvals', { params });
export const createApproval = (data: any) => request.post('/approvals', data);
export const approveApproval = (id: string, comment?: string) =>
  request.post(`/approvals/${id}/approve`, { comment });
export const rejectApproval = (id: string, comment?: string) =>
  request.post(`/approvals/${id}/reject`, { comment });

// 用户
export const listUsers = () => request.get('/users');
export const createUser = (data: any) => request.post('/users', data);
export const updateUser = (id: string, data: any) => request.patch(`/users/${id}`, data);
export const resetPassword = (id: string, password: string) =>
  request.post(`/users/${id}/reset-password`, { password });

// 飞书
export const getFeishuConfig = () => request.get('/feishu/config');
export const saveFeishuConfig = (data: any) => request.put('/feishu/config', data);
export const testFeishuWebhook = (text: string) =>
  request.post('/feishu/webhook-test', { text });
// 登录前公开：按企业编码获取飞书 SSO 开关与 appId
export const getFeishuPublicConfig = (tenantCode: string) =>
  request.get('/feishu/public-config', { params: { tenantCode } });
// 飞书网页授权回调：code 换系统 JWT
export const feishuSso = (data: { code: string; tenantCode: string }) =>
  request.post('/feishu/sso', data);

// ============ 部门级数据隔离智能体 ============

export const agentApi = {
  // 当前部门与可查询范围
  scope: () => request.get('/agent/scope'),
  // 提问
  chat: (data: { message: string; conversationId?: string; thinking?: boolean }) => request.post('/agent/chat', data),
  // 会话
  conversations: () => request.get('/agent/conversations'),
  conversation: (id: string) => request.get(`/agent/conversations/${id}`),
  // 部门与群配置（boss/super_admin）
  departments: () => request.get('/agent/departments'),
  createDepartment: (data: any) => request.post('/agent/departments', data),
  updateDepartment: (id: string, data: any) => request.patch(`/agent/departments/${id}`, data),
  // 数据源 / 多维表配置（boss/super_admin）
  dataSources: () => request.get('/agent/data-sources'),
  createDataSource: (data: any) => request.post('/agent/data-sources', data),
  updateDataSource: (id: string, data: any) => request.patch(`/agent/data-sources/${id}`, data),
  removeDataSource: (id: string) => request.delete(`/agent/data-sources/${id}`),
  // 群会话记录（部门隔离）
  groupConversations: () => request.get('/agent/group-conversations'),
  groupConversationMessages: (id: string) => request.get(`/agent/group-conversations/${id}/messages`),
  // 多维表数据浏览（部门隔离）
  visibleDataSources: () => request.get('/agent/data-sources/visible'),
  browseDataSource: (id: string) => request.get(`/agent/data-sources/${id}/records`),
  // Token 使用统计展板
  tokenStats: () => request.get('/agent/token-stats'),
};

// ============ RAG 知识库 ============
export const knowledgeApi = {
  list: (params?: any) => request.get('/knowledge/docs', { params }),
  stats: () => request.get('/knowledge/stats'),
  retrieve: (q: string, limit?: number) =>
    request.get('/knowledge/retrieve', { params: { q, limit } }),
  ingest: (data: any) => request.post('/knowledge/ingest', data),
  seed: () => request.post('/knowledge/seed'),
  remove: (id: string) => request.delete(`/knowledge/${id}`),
};
