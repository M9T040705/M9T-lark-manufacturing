import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { cleanText, splitIntoChunks, extractKeywords, RawDocInput } from './rag.pipeline';
import { retrieve, keywordSearch, rerank, DocChunk, ScoredResult } from './rag.retriever';
import { EmbeddingService } from './embedding.service';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  constructor(
    private prisma: PrismaService,
    private embedding: EmbeddingService,
  ) {}

  /** 步骤1-3：完整流水线入库（清洗→切片→关键词→向量化） */
  async ingest(tenantId: string, input: RawDocInput) {
    const chunks = splitIntoChunks(input.content, 500, 80);
    if (chunks.length === 0) throw new BadRequestException('文档内容为空或清洗后无有效片段');

    // 批量生成 embedding（硅基流动，每批32条）
    let embeddings: (number[] | null)[] = chunks.map(() => null);
    if (this.embedding.enabled) {
      try {
        const texts = chunks.map((c) => `${input.title}\n${c.content}`);
        embeddings = await this.embedding.embed(texts);
        this.logger.log(`向量化完成：${input.title} → ${chunks.length} 个切片`);
      } catch (e: any) {
        this.logger.warn(`向量化失败，降级为纯关键词：${e?.message || e}`);
      }
    }

    const records = chunks.map((c, i) => ({
      tenantId,
      departmentId: input.departmentId ?? null,
      title: input.title,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      sectionPath: c.sectionPath ?? input.sectionPath ?? null,
      content: c.content,
      chunkIndex: c.chunkIndex,
      chunkSize: 500,
      keywords: c.keywords.join(','),
      embedding: embeddings[i] ? EmbeddingService.serialize(embeddings[i]!) : null,
      sourceMeta: input.sourceMeta ? JSON.stringify(input.sourceMeta) : null,
    }));

    await this.prisma.knowledgeDoc.createMany({ data: records });
    return { chunksIngested: records.length, title: input.title, vectorized: embeddings.filter(Boolean).length };
  }

  /**
   * 步骤4-5：部门隔离混合检索（关键词路 + 向量路 + 重排序）
   * management 部门可见全部；其他部门仅见本部门 + 全局文档
   */
  async search(
    tenantId: string,
    dept: string,
    departmentId: string | null,
    query: string,
    limit = 5,
  ) {
    // 部门隔离：确定可见范围
    let where: any = { tenantId };
    if (dept !== 'management' && departmentId) {
      where.OR = [{ departmentId }, { departmentId: null }];
    }

    const docs = await this.prisma.knowledgeDoc.findMany({
      where,
      select: {
        id: true, tenantId: true, departmentId: true, title: true,
        sourceType: true, sectionPath: true, content: true,
        keywords: true, chunkIndex: true, embedding: true,
      },
    });

    // 关键词路召回
    const kwResults = keywordSearch(docs as DocChunk[], query);

    // 向量路召回（如果 embedding 可用）
    let vecResults: ScoredResult[] = [];
    if (this.embedding.enabled) {
      try {
        const queryVec = await this.embedding.embedOne(query);
        if (queryVec) {
          const withVec = docs.filter((d) => d.embedding);
          const scored: ScoredResult[] = withVec.map((d) => {
            const vec = EmbeddingService.deserialize(d.embedding);
            const sim = vec ? EmbeddingService.cosineSim(queryVec, vec) : 0;
            return {
              doc: d as DocChunk,
              score: sim * 10, // 余弦相似度 0-1 映射到 0-10 分，与关键词路量级对齐
              matchedTerms: ['[向量匹配]'],
            };
          });
          vecResults = scored.filter((r) => r.score > 1).sort((a, b) => b.score - a.score).slice(0, limit * 2);
        }
      } catch (e: any) {
        this.logger.warn(`向量检索失败，使用关键词路：${e?.message || e}`);
      }
    }

    // 双路融合：按 doc.id 合并，取最高分
    const merged = new Map<string, ScoredResult>();
    for (const r of kwResults) merged.set(r.doc.id, r);
    for (const r of vecResults) {
      const existing = merged.get(r.doc.id);
      if (existing) {
        // 双路命中：加权融合（关键词 0.6 + 向量 0.4）
        merged.set(r.doc.id, { ...r, score: existing.score * 0.6 + r.score * 0.4, matchedTerms: [...new Set([...existing.matchedTerms, ...r.matchedTerms])] });
      } else {
        merged.set(r.doc.id, r);
      }
    }

    // 重排序
    const all = Array.from(merged.values());
    const reranked = rerank(all, query);
    const results = reranked.slice(0, limit);

    return results.map((r) => ({
      id: r.doc.id,
      title: r.doc.title,
      sourceType: r.doc.sourceType,
      sectionPath: r.doc.sectionPath,
      content: r.doc.content,
      chunkIndex: r.doc.chunkIndex,
      score: Math.round(r.score * 100) / 100,
      matchedTerms: r.matchedTerms,
      departmentId: r.doc.departmentId,
    }));
  }

  /** 给 agent.service 用：构建 RAG 上下文文本 */
  async buildRagContext(
    tenantId: string,
    dept: string,
    departmentId: string | null,
    query: string,
  ): Promise<{ context: string; sources: any[] }> {
    const results = await this.search(tenantId, dept, departmentId, query, 4);
    if (results.length === 0) return { context: '', sources: [] };

    const lines = results.map((r, i) => {
      const src = r.sectionPath ? `${r.title} / ${r.sectionPath}` : r.title;
      return `【参考资料${i + 1}】来源：${src}\n${r.content}`;
    });

    return {
      context: `以下是从企业知识库中检索到的相关资料，请基于这些资料回答用户问题：\n\n${lines.join('\n\n---\n\n')}`,
      sources: results,
    };
  }

  /** 列表（管理端，按部门过滤） */
  async list(tenantId: string, departmentId?: string, sourceType?: string, search?: string) {
    const where: any = { tenantId };
    if (departmentId) where.departmentId = departmentId;
    if (sourceType) where.sourceType = sourceType;
    if (search) where.title = { contains: search };

    const docs = await this.prisma.knowledgeDoc.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, title: true, sourceType: true, sourceRef: true,
        departmentId: true, sectionPath: true, chunkIndex: true,
        content: true, keywords: true, embedding: true, createdAt: true,
      },
    });
    return docs.map((d) => ({ ...d, hasVector: !!d.embedding }));
  }

  /** 统计：按部门、按来源类型、向量化覆盖率 */
  async stats(tenantId: string) {
    const bySource = await this.prisma.knowledgeDoc.groupBy({
      by: ['sourceType'],
      where: { tenantId },
      _count: { id: true },
    });
    const byDept = await this.prisma.knowledgeDoc.groupBy({
      by: ['departmentId'],
      where: { tenantId },
      _count: { id: true },
    });
    const total = await this.prisma.knowledgeDoc.count({ where: { tenantId } });
    const vectorized = await this.prisma.knowledgeDoc.count({ where: { tenantId, embedding: { not: null } } });
    return {
      total,
      vectorized,
      vectorCoverage: total > 0 ? Math.round((vectorized / total) * 100) : 0,
      bySource: bySource.map((s) => ({ sourceType: s.sourceType, count: s._count.id })),
      byDept: byDept.map((d) => ({ departmentId: d.departmentId, count: d._count.id })),
    };
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.knowledgeDoc.deleteMany({ where: { id, tenantId } });
    return { ok: true };
  }

  /** 清空某租户的知识库（谨慎） */
  async clear(tenantId: string) {
    await this.prisma.knowledgeDoc.deleteMany({ where: { tenantId } });
    return { ok: true };
  }

  /** 为已有文档补全向量化（迁移用） */
  async backfillEmbeddings(tenantId: string): Promise<{ processed: number; success: number }> {
    if (!this.embedding.enabled) return { processed: 0, success: 0 };
    const docs = await this.prisma.knowledgeDoc.findMany({
      where: { tenantId, embedding: null },
      select: { id: true, title: true, content: true },
      take: 500,
    });
    if (docs.length === 0) return { processed: 0, success: 0 };

    let success = 0;
    for (let i = 0; i < docs.length; i += 32) {
      const batch = docs.slice(i, i + 32);
      try {
        const texts = batch.map((d) => `${d.title}\n${d.content}`);
        const vecs = await this.embedding.embed(texts);
        for (let j = 0; j < batch.length; j++) {
          if (vecs[j]) {
            await this.prisma.knowledgeDoc.update({
              where: { id: batch[j].id },
              data: { embedding: EmbeddingService.serialize(vecs[j]!) },
            });
            success++;
          }
        }
      } catch (e: any) {
        this.logger.warn(`批量向量化失败 [${i}-${i + batch.length}]: ${e?.message || e}`);
      }
    }
    return { processed: docs.length, success };
  }

  // ============================================================
  // 示例数据：各部门 SOP / 规范 / 制度
  // ============================================================
  async seedSampleData(tenantId: string) {
    const departments = await this.prisma.department.findMany({ where: { tenantId } });
    const deptMap: Record<string, string> = {};
    for (const d of departments) deptMap[d.code] = d.id;

    const samples = this.getSampleSOPs();
    let total = 0;
    for (const s of samples) {
      const deptId = s.deptCode ? deptMap[s.deptCode] ?? null : null;
      await this.ingest(tenantId, {
        title: s.title,
        content: s.content,
        sourceType: 'sop_file',
        sourceRef: `${s.deptCode || 'global'}_${s.title}.md`,
        departmentId: deptId,
        sourceMeta: { category: 'SOP', version: 'V1.0', author: '系统预置' },
      });
      total++;
    }
    return { docsIngested: total };
  }

  private getSampleSOPs(): Array<{ title: string; deptCode: string; content: string }> {
    return [
      {
        title: '生产部-安全生产操作规程',
        deptCode: 'production',
        content: `第一章 总则
第一条 为规范生产现场安全操作，保障员工人身安全和设备正常运行，特制定本规程。
第二条 本规程适用于生产车间所有操作人员和管理人员。

第二章 开机前检查
第三条 操作人员上岗前必须穿戴好劳保用品：安全帽、护目镜、防砸鞋、工作服。
第四条 开机前检查设备电气线路是否完好，急停按钮是否有效，润滑系统是否正常。
第五条 检查工作区域是否有障碍物，通道是否畅通，消防器材是否在位。

第三章 操作规范
第六条 设备运转中严禁将手伸入危险区域，严禁佩戴手套操作旋转刀具。
第七条 更换模具或刀具时必须停机并挂"禁止合闸"警示牌。
第八条 发现异常声响、振动或气味时立即按下急停按钮并上报班组长。
第九条 严禁酒后上岗、疲劳作业，严禁在车间内追逐打闹。

第四章 停机与交接班
第十条 生产结束后按顺序停机，清理工作区域，关闭电源和气源。
第十一条 交接班时必须填写设备运行记录，如实反映当班生产情况和异常问题。
第十二条 未完成交接班手续不得离岗。

第五章 应急处理
第十三条 发生人身伤害立即停机并拨打急救电话，保护现场。
第十四条 发生火灾立即使用灭火器并疏散，同时上报安全部门。
`,
      },
      {
        title: '生产部-设备日常保养手册',
        deptCode: 'production',
        content: `第一章 日保养
第一条 每日班前擦拭设备外表，保持清洁无油污。
第二条 检查导轨、丝杆润滑情况，按规定加注润滑油。
第三条 检查气压系统压力是否在0.5-0.7MPa范围内。

第二章 周保养
第四条 每周清理切削液水箱，更换或过滤切削液。
第五条 检查皮带松紧度，紧固各连接螺栓。
第六条 校验安全防护装置是否灵敏。

第三章 月保养
第七条 每月检查电气柜散热风扇和接线端子。
第八条 校准压力表和温控仪。
第九条 记录保养日志，发现隐患及时报修。
`,
      },
      {
        title: '质量部-进料检验规范',
        deptCode: 'quality',
        content: `第一章 检验范围
第一条 所有外购原材料、外协件进厂后必须经进料检验（IQC）合格方可入库。
第二条 检验依据：采购合同、技术图纸、检验作业指导书。

第二章 抽样方案
第三条 一般物料按GB/T 2828.1一般检验水平II抽样。
第四条 关键物料按全检或加严检验方案执行。
第五条 检验项目包括：外观、尺寸、材质证明、数量核对。

第三章 不合格品处理
第六条 检验不合格批次挂红色"不合格"标识，隔离存放。
第七条 填写《不合格品报告》，通知采购和供应商。
第八条 处理方式：退货、换货、让步接收（需技术部审批）。
`,
      },
      {
        title: '质量部-成品出厂检验标准',
        deptCode: 'quality',
        content: `第一章 检验要求
第一条 每批成品出厂前必须经成品检验（OQC）合格。
第二条 检验项目：外观、尺寸精度、装配质量、功能测试、包装完整性。
第三条 关键尺寸按图纸公差100%检测。

第二章 判定标准
第四条 外观缺陷不得影响使用和外观，具体限度参考外观限度样品。
第五条 功能测试必须100%通过，记录测试数据。
第六条 检验合格签发《产品合格证》，不合格不得出厂。
`,
      },
      {
        title: '仓储部-入库作业规范',
        deptCode: 'warehouse',
        content: `第一章 入库流程
第一条 物料到厂后核对送货单与采购订单，确认物料名称、规格、数量。
第二条 通知质量部进行进料检验，检验合格后方可办理入库。
第三条 入库时在系统中录入：物料编码、批次号、数量、入库日期、库位。

第二章 库位管理
第四条 物料按品类分区存放：原料区、半成品区、成品区、不合格品区。
第五条 遵循先进先出原则，同物料新批次放在旧批次后方。
第六条 易燃易爆物品单独存放于危险品仓库，远离火源。

第三章 账务管理
第七条 每日核对系统库存与实物，差异超过0.5%需查明原因。
第八条 每月末进行全面盘点，编制盘点报告。
`,
      },
      {
        title: '仓储部-出库与领料流程',
        deptCode: 'warehouse',
        content: `第一章 领料流程
第一条 生产领料凭《领料单》，需车间主任签字确认。
第二条 仓管员按领料单备料，核对物料编码和数量。
第三条 出库时系统扣减库存，领料人签字确认。

第二章 发货流程
第四条 成品发货凭《发货通知单》，核对客户、产品、数量。
第五条 发货前检查包装完整性和随附文件（合格证、装箱单）。
第六条 系统更新发货状态，通知物流安排运输。
`,
      },
      {
        title: '销售部-客户拜访规范',
        deptCode: 'sales',
        content: `第一章 拜访前准备
第一条 拜访前了解客户背景、近期采购记录和行业动态。
第二条 准备产品资料、报价单、样品等物料。
第三条 提前与客户确认拜访时间和地点。

第二章 拜访要求
第四条 着装整洁，准时到达，不得迟到超过10分钟。
第五条 沟通时记录客户需求、反馈和竞品信息。
第六条 拜访结束后24小时内填写《客户拜访记录》并录入系统。

第三章 客户分级
第七条 A级客户（月采购额>10万）每周至少拜访一次。
第八条 B级客户每月拜访一次。
第九条 C级客户每季度联系一次。
`,
      },
      {
        title: '销售部-报价与合同流程',
        deptCode: 'sales',
        content: `第一章 报价流程
第一条 收到客户询价后，2个工作日内提供正式报价单。
第二条 报价需包含：产品名称、规格、单价、交货期、付款方式、有效期。
第三条 低于标准价格的报价需销售经理审批。

第二章 合同签订
第四条 合同条款需经法务和财务审核。
第五条 合同签订后在系统中创建订单，同步给生产和仓储。
第六条 合同变更需走变更审批流程，不得口头修改。
`,
      },
      {
        title: '人事部-员工考勤与请假制度',
        deptCode: 'hr',
        content: `第一章 考勤规定
第一条 工作时间：周一至周五 8:00-17:30，午休12:00-13:00。
第二条 上下班须打卡，迟到15分钟以内扣50元，超过15分钟按旷工半天处理。
第三条 每月允许2次忘打卡补录机会，超过按迟到处理。

第二章 请假流程
第四条 事假需提前1天在系统提交申请，部门经理审批。
第五条 病假需提供医院证明，3天以内部门经理审批，3天以上总经理审批。
第六条 年假需提前3天申请，由人事统筹安排。
`,
      },
      {
        title: '财务部-费用报销规范',
        deptCode: 'finance',
        content: `第一章 报销范围
第一条 因公出差交通费、住宿费、餐饮费。
第二条 办公费、业务招待费、培训费。
第三条 所有费用需提供正规发票，发票抬头为公司全称。

第二章 报销流程
第四条 费用发生后7天内提交报销申请，附发票和费用明细。
第五条 部门经理审核业务真实性，财务审核票据合规性。
第六条 5000元以下财务经理审批，5000元以上总经理审批。
第七条 报销款在审批通过后5个工作日内支付。
`,
      },
      {
        title: '总经办-公司会议管理制度',
        deptCode: 'management',
        content: `第一章 会议分类
第一条 周例会：每周一上午，各部门负责人参加，汇报上周工作和本周计划。
第二条 月度经营分析会：每月初，管理层参加，分析经营数据。
第三条 临时会议：根据需要随时召开。

第二章 会议要求
第四条 会议需提前1天发出通知，明确议题和参会人员。
第五条 参会人员不得无故缺席，确需请假提前向主持人说明。
第六条 会议记录在会后24小时内整理并发出，明确待办事项和责任人。
`,
      },
      {
        title: '总经办-应急预案',
        deptCode: 'management',
        content: `第一章 火灾应急
第一条 发现火情立即按下手动报警按钮，使用就近灭火器初期扑救。
第二条 火势无法控制时立即拨打119，组织人员从安全通道疏散。
第三条 疏散时弯腰低姿，用湿毛巾捂住口鼻，不得乘坐电梯。

第二章 设备故障应急
第四条 关键设备故障立即停机，通知设备维修组。
第五条 评估对生产计划的影响，必要时调整排产。
第六条 重大设备故障需在2小时内上报总经理。

第三章 客户投诉应急
第七条 收到重大客户投诉后2小时内响应，24小时内给出处理方案。
第八条 由质量部牵头调查原因，销售部对接客户。
`,
      },
    ];
  }
}
