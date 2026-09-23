/**
 * RAG 标准化流水线：清洗 → 智能切片(重叠窗口) → 关键词提取
 * 第6步可扩展：后续接入 embedding API 后，在 ingest 时同步生成向量。
 */

export interface RawDocInput {
  title: string;
  content: string;
  sourceType: string;
  sourceRef?: string;
  departmentId?: string | null;
  sectionPath?: string;
  sourceMeta?: Record<string, any>;
}

export interface Chunk {
  content: string;
  chunkIndex: number;
  sectionPath?: string;
  keywords: string[];
}

/** 步骤1：数据清洗——统一格式、去冗余、规整结构 */
export function cleanText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')           // 行尾空白
    .replace(/\n{3,}/g, '\n\n')            // 多个空行压缩为一个
    .replace(/[ \t]{2,}/g, ' ')            // 连续空格压缩
    .replace(/[ \t]*\n[ \t]*/g, '\n')      // 行首行尾空白
    .trim();
}

/** 步骤2：智能切片——按段落/章节切分，重叠窗口保证语义连贯 */
export function splitIntoChunks(
  text: string,
  chunkSize = 500,
  overlap = 80,
): Chunk[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  // 按双换行分段落，保留章节路径（简单提取标题行）
  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: Chunk[] = [];
  let current = '';
  let chunkIndex = 0;
  let sectionPath: string | undefined;

  const flush = (remainder?: string) => {
    const content = (remainder ?? current).trim();
    if (!content) return;
    chunks.push({
      content,
      chunkIndex: chunkIndex++,
      sectionPath,
      keywords: extractKeywords(content),
    });
  };

  for (const para of paragraphs) {
    // 简单章节路径识别：以"第X章""X.X""一、"等开头的行
    const trimmed = para.trim();
    if (/^(第[一二三四五六七八九十\d]+[章节]|[一二三四五六七八九十]+[、.]|\d+\.\d+|\d+[、.])/.test(trimmed)) {
      sectionPath = trimmed.slice(0, 60);
    }

    // 如果当前段落本身就超长，按句子再切
    if (para.length > chunkSize * 1.5) {
      if (current.trim()) {
        flush();
        current = '';
      }
      const sentences = para.match(/[^。！？；\n]+[。！？；]?/g) || [para];
      let sub = '';
      for (const s of sentences) {
        if ((sub + s).length > chunkSize && sub) {
          chunks.push({
            content: sub.trim(),
            chunkIndex: chunkIndex++,
            sectionPath,
            keywords: extractKeywords(sub),
          });
          // 重叠窗口：保留末尾 overlap 字符
          sub = sub.slice(-overlap) + s;
        } else {
          sub += s;
        }
      }
      if (sub.trim()) {
        chunks.push({
          content: sub.trim(),
          chunkIndex: chunkIndex++,
          sectionPath,
          keywords: extractKeywords(sub),
        });
      }
      continue;
    }

    // 普通段落累积
    if ((current + '\n' + para).length > chunkSize && current.trim()) {
      flush();
      // 重叠：上一个块的尾部带入下一个块头部
      current = current.slice(-overlap) + '\n' + para;
    } else {
      current = current ? current + '\n' + para : para;
    }
  }
  if (current.trim()) flush();

  return chunks;
}

/** 步骤3：关键词提取——用于关键词路召回 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '会', '着', '没有', '看', '好', '自己',
    '这', '他', '她', '它', '们', '那', '些', '个', '什', '么', '怎', '为', '以',
    '及', '等', '被', '把', '让', '向', '从', '对', '与', '或', '而', '且', '如',
    '需', '应', '当', '可', '以', '须', '请', '将', '该', '其', '之', '于',
  ]);

  // 提取：英文单词 + 中文2-4字词组（简单n-gram）
  const enWords = (text.match(/[a-zA-Z][a-zA-Z0-9_]+/g) || []).map((w) => w.toLowerCase());
  const cnChars = text.replace(/[^\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(Boolean);
  const cnGrams: string[] = [];
  for (const seg of cnChars) {
    for (let len = 2; len <= 4 && len <= seg.length; len++) {
      for (let i = 0; i <= seg.length - len; i++) {
        cnGrams.push(seg.slice(i, i + len));
      }
    }
  }

  // 统计频率，过滤停用词，取 top
  const freq = new Map<string, number>();
  const add = (w: string) => {
    if (stopWords.has(w) || w.length < 2) return;
    freq.set(w, (freq.get(w) || 0) + 1);
  };
  enWords.forEach(add);
  cnGrams.forEach(add);

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w);
}
