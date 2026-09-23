import { Injectable, Logger } from '@nestjs/common';

/**
 * Embedding 服务：硅基流动（SiliconFlow）OpenAI 兼容接口
 * 支持 BAAI/bge-m3 等多语言 embedding 模型，输出 1024 维向量
 * 文档：https://docs.siliconflow.cn/api-reference/embeddings/create-embeddings
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutSec: number;
  readonly enabled: boolean;
  readonly dimension: number;

  constructor() {
    this.baseUrl = (process.env.EMBEDDING_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/$/, '');
    this.apiKey = process.env.EMBEDDING_API_KEY || '';
    this.model = process.env.EMBEDDING_MODEL || 'BAAI/bge-m3';
    this.timeoutSec = Number(process.env.EMBEDDING_TIMEOUT || 30);
    this.enabled = !!this.apiKey;
    this.dimension = this.model.includes('bge-m3') ? 1024 : 768;
    if (this.enabled) {
      this.logger.log(`Embedding 已启用：${this.baseUrl} / ${this.model} (${this.dimension}维)`);
    } else {
      this.logger.warn('Embedding 未配置 EMBEDDING_API_KEY，向量检索将降级为纯关键词检索');
    }
  }

  /** 批量生成 embedding，自动分批（硅基流动单批最多 32 条） */
  async embed(texts: string[]): Promise<number[][]> {
    if (!this.enabled || texts.length === 0) return [];
    const BATCH = 32;
    const all: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const vecs = await this.embedBatch(batch);
      all.push(...vecs);
    }
    return all;
  }

  /** 单条生成 */
  async embedOne(text: string): Promise<number[] | null> {
    const vecs = await this.embed([text]);
    return vecs[0] || null;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutSec * 1000);
    try {
      const resp = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Embedding HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }
      const data = await resp.json();
      const arr = data?.data as Array<{ embedding: number[]; index: number }>;
      if (!Array.isArray(arr)) throw new Error('Embedding 返回缺少 data 数组');
      arr.sort((a, b) => a.index - b.index);
      return arr.map((item) => item.embedding);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 余弦相似度 */
  static cosineSim(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom > 0 ? dot / denom : 0;
  }

  /** 向量序列化为 JSON 字符串存 SQLite */
  static serialize(vec: number[]): string {
    return JSON.stringify(vec);
  }

  /** 反序列化 */
  static deserialize(s: string | null): number[] | null {
    if (!s) return null;
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  }
}
