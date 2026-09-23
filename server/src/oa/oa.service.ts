import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { ApprovalDto } from './dto/oa.dto';
import { FeishuService } from '../feishu/feishu.service';

const APPROVER_ROLES = ['super_admin', 'boss', 'manager', 'hr'];

@Injectable()
export class OaService {
  constructor(
    private prisma: PrismaService,
    private feishu: FeishuService,
  ) {}

  private t(user: AuthUser) {
    return { tenantId: user.tenantId as string };
  }

  async list(user: AuthUser, status = '', scope = 'all') {
    const where: Record<string, unknown> = { ...this.t(user), ...(status ? { status } : {}) };
    // 普通员工只看自己发起的；审批角色看待办时看全部待审
    if (scope === 'mine' || !APPROVER_ROLES.includes(user.role)) {
      where.applicantId = user.userId;
    }
    return this.prisma.approval.findMany({
      where,
      include: {
        applicant: { select: { name: true } },
        approver: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: AuthUser, dto: ApprovalDto) {
    const approval = await this.prisma.approval.create({
      data: {
        tenantId: user.tenantId as string,
        type: dto.type,
        title: dto.title,
        payload: dto.payload ? JSON.stringify(dto.payload) : null,
        applicantId: user.userId,
        status: 'pending',
      },
    });
    // 新待审批推送飞书群（每条审批只推一次，异步、不影响提交）
    this.feishu
      .notifyApprovalPending(user.tenantId as string, user.name || '员工', dto.title, approval.id)
      .catch(() => undefined);
    return approval;
  }

  private async decide(user: AuthUser, id: string, status: string, comment?: string) {
    if (!APPROVER_ROLES.includes(user.role)) throw new BadRequestException('无审批权限');
    const a = await this.prisma.approval.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!a) throw new NotFoundException('审批单不存在');
    if (a.status !== 'pending') throw new BadRequestException('该审批单已处理');
    return this.prisma.approval.update({
      where: { id },
      data: { status, approverId: user.userId, approverComment: comment, approvedAt: new Date() },
    });
  }

  approve(user: AuthUser, id: string, comment?: string) {
    return this.decide(user, id, 'approved', comment);
  }

  reject(user: AuthUser, id: string, comment?: string) {
    return this.decide(user, id, 'rejected', comment);
  }
}
