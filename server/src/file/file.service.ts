import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FileService {
  constructor(private prisma: PrismaService) {}

  private getUploadDir() {
    const dir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async saveFile(tenantId: string, uploaderId: string, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    const ext = path.extname(file.originalname) || '';
    const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const dir = this.getUploadDir();
    const filePath = path.join(dir, storedName);
    fs.writeFileSync(filePath, file.buffer);
    return this.prisma.fileAsset.create({
      data: {
        tenantId, uploaderId, name: storedName, originalName: file.originalname,
        mimeType: file.mimetype, size: file.size, path: `uploads/${storedName}`, storage: 'local',
      },
    });
  }

  async list(tenantId: string, query: { refType?: string; refId?: string; page?: number; pageSize?: number }) {
    const page = Number(query.page) || 1;
    const pageSize = Math.min(Number(query.pageSize) || 20, 100);
    const where: any = { tenantId };
    if (query.refType) where.refType = query.refType;
    if (query.refId) where.refId = query.refId;
    const [total, items] = await Promise.all([
      this.prisma.fileAsset.count({ where }),
      this.prisma.fileAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page, pageSize, items };
  }

  async remove(tenantId: string, id: string) {
    const file = await this.prisma.fileAsset.findFirst({ where: { id, tenantId } });
    if (file) {
      const localPath = path.join(process.cwd(), file.path);
      if (fs.existsSync(localPath)) try { fs.unlinkSync(localPath); } catch {}
    }
    return this.prisma.fileAsset.deleteMany({ where: { id, tenantId } });
  }

  getFilePath(relativePath: string) {
    return path.join(process.cwd(), relativePath);
  }
}
