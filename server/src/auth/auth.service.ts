import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { code: dto.tenantCode.trim() } });
    if (!tenant) {
      throw new UnauthorizedException('企业编码不存在');
    }
    if (tenant.status === 'suspended') {
      throw new UnauthorizedException('账号已停用，请联系管理员续费');
    }

    // 登录失败锁定检查：5 分钟内失败 5 次锁定 15 分钟
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const failCount = await this.prisma.loginAttempt.count({
      where: { tenantId: tenant.id, username: dto.username.trim(), success: false, createdAt: { gte: fiveMinAgo } },
    });
    if (failCount >= 5) {
      throw new UnauthorizedException('登录失败次数过多，请 15 分钟后再试');
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_username: { tenantId: tenant.id, username: dto.username.trim() } },
    });
    if (!user || !user.active) {
      await this.prisma.loginAttempt.create({ data: { tenantId: tenant.id, username: dto.username.trim(), success: false } });
      throw new UnauthorizedException('用户不存在或已停用');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      await this.prisma.loginAttempt.create({ data: { tenantId: tenant.id, username: dto.username.trim(), success: false } });
      throw new UnauthorizedException(`用户名或密码错误（今日已失败 ${failCount + 1} 次，5 次后锁定）`);
    }
    await this.prisma.loginAttempt.create({ data: { tenantId: tenant.id, username: dto.username.trim(), success: true } });

    const { accessToken, refreshToken } = await this.sign(user.id, user.tenantId, user.role, user.name, user.username);

    // 计算订阅状态
    const now = new Date();
    let subStatus = 'permanent';
    let daysLeft: number | null = null;
    if (tenant.expiresAt) {
      if (tenant.expiresAt > now) {
        subStatus = 'active';
        daysLeft = Math.ceil((tenant.expiresAt.getTime() - now.getTime()) / 86400000);
      } else if (tenant.graceEndsAt && tenant.graceEndsAt > now) {
        subStatus = 'grace';
        daysLeft = Math.ceil((tenant.graceEndsAt.getTime() - now.getTime()) / 86400000);
      } else {
        subStatus = 'expired';
      }
    }

    return {
      accessToken,
      refreshToken,
      tenant: { id: tenant.id, code: tenant.code, name: tenant.name, plan: tenant.plan, status: tenant.status },
      subscription: { status: subStatus, daysLeft, expiresAt: tenant.expiresAt, isReadOnly: tenant.status === 'read_only' },
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        phone: user.phone,
      },
    };
  }

  async sign(userId: string, tenantId: string | null, role: string, name: string, username: string) {
    const payload = { sub: userId, tenantId, role, name, username };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, { expiresIn: process.env.JWT_EXPIRES || '2h' }),
      this.jwt.signAsync({ ...payload, type: 'refresh' }, { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }),
    ]);
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken);
      if (payload.type !== 'refresh') throw new UnauthorizedException('无效的刷新令牌');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.active) throw new UnauthorizedException('用户不存在或已停用');
      const tenant = user.tenantId ? await this.prisma.tenant.findUnique({ where: { id: user.tenantId } }) : null;
      const { accessToken, refreshToken: newRefreshToken } = await this.sign(user.id, user.tenantId, user.role, user.name, user.username);
      return {
        accessToken,
        refreshToken: newRefreshToken,
        tenant: tenant ? { id: tenant.id, code: tenant.code, name: tenant.name } : null,
        user: { id: user.id, username: user.username, name: user.name, role: user.role, phone: user.phone },
      };
    } catch {
      throw new UnauthorizedException('刷新令牌已过期，请重新登录');
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      phone: user.phone,
      tenant: user.tenant ? { id: user.tenant.id, code: user.tenant.code, name: user.tenant.name } : null,
    };
  }
}
