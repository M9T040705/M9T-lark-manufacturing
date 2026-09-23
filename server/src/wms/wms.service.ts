import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { genNo } from '../common/gen-no';
import { StockMoveDto } from './dto/wms.dto';
import { FeishuService } from '../feishu/feishu.service';

@Injectable()
export class WmsService {
  constructor(
    private prisma: PrismaService,
    private feishu: FeishuService,
  ) {}

  private t(user: AuthUser) {
    return { tenantId: user.tenantId as string };
  }

  // 库存列表（含产品信息、安全库存预警）
  async listInventory(user: AuthUser, lowOnly = false) {
    const rows = await this.prisma.inventory.findMany({
      where: this.t(user),
      include: { product: true },
      orderBy: { warehouse: 'asc' },
    });
    let list = rows.map((r) => ({
      ...r,
      batchNo: r.batchNo ?? '',
      lowStock: r.product.safetyStock > 0 && r.qty <= r.product.safetyStock,
    }));
    // 按产品汇总
    const map = new Map<string, { productId: string; code: string; name: string; spec: string; unit: string; type: string; qty: number; safetyStock: number; lowStock: boolean }>();
    for (const r of list) {
      const cur = map.get(r.productId) || {
        productId: r.productId,
        code: r.product.code,
        name: r.product.name,
        spec: r.product.spec,
        unit: r.product.unit,
        type: r.product.type,
        qty: 0,
        safetyStock: r.product.safetyStock,
        lowStock: false,
      };
      cur.qty += r.qty;
      cur.lowStock = cur.safetyStock > 0 && cur.qty <= cur.safetyStock;
      map.set(r.productId, cur);
    }
    let summary = Array.from(map.values());
    if (lowOnly) summary = summary.filter((s) => s.lowStock);
    return { summary, detail: list };
  }

  // 出入库 / 领料（事务，保证库存一致）
  async move(user: AuthUser, dto: StockMoveDto) {
    const tenantId = user.tenantId as string;
    const warehouse = dto.warehouse || '默认仓';
    const batchNo = dto.batchNo || '';
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId },
    });
    if (!product) throw new NotFoundException('物料不存在');

    const moveNo = genNo(dto.type === 'in' ? 'IN' : dto.type === 'out' ? 'OUT' : 'PICK');

    const move = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({
        where: {
          tenantId_productId_warehouse_batchNo: { tenantId, productId: dto.productId, warehouse, batchNo },
        },
      });

      if (dto.type === 'in') {
        // 入库：upsert 增加
        if (inv) {
          await tx.inventory.update({ where: { id: inv.id }, data: { qty: inv.qty + dto.qty } });
        } else {
          await tx.inventory.create({
            data: { tenantId, productId: dto.productId, warehouse, batchNo, qty: dto.qty },
          });
        }
      } else {
        // 出库 / 领料：上料防错——校验批次与库存
        if (!inv || inv.qty < dto.qty) {
          const have = inv ? inv.qty : 0;
          throw new BadRequestException(
            `上料/出库失败：${product.name}${batchNo ? `（批次${batchNo}）` : ''}库存不足，需 ${dto.qty}，现有 ${have}`,
          );
        }
        await tx.inventory.update({ where: { id: inv.id }, data: { qty: inv.qty - dto.qty } });
      }

      return tx.stockMove.create({
        data: {
          tenantId,
          moveNo,
          type: dto.type,
          productId: dto.productId,
          qty: dto.qty,
          batchNo,
          warehouse,
          refType: dto.refType,
          refNo: dto.refNo,
          operatorId: user.userId,
          remark: dto.remark,
        },
      });
    });

    // 出库/领料后做低库存预警（异步、内部已兜底，绝不影响出入库结果）
    if (dto.type !== 'in') {
      this.checkLowStock(tenantId, dto.productId);
    }
    return move;
  }

  // 汇总该物料各批次库存，低于安全库存则推送飞书群（带 1 小时去重）
  private async checkLowStock(tenantId: string, productId: string) {
    try {
      const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
      if (!product || product.safetyStock <= 0) return;
      const invs = await this.prisma.inventory.findMany({ where: { tenantId, productId } });
      const qty = invs.reduce((sum, i) => sum + i.qty, 0);
      if (qty <= product.safetyStock) {
        await this.feishu.notifyLowStock(tenantId, {
          code: product.code,
          name: product.name,
          unit: product.unit,
          qty,
          safetyStock: product.safetyStock,
        });
      }
    } catch {
      // 预警失败不影响主流程
    }
  }

  listMoves(user: AuthUser, type = '') {
    return this.prisma.stockMove.findMany({
      where: { ...this.t(user), ...(type ? { type } : {}) },
      include: { product: { select: { name: true, code: true, unit: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
