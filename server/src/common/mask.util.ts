/**
 * 敏感数据脱敏工具
 * 手机号、身份证、邮箱、姓名等字段在列表和日志中脱敏显示
 */

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const s = String(phone);
  if (s.length < 7) return s;
  return s.slice(0, 3) + '****' + s.slice(-4);
}

export function maskIdCard(id: string | null | undefined): string {
  if (!id) return '';
  const s = String(id);
  if (s.length < 8) return s;
  return s.slice(0, 4) + '**********' + s.slice(-4);
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const s = String(email);
  const at = s.indexOf('@');
  if (at <= 1) return s;
  return s[0] + '***' + s.slice(at);
}

export function maskName(name: string | null | undefined): string {
  if (!name) return '';
  const s = String(name);
  if (s.length <= 1) return s;
  if (s.length === 2) return s[0] + '*';
  return s[0] + '*'.repeat(s.length - 2) + s.slice(-1);
}

export function maskAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '';
  // 财务金额在非财务角色下显示为 ***
  return '***';
}

/** 通用脱敏：根据字段名自动选择脱敏方式 */
export function maskField(fieldName: string, value: any): any {
  if (value === null || value === undefined) return value;
  const name = fieldName.toLowerCase();
  if (name.includes('phone') || name.includes('mobile') || name === 'tel') return maskPhone(value);
  if (name.includes('idcard') || name.includes('id_card') || name === 'idno') return maskIdCard(value);
  if (name.includes('email') || name === 'mail') return maskEmail(value);
  if (name === 'name' || name.includes('username') === false && name === 'name') return maskName(value);
  return value;
}

/** 对对象数组中的指定字段做脱敏 */
export function maskRows(rows: Record<string, any>[], fields: string[]): Record<string, any>[] {
  return rows.map((row) => {
    const copy = { ...row };
    for (const f of fields) {
      if (copy[f] !== undefined) copy[f] = maskField(f, copy[f]);
    }
    return copy;
  });
}
