// 业务单据编号生成：前缀 + 日期 + 4 位随机数
export function genNo(prefix: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${ymd}${rand}`;
}
