import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';

/**
 * 文档解析服务：将上传的文件转为纯文本
 * 支持：.txt / .md / .csv / .json
 * PDF/Word：预留接口，生产环境建议接入 pdf-parse / mammoth
 */
@Injectable()
export class DocParserService {
  private readonly logger = new Logger(DocParserService.name);

  async parse(filePath: string, originalName: string): Promise<{ title: string; content: string; sourceType: string }> {
    const ext = originalName.split('.').pop()?.toLowerCase() || '';
    const title = originalName.replace(/\.[^.]+$/, '');

    switch (ext) {
      case 'txt':
      case 'md':
      case 'csv':
      case 'json':
      case 'log':
        return { title, content: fs.readFileSync(filePath, 'utf-8'), sourceType: 'sop_file' };
      case 'pdf':
        return this.parsePdf(filePath, title);
      case 'doc':
      case 'docx':
        return this.parseWord(filePath, title);
      case 'xlsx':
      case 'xls':
        return this.parseExcel(filePath, title);
      default:
        // 未知格式尝试按文本读取
        try {
          return { title, content: fs.readFileSync(filePath, 'utf-8'), sourceType: 'sop_file' };
        } catch {
          return { title, content: '', sourceType: 'sop_file' };
        }
    }
  }

  private async parsePdf(filePath: string, title: string): Promise<{ title: string; content: string; sourceType: string }> {
    // PDF 解析需要 pdf-parse 依赖，生产环境安装后启用
    // 目前返回空内容，记录日志
    this.logger.warn(`PDF 解析未启用（需安装 pdf-parse）：${title}`);
    return { title, content: `[PDF 文件] ${title} - 请安装 pdf-parse 依赖后重新上传以提取文本`, sourceType: 'sop_file' };
  }

  private async parseWord(filePath: string, title: string): Promise<{ title: string; content: string; sourceType: string }> {
    // Word 解析需要 mammoth 依赖
    this.logger.warn(`Word 解析未启用（需安装 mammoth）：${title}`);
    return { title, content: `[Word 文件] ${title} - 请安装 mammoth 依赖后重新上传以提取文本`, sourceType: 'sop_file' };
  }

  private async parseExcel(filePath: string, title: string): Promise<{ title: string; content: string; sourceType: string }> {
    // Excel 解析需要 exceljs（已安装）
    try {
      const ExcelJS = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      let content = '';
      for (const ws of wb.worksheets) {
        content += `## 工作表：${ws.name}\n`;
        ws.eachRow({ includeEmpty: false }, (row) => {
          const vals = row.values as any[];
          content += vals.filter(Boolean).join(' | ') + '\n';
        });
        content += '\n';
      }
      return { title, content, sourceType: 'sop_file' };
    } catch (e: any) {
      this.logger.warn(`Excel 解析失败：${e?.message}`);
      return { title, content: `[Excel 文件] ${title} - 解析失败`, sourceType: 'sop_file' };
    }
  }
}
