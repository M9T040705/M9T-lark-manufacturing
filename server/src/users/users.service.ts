import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  phone: true,
  active: true,
  tenantId: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private scope(user: AuthUser) {
    return user.role === 'super_admin' ? {} : { tenantId: user.tenantId };
  }

  list(user: AuthUser) {
    return this.prisma.user.findMany({
      where: this.scope(user),
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
  }

  async create(user: AuthUser, dto: CreateUserDto) {
    const tenantId = user.role === 'super_admin' ? dto.tenantId : user.tenantId;
    if (!tenantId) throw new BadRequestException('缺少所属租户');
    const exists = await this.prisma.user.findUnique({
      where: { tenantId_username: { tenantId, username: dto.username } },
    });
    if (exists) throw new BadRequestException('用户名已存在');
    const passwordHash = await bcrypt.hash(dto.password || '123456', 10);
    return this.prisma.user.create({
      data: {
        tenantId,
        username: dto.username,
        name: dto.name,
        role: dto.role,
        phone: dto.phone,
        passwordHash,
      },
      select: SELECT,
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateUserDto) {
    await this.ensure(user, id);
    return this.prisma.user.update({
      where: { id },
      data: { name: dto.name, role: dto.role, phone: dto.phone, active: dto.active },
      select: SELECT,
    });
  }

  async resetPassword(user: AuthUser, id: string, password: string) {
    await this.ensure(user, id);
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { ok: true };
  }

  private async ensure(user: AuthUser, id: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('用户不存在');
    if (user.role !== 'super_admin' && target.tenantId !== user.tenantId) {
      throw new NotFoundException('用户不存在');
    }
  }
}
