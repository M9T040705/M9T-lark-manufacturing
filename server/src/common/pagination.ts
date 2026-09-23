export function toPage(page?: number, pageSize?: number) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(200, Math.max(1, Number(pageSize) || 20));
  return { skip: (p - 1) * ps, take: ps, page: p, pageSize: ps };
}

export async function pageResult<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return { list: data, total, page, pageSize };
}
