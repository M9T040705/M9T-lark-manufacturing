import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { AuthService } from '../auth/auth.service';
import { FeishuConfigDto } from './dto/feishu.dto';
import { AgentBridge } from '../agent/agent.bridge';

const BASE = 'https://open.feishu.cn/open-apis';

@Injectable()
export class FeishuService {
  private readonly logger = new Logger(FeishuService.name);
  // 内存级预警去重：key=tenantId:dedupKey -> 上次推送时间。
  // 开发/单机部署够用；多实例生产应替换为 Redis（docker-compose 已内置 Redis）。
  private notifyCache = new Map<string, number>();
  private readonly DEDUP_TTL = 60 * 60 * 1000; // 同类预警 1 小时内不重复推送

  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
    private bridge: AgentBridge,
  ) {}

  // ---------- 应用配置 ----------

  async getConfig(user: AuthUser) {
    const cfg = await this.prisma.feishuConfig.findUnique({ where: { tenantId: user.tenantId as string } });
    if (!cfg) return null;
    // 脱敏
    return {
      ...cfg,
      appSecret: cfg.appSecret ? '******' : '',
      encryptKey: cfg.encryptKey ? '******' : '',
    };
  }

  async upsertConfig(user: AuthUser, dto: FeishuConfigDto) {
    const tenantId = user.tenantId as string;
    const data: Record<string, unknown> = { ...dto };
    // 脱敏值不覆盖
    if (dto.appSecret === '******') delete data.appSecret;
    if (dto.encryptKey === '******') delete data.encryptKey;
    return this.prisma.feishuConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }

  // 登录前公开接口：按企业编码返回 SSO 所需的最小信息（不含任何密钥）
  async getPublicConfig(tenantCode: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { code: tenantCode } });
    if (!tenant) return { enabled: false, ssoEnabled: false, appId: '' };
    const cfg = await this.prisma.feishuConfig.findUnique({ where: { tenantId: tenant.id } });
    if (!cfg) return { enabled: false, ssoEnabled: false, appId: '' };
    return {
      enabled: cfg.enabled,
      ssoEnabled: cfg.enabled && cfg.ssoEnabled && !!cfg.appId,
      appId: cfg.appId || '',
    };
  }

  // 获取 tenant_access_token
  async tenantAccessToken(appId: string, appSecret: string) {
    const res = await axios.post(`${BASE}/auth/v3/tenant_access_token/internal`, {
      app_id: appId,
      app_secret: appSecret,
    });
    if (res.data.code !== 0) throw new BadRequestException(`飞书凭证获取失败：${res.data.msg}`);
    return res.data.tenant_access_token as string;
  }

  // ---------- 网页授权 SSO ----------

  // 飞书网页授权 SSO：code 换用户 → 匹配系统账号（openId/手机号/姓名）→ 首次自动绑定 → 签发 JWT
  async sso(code: string, tenantCode: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { code: tenantCode } });
    if (!tenant || tenant.status !== 'active') {
      throw new BadRequestException('企业编码不存在或已停用');
    }
    const cfg = await this.prisma.feishuConfig.findUnique({ where: { tenantId: tenant.id } });
    if (!cfg || !cfg.enabled || !cfg.ssoEnabled || !cfg.appId || !cfg.appSecret) {
      throw new BadRequestException('该企业未启用飞书 SSO 或配置不完整');
    }

    const tat = await this.tenantAccessToken(cfg.appId, cfg.appSecret);
    const tokenRes = await axios.post(
      `${BASE}/authen/v1/access_token`,
      { grant_type: 'authorization_code', code },
      { headers: { Authorization: `Bearer ${tat}` } },
    );
    const uat = tokenRes.data?.data?.access_token;
    if (!uat) throw new UnauthorizedException('飞书授权失败');
    const userRes = await axios.get(`${BASE}/authen/v1/user_info`, {
      headers: { Authorization: `Bearer ${uat}` },
    });
    const fs = userRes.data?.data ?? {};
    const openId: string | undefined = fs.open_id;
    const unionId: string | undefined = fs.union_id;
    // 飞书手机号形如 +8613800000006，系统存 13800000006，归一化后再匹配
    const normMobile = this.normalizeMobile(fs.mobile);

    // 匹配优先级：① 已绑定的飞书 openId → ② 手机号 → ③ 姓名
    let user = null;
    if (openId) {
      user = await this.prisma.user.findFirst({ where: { tenantId: tenant.id, feishuOpenId: openId } });
    }
    if (!user && normMobile) {
      user = await this.prisma.user.findFirst({
        where: { tenantId: tenant.id, OR: [{ phone: normMobile }, { phone: fs.mobile }] },
      });
    }
    if (!user && fs.name) {
      user = await this.prisma.user.findFirst({ where: { tenantId: tenant.id, name: fs.name } });
    }
    if (!user || !user.active) {
      throw new UnauthorizedException('未匹配到系统账号，请先在系统中创建账号并绑定与飞书一致的手机号');
    }

    // 首次登录：把飞书 openId 自动绑定到该系统账号，后续直接按 openId 命中
    if (openId && user.feishuOpenId !== openId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { feishuOpenId: openId, feishuUnionId: unionId ?? user.feishuUnionId },
      });
    }

    const { accessToken, refreshToken } = await this.auth.sign(user.id, user.tenantId, user.role, user.name, user.username);
    return {
      accessToken,
      refreshToken,
      tenant: { id: tenant.id, code: tenant.code, name: tenant.name },
      user: { id: user.id, username: user.username, name: user.name, role: user.role, phone: user.phone },
    };
  }

  // 手机号归一化：去掉空格/连字符/括号与 +86、86 国家码，得到纯手机号，便于与系统账号比对
  private normalizeMobile(m?: string | null): string {
    if (!m) return '';
    let s = String(m).replace(/[\s\-()]/g, '');
    s = s.replace(/^\+?86/, '');
    return s;
  }

  // ---------- 群机器人推送（业务预警） ----------

  // 配置页"发送测试消息"：只校验是否填了 webhook，不受总开关影响，便于联调
  async sendWebhook(tenantId: string, text: string) {
    const cfg = await this.prisma.feishuConfig.findUnique({ where: { tenantId } });
    if (!cfg || !cfg.webhook) return { skipped: true, reason: '未配置飞书群机器人 webhook' };
    const res = await axios.post(cfg.webhook, { msg_type: 'text', content: { text } });
    return res.data;
  }

  /**
   * 业务预警统一推送入口（安全、绝不抛错）：
   * 未配置 / 网络异常 / 飞书拒绝都只记日志并返回 skipped，不影响业务主流程；
   * dedupKey 相同的消息在 TTL 内只推一次，避免刷屏。
   */
  async notify(tenantId: string, text: string, dedupKey?: string) {
    try {
      const cacheKey = dedupKey ? `${tenantId}:${dedupKey}` : '';
      if (cacheKey) {
        const last = this.notifyCache.get(cacheKey);
        if (last && Date.now() - last < this.DEDUP_TTL) {
          return { skipped: true, reason: 'dedup' };
        }
      }
      const cfg = await this.prisma.feishuConfig.findUnique({ where: { tenantId } });
      if (!cfg || !cfg.enabled || !cfg.webhook) {
        return { skipped: true, reason: '未配置飞书群机器人 webhook' };
      }
      const res = await axios.post(cfg.webhook, { msg_type: 'text', content: { text } });
      const d = res.data || {};
      if ((d.StatusCode !== undefined && d.StatusCode !== 0) || (d.code !== undefined && d.code !== 0)) {
        this.logger.warn(`飞书推送被拒绝：${d.StatusMessage || d.msg || 'unknown'}`);
        return { skipped: true, reason: d.StatusMessage || d.msg };
      }
      if (cacheKey) {
        this.notifyCache.set(cacheKey, Date.now());
        this.cleanCache();
      }
      return d;
    } catch (e: any) {
      this.logger.warn(`飞书推送失败（不影响业务）：${e?.message || e}`);
      return { skipped: true, reason: '推送失败' };
    }
  }

  private cleanCache() {
    if (this.notifyCache.size <= 200) return;
    const now = Date.now();
    for (const [k, t] of this.notifyCache) {
      if (now - t > this.DEDUP_TTL) this.notifyCache.delete(k);
    }
  }

  // 语义化预警：低库存
  notifyLowStock(
    tenantId: string,
    p: { code: string; name: string; unit: string; qty: number; safetyStock: number },
  ) {
    return this.notify(
      tenantId,
      `【低库存预警】${p.name}（${p.code}）当前库存 ${p.qty}${p.unit}，已低于安全库存 ${p.safetyStock}${p.unit}，请及时采购/补库。`,
      `lowstock:${p.code}`,
    );
  }

  // 语义化预警：工单交期延期
  notifyOverdueWo(
    tenantId: string,
    w: { woNo: string; productName: string; planEnd: Date | string | null; finishedQty: number; qty: number },
  ) {
    const due = w.planEnd ? new Date(w.planEnd).toLocaleDateString('zh-CN') : '未设定';
    return this.notify(
      tenantId,
      `【交期延期】工单 ${w.woNo}（${w.productName}）计划完工日 ${due} 已过，当前完成 ${w.finishedQty}/${w.qty}，请优先安排生产。`,
      `overdue:${w.woNo}`,
    );
  }

  // 语义化预警：新待审批（每条审批只推一次）
  notifyApprovalPending(tenantId: string, applicantName: string, title: string, approvalId: string) {
    return this.notify(
      tenantId,
      `【待审批】${applicantName} 提交了「${title}」，请相关负责人及时审批。`,
      `approval:${approvalId}`,
    );
  }

  // ---------- 飞书多维表 / 群消息（部门智能体使用，接口已预留） ----------

  /**
   * 多维表：列出某张智能表的记录（供智能体查询"部门智能表"）。
   * 使用租户自建应用凭证；appToken/tableId/viewId 来自 AgentDataSource 配置。
   */
  async listBaseRecords(
    tenantId: string,
    appToken: string,
    tableId: string,
    opts: { viewId?: string; pageSize?: number; filter?: string } = {},
  ): Promise<{ items: any[]; hasMore: boolean }> {
    const cfg = await this.prisma.feishuConfig.findUnique({ where: { tenantId } });
    if (!cfg?.appId || !cfg?.appSecret) {
      throw new Error('飞书应用未配置（appId/appSecret），无法读取多维表');
    }
    const tat = await this.tenantAccessToken(cfg.appId, cfg.appSecret);
    const q = new URLSearchParams();
    if (opts.viewId) q.set('view_id', opts.viewId);
    q.set('page_size', String(opts.pageSize || 50));
    if (opts.filter) q.set('filter', opts.filter);

    const url = `${BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records?${q.toString()}`;
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${tat}` } });
    if (res.data?.code !== 0) throw new Error(`多维表读取失败：${res.data?.msg}`);
    return {
      items: res.data?.data?.items || [],
      hasMore: !!res.data?.data?.has_more,
    };
  }

  /** 群消息：向指定部门群（open_chat_id）发送文本（智能体回复 / 部门定向通知） */
  async sendChatMessage(tenantId: string, chatId: string, text: string): Promise<void> {
    const cfg = await this.prisma.feishuConfig.findUnique({ where: { tenantId } });
    if (!cfg?.appId || !cfg?.appSecret) {
      throw new Error('飞书应用未配置（appId/appSecret），无法发送群消息');
    }
    const tat = await this.tenantAccessToken(cfg.appId, cfg.appSecret);
    const res = await axios.post(
      `${BASE}/im/v1/messages?receive_id_type=chat_id`,
      { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) },
      { headers: { Authorization: `Bearer ${tat}`, 'Content-Type': 'application/json' } },
    );
    if (res.data?.code !== 0) throw new Error(`群消息发送失败：${res.data?.msg}`);
  }

  // 群 @机器人 消息分发：按 chat_id 匹配部门 → 调部门智能体 → 回复到同一群
  private async dispatchGroupMessage(tenantId: string, body: any) {
    const ev = body.event;
    const message = ev?.message;
    const chatId: string = message?.chat_id;
    const eventType = body?.header?.event_type;
    // 落库（审计）
    await this.prisma.operationLog.create({
      data: {
        tenantId,
        action: 'feishu_event',
        entity: eventType,
        detail: JSON.stringify({ chatId, msgType: message?.message_type }).slice(0, 2000),
      },
    });

    if (message?.message_type !== 'text') return { code: 0, msg: 'ignored:not-text' };
    const text = extractMessageText(message);
    const agent = this.bridge.getAgent();
    if (!agent || !chatId || !text) return { code: 0, msg: 'ok' };

    try {
      const reply = await agent.runDepartmentChat(tenantId, chatId, text, {
        senderOpenId: ev?.sender?.sender_id?.open_id,
      });
      if (reply?.text) await this.sendChatMessage(tenantId, chatId, reply.text);
    } catch (e: any) {
      this.logger.warn(`部门群智能体处理失败（不影响事件回调）：${e?.message || e}`);
    }
    return { code: 0, msg: 'ok' };
  }

  // ---------- 事件订阅回调 ----------

  // 事件订阅回调：URL 校验 + 事件占位处理
  async handleEvent(tenantId: string, body: any) {
    // 飞书 URL 验证
    if (body?.type === 'url_verification') {
      return { challenge: body.challenge };
    }
    // 群 @机器人 消息 → 分发到对应部门智能体
    if (body?.header?.event_type === 'im.message.receive_v1') {
      return this.dispatchGroupMessage(tenantId, body);
    }
    // 事件处理（审批结果、考勤、通讯录变更等）。生产中按 body.header.event_type 分发。
    // 这里落库为操作日志，便于扩展。
    const eventType = body?.header?.event_type || body?.event?.type || 'unknown';
    await this.prisma.operationLog.create({
      data: {
        tenantId,
        action: 'feishu_event',
        entity: eventType,
        detail: JSON.stringify(body).slice(0, 2000),
      },
    });
    return { code: 0, msg: 'ok' };
  }
}

// 从飞书消息体提取纯文本：content 为 JSON 字符串 { text: '@_user_1 你好' }，去除 @ 占位
function extractMessageText(message: any): string {
  try {
    const c = typeof message.content === 'string' ? JSON.parse(message.content) : message.content;
    let t = c?.text || '';
    t = t
      .replace(/@_user_\d+/g, '')
      .replace(/@_all/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return t;
  } catch {
    return '';
  }
}
