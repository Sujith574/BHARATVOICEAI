import { randomUUID } from "node:crypto";

import type { DocumentSourceType, KnowledgeDocument, ApprovalStatus, RecordStatus } from "@prisma/client";

import type { PrismaService } from "../../shared/prisma/prisma.service";

export interface CreateDocumentDto {
  title: string;
  sourceType: DocumentSourceType;
  sourceUrl?: string;
  sourceReference?: string;
  languageCode: string;
  checksum?: string;
  versionLabel?: string;
  departmentId?: string;
  serviceId?: string;
  schemeId?: string;
  uploadedByUserId?: string;
  approvedByUserId?: string;
  approvalStatus?: ApprovalStatus;
  processingStatus?: RecordStatus;
}

export interface SearchResult {
  chunkId: string;
  content: string;
  documentId: string;
  documentTitle: string;
  similarity: number;
}

export class KnowledgeRepository {
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new KnowledgeDocument in the database.
   */
  public async createDocument(dto: CreateDocumentDto): Promise<KnowledgeDocument> {
    return this.prisma.knowledgeDocument.create({
      data: {
        title: dto.title,
        sourceType: dto.sourceType,
        languageCode: dto.languageCode,
        ...(dto.sourceUrl !== undefined && { sourceUrl: dto.sourceUrl }),
        ...(dto.sourceReference !== undefined && { sourceReference: dto.sourceReference }),
        ...(dto.checksum !== undefined && { checksum: dto.checksum }),
        ...(dto.versionLabel !== undefined && { versionLabel: dto.versionLabel }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.serviceId !== undefined && { serviceId: dto.serviceId }),
        ...(dto.schemeId !== undefined && { schemeId: dto.schemeId }),
        ...(dto.uploadedByUserId !== undefined && { uploadedByUserId: dto.uploadedByUserId }),
        ...(dto.approvedByUserId !== undefined && { approvedByUserId: dto.approvedByUserId }),
        approvalStatus: dto.approvalStatus ?? "APPROVED",
        processingStatus: dto.processingStatus ?? "INACTIVE"
      }
    });
  }

  /**
   * Updates document processing status and other fields.
   */
  public async updateDocument(id: string, data: Partial<KnowledgeDocument>): Promise<KnowledgeDocument> {
    return this.prisma.knowledgeDocument.update({
      where: { id },
      data
    });
  }

  /**
   * Saves chunks and their vector embeddings in a transaction.
   */
  public async saveChunksAndEmbeddings(
    documentId: string,
    chunks: { content: string; index: number }[],
    embeddings: number[][]
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        if (!chunk || !embedding) {
          throw new Error("Missing chunk or embedding at index during transactional save.");
        }

        // Create the document chunk first
        const createdChunk = await tx.documentChunk.create({
          data: {
            documentId,
            chunkIndex: chunk.index,
            content: chunk.content,
            languageCode: "en-IN" // default
          }
        });

        // Insert the embedding with the pgvector Cast via raw SQL execution
        const embeddingId = randomUUID();
        const vectorString = `[${embedding.join(",")}]`;

        await tx.$executeRaw`
          INSERT INTO embeddings (id, document_chunk_id, provider, model, dimensions, vector, created_at, updated_at)
          VALUES (
            ${embeddingId}::uuid,
            ${createdChunk.id}::uuid,
            'gemini',
            'text-embedding-004',
            768,
            cast(${vectorString} as vector),
            NOW(),
            NOW()
          )
        `;
      }
    });
  }

  /**
   * Transactionally deletes a document along with chunks and cascade-deleted embeddings.
   */
  public async deleteDocument(id: string): Promise<KnowledgeDocument> {
    return this.prisma.knowledgeDocument.delete({
      where: { id }
    });
  }

  /**
   * Finds documents using filters and paginated limits.
   */
  public async findManyDocuments(
    filters: { departmentId?: string; serviceId?: string; schemeId?: string },
    skip: number,
    take: number
  ): Promise<{ items: KnowledgeDocument[]; total: number }> {
    const where = {
      ...(filters.departmentId && { departmentId: filters.departmentId }),
      ...(filters.serviceId && { serviceId: filters.serviceId }),
      ...(filters.schemeId && { schemeId: filters.schemeId })
    };

    const [items, total] = await Promise.all([
      this.prisma.knowledgeDocument.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.knowledgeDocument.count({ where })
    ]);

    return { items, total };
  }

  /**
   * Retrieves detail about a specific KnowledgeDocument.
   */
  public async findDocumentById(id: string): Promise<KnowledgeDocument | null> {
    return this.prisma.knowledgeDocument.findUnique({
      where: { id },
      include: {
        documentChunks: {
          orderBy: { chunkIndex: "asc" }
        }
      }
    });
  }

  /**
   * Performs semantic search using cosine similarity via pgvector.
   */
  public async searchSimilarChunks(
    queryEmbedding: number[],
    limit: number,
    threshold: number
  ): Promise<SearchResult[]> {
    const vectorString = `[${queryEmbedding.join(",")}]`;

    // raw query mapping
    const rawResults = await this.prisma.$queryRaw<
      {
        chunkId: string;
        content: string;
        documentId: string;
        documentTitle: string;
        similarity: number;
      }[]
    >`
      SELECT 
        dc.id AS "chunkId",
        dc.content AS "content",
        dc.document_id AS "documentId",
        kd.title AS "documentTitle",
        (1 - (e.vector <=> cast(${vectorString} as vector))) AS "similarity"
      FROM document_chunks dc
      JOIN embeddings e ON e.document_chunk_id = dc.id
      JOIN knowledge_documents kd ON dc.document_id = kd.id
      WHERE (1 - (e.vector <=> cast(${vectorString} as vector))) >= ${threshold}
      ORDER BY "similarity" DESC
      LIMIT ${limit}
    `;

    return rawResults.map((r) => ({
      chunkId: r.chunkId,
      content: r.content,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      similarity: Number(r.similarity)
    }));
  }
}
