import { Controller, Get, Post, Delete, Body, Query, Param, UseGuards, UseInterceptors, UploadedFile, ForbiddenException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { KnowledgeService } from './knowledge.service';
import { DocParserService } from './doc-parser.service';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@UseGuards(JwtAuthGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private knowledge: KnowledgeService,
    private prisma: PrismaService,
    private docParser: DocParserService,
  ) {}

  /** 列表（管理端） */
  @Get('docs')
  async list(
    @CurrentUser() user: AuthUser,
    @Query('departmentId') departmentId?: string,
    @Query('sourceType') sourceType?: string,
    @Query('search') search?: string,
  ) {
    return this.knowledge.list(user.tenantId, departmentId, sourceType, search);
  }

  /** 统计 */
  @Get('stats')
  async stats(@CurrentUser() user: AuthUser) {
    return this.knowledge.stats(user.tenantId);
  }

  /** 检索测试（部门隔离） */
  @Get('retrieve')
  async retrieve(
    @CurrentUser() user: AuthUser,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) return [];
    // 确保 departmentId 存在：用户未直接关联部门时，按 dept code 查库
    let departmentId = user.departmentId;
    if (!departmentId && user.dept) {
      const dept = await this.prisma.department.findFirst({
        where: { tenantId: user.tenantId, code: user.dept },
        select: { id: true },
      });
      departmentId = dept?.id || null;
    }
    return this.knowledge.search(
      user.tenantId,
      user.dept,
      departmentId,
      query,
      limit ? parseInt(limit) : 5,
    );
  }

  /** 入库文档（管理端：上传 SOP / 录入知识） */
  @Post('ingest')
  async ingest(@CurrentUser() user: any, @Body() body: any) {
    return this.knowledge.ingest(user.tenantId, {
      title: body.title,
      content: body.content,
      sourceType: body.sourceType || 'manual',
      sourceRef: body.sourceRef,
      departmentId: body.departmentId ?? null,
      sectionPath: body.sectionPath,
      sourceMeta: body.sourceMeta,
    });
  }

  /** 生成示例数据 */
  @Post('seed')
  async seed(@CurrentUser() user: any) {
    return this.knowledge.seedSampleData(user.tenantId);
  }

  /** 为已有文档补全向量化（迁移用） */
  @Post('backfill-vectors')
  async backfill(@CurrentUser() user: any) {
    return this.knowledge.backfillEmbeddings(user.tenantId);
  }

  /** 上传文档自动解析入库（支持 txt/md/csv/json/xlsx，PDF/Word 预留） */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: any,
    @Body() body: { departmentId?: string },
  ) {
    if (!file) throw new ForbiddenException('请选择文件');
    const tmpDir = path.join(process.cwd(), 'uploads', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${Date.now()}_${file.originalname}`);
    fs.writeFileSync(tmpPath, file.buffer);
    try {
      const parsed = await this.docParser.parse(tmpPath, file.originalname);
      const result = await this.knowledge.ingest(user.tenantId, {
        title: parsed.title,
        content: parsed.content,
        sourceType: parsed.sourceType,
        sourceRef: file.originalname,
        departmentId: body.departmentId || null,
      });
      return { ...result, fileName: file.originalname };
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }

  /** 删除文档（仅管理员可操作） */
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!['admin', 'super_admin'].includes(user.role)) {
      throw new ForbiddenException('仅管理员可删除知识库文档');
    }
    return this.knowledge.remove(user.tenantId, id);
  }
}
