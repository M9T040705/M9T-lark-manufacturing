/**
 * RAG 混合检索：关键词路召回 → 重排序
 * 步骤4：双路召回（当前实现关键词路；配置 embedding API 后启用向量路）
 * 步骤5：混合检索 + 重排序优化精准度
 */
import { extractKeywords } from './rag.pipeline';

export interface DocChunk {
  id: string;
  tenantId: string;
  departmentId: string | null;
  title: string;
  sourceType: string;
  sectionPath: string | null;
  content: string;
  keywords: string | null;
  chunkIndex: number;
}

export interface ScoredResult {
  doc: DocChunk;
  score: number;
  matchedTerms: string[];
}

/** 关键词路：在文档内容和关键词字段中匹配 */
export function keywordSearch(docs: DocChunk[], query: string): ScoredResult[] {
  const queryTerms = extractKeywords(query);
  if (queryTerms.length === 0 || docs.length === 0) return [];

  const scored: ScoredResult[] = docs.map((doc) => {
    const content = (doc.content || '').toLowerCase();
    const title = (doc.title || '').toLowerCase();
    const kwField = (doc.keywords || '').toLowerCase();
    const section = (doc.sectionPath || '').toLowerCase();

    let score = 0;
    const matched: string[] = [];

    for (const term of queryTerms) {
      const t = term.toLowerCase();
      // 标题命中权重最高
      if (title.includes(t)) {
        score += 5;
        matched.push(term);
      }
      // 关键词字段命中
      if (kwField.includes(t)) {
        score += 4;
        if (!matched.includes(term)) matched.push(term);
      }
      // 章节路径命中
      if (section.includes(t)) {
        score += 3;
        if (!matched.includes(term)) matched.push(term);
      }
      // 正文命中，按出现次数加权
      let count = 0;
      let idx = content.indexOf(t);
      while (idx !== -1 && count < 10) {
        count++;
        idx = content.indexOf(t, idx + 1);
      }
      if (count > 0) {
        score += Math.min(count * 1.5, 10);
        if (!matched.includes(term)) matched.push(term);
      }
    }

    return { doc, score, matchedTerms: matched };
  });

  return scored.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

/**
 * 步骤5：重排序
 * 当前用规则重排序：匹配密度 + 标题权重 + 章节权重
 * 后续可替换为 cross-encoder 重排序模型。
 */
export function rerank(results: ScoredResult[], query: string): ScoredResult[] {
  return results.map((r) => {
    // 归一化：匹配密度（命中词数/查询词数）
    const queryTerms = extractKeywords(query).length || 1;
    const density = r.matchedTerms.length / queryTerms;

    // 最终得分 = 原始关键词分 * (0.6 + 0.4 * 匹配密度)
    // 标题命中已经在 keywordSearch 加权，这里再轻微提权
    const titleBoost = r.doc.title && query.toLowerCase().includes(r.doc.title.slice(0, 4).toLowerCase()) ? 1.2 : 1;

    return { ...r, score: r.score * (0.6 + 0.4 * density) * titleBoost };
  }).sort((a, b) => b.score - a.score);
}

/** 检索入口：部门隔离 + 双路召回（当前关键词路）+ 重排序 */
export function retrieve(
  docs: DocChunk[],
  query: string,
  options: { limit?: number } = {},
): ScoredResult[] {
  const limit = options.limit || 5;
  // 关键词路召回
  const recalled = keywordSearch(docs, query);
  // 重排序
  const reranked = rerank(recalled, query);
  return reranked.slice(0, limit);
}
