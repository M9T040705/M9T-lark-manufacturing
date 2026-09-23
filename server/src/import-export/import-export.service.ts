import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/**
 * 通用 Excel 导入导出服务
 * 导出：传入表头和数据行，生成 Buffer
 * 导入：解析 Excel 文件，返回 JSON 数组
 */
@Injectable()
export class ImportExportService {
  async exportExcel(headers: { key: string; label: string; width?: number }[], rows: Record<string, any>[], sheetName = 'Sheet1'): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    ws.columns = headers.map((h) => ({ header: h.label, key: h.key, width: h.width || 15 }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    for (const row of rows) {
      ws.addRow(row);
    }
    const buffer: any = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importExcel(buffer: Buffer): Promise<{ headers: string[]; rows: Record<string, any>[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value || '');
    });
    const rows: Record<string, any>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, any> = {};
      row.eachCell((cell, colNumber) => {
        const key = headers[colNumber - 1] || `col${colNumber}`;
        let val: any = cell.value;
        if (val && typeof val === 'object' && 'text' in val) val = val.text;
        if (val && typeof val === 'object' && 'result' in val) val = val.result;
        obj[key] = val;
      });
      rows.push(obj);
    });
    return { headers, rows };
  }
}
