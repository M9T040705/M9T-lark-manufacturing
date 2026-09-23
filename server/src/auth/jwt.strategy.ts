import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  role: string;
  name: string;
  username: string;
}

// 角色 → 部门编码（用户未关联部门时的兜底映射）
const ROLE_TO_DEPT: Record<string, string> = {
  super_admin: 'management',
  boss: 'management',
  sales: 'sales',
  manager: 'production',
  worker: 'production',
  warehouse: 'warehouse',
  quality: 'quality',
  hr: 'hr',
  finance: 'finance',
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET') || 'dev-secret',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { department: true },
    });
    if (!user || !user.active) throw new UnauthorizedException('账号不存在或已停用');
    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name,
      username: user.username,
      departmentId: user.department?.id || null,
      dept: user.department?.code || ROLE_TO_DEPT[user.role] || 'production',
    };
  }
}
