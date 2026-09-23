import { Controller, Get, Post, Delete, Param, Query, UseGuards, UseInterceptors, UploadedFile, Req, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { FileService } from './file.service';
import * as fs from 'fs';

@UseGuards(JwtAuthGuard)
@Controller('files')
export class FileController {
  constructor(private fileService: FileService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: any) {
    return this.fileService.saveFile(user.tenantId, user.userId, file);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.fileService.list(user.tenantId, query);
  }

  @Get(':id/download')
  async download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: any) {
    const files = await this.fileService.list(user.tenantId, { page: 1, pageSize: 1 });
    const file = (files as any).items.find((f: any) => f.id === id);
    if (!file) return res.status(404).send('Not found');
    const localPath = this.fileService.getFilePath(file.path);
    if (!fs.existsSync(localPath)) return res.status(404).send('File not found');
    res.download(localPath, file.originalName);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fileService.remove(user.tenantId, id);
  }
}
