import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async create(dto: { code: string; name: string; contact?: string; phone?: string }) {
    const exists = await this.prisma.tenant.findUnique({ where: { code: dto.code } });
    if (exists) throw new BadRequestException('企业编码已存在');
    const passwordHash = await bcrypt.hash('123456', 10);
    return this.prisma.tenant.create({
      data: {
        code: dto.code,
        name: dto.name,
        contact: dto.contact,
        phone: dto.phone,
        users: {
          create: {
            username: 'admin',
            name: '企业管理员',
            role: 'boss',
            passwordHash,
          },
        },
      },
    });
  }

  /** 租户自助注册（公开接口） */
  async selfRegister(dto: { tenantCode: string; tenantName: string; adminUsername: string; adminName: string; adminPassword: string; contact?: string; phone?: string }) {
    const exists = await this.prisma.tenant.findUnique({ where: { code: dto.tenantCode } });
    if (exists) throw new BadRequestException('企业编码已被注册');
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    const tenant = await this.prisma.tenant.create({
      data: {
        code: dto.tenantCode,
        name: dto.tenantName,
        plan: 'standard',
        status: 'active',
        contact: dto.contact,
        phone: dto.phone,
        users: {
          create: {
            username: dto.adminUsername,
            name: dto.adminName,
            role: 'boss',
            passwordHash,
          },
        },
        // 初始化默认部门
        departments: {
          create: [
            { code: 'management', name: '总经办' },
            { code: 'sales', name: '销售部' },
            { code: 'production', name: '生产部' },
            { code: 'warehouse', name: '仓储部' },
            { code: 'quality', name: '质量部' },
            { code: 'hr', name: '人事部' },
            { code: 'finance', name: '财务部' },
          ],
        },
      },
      include: { users: true },
    });
    return {
      tenant: { id: tenant.id, code: tenant.code, name: tenant.name },
      admin: { id: tenant.users[0].id, username: tenant.users[0].username, name: tenant.users[0].name },
    };
  }
}
