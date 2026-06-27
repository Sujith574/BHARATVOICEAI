/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import type { KnowledgeDocument } from "@prisma/client";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

import { AppError } from "../../shared/errors/app-error";
import type { AuditService } from "../admin/audit/audit.service";
import type { AuthService } from "../auth/auth.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import type { GeminiService } from "../ai/gemini.service";
import type { DocumentParserService } from "./document-parser.service";
import type { CreateDocumentDto, KnowledgeRepository } from "./knowledge.repository";
import { KnowledgeService } from "./knowledge.service";

describe("KnowledgeService", () => {
  // Explicitly type-safe Vitest Mock variables with 1 type argument
  let createDocumentMock: Mock<(dto: CreateDocumentDto) => Promise<KnowledgeDocument>>;
  let updateDocumentMock: Mock<(id: string, data: Partial<KnowledgeDocument>) => Promise<KnowledgeDocument>>;
  let saveChunksAndEmbeddingsMock: Mock<(documentId: string, chunks: { content: string; index: number }[], embeddings: number[][]) => Promise<void>>;
  let deleteDocumentMock: Mock<(id: string) => Promise<KnowledgeDocument>>;
  let findDocumentByIdMock: Mock<(id: string) => Promise<KnowledgeDocument | null>>;
  let searchSimilarChunksMock: Mock<(embedding: number[], limit: number, threshold: number) => Promise<any[]>>;

  let parseDocumentMock: Mock<(buffer: Buffer, mimetype: string) => Promise<string>>;
  let generateEmbeddingMock: Mock<(text: string) => Promise<number[]>>;
  let assertPermissionMock: Mock<(actor: AuthenticatedUser, permission: string) => void>;
  let logMock: Mock<(dto: any) => Promise<void>>;

  let service: KnowledgeService;

  const actorUser: AuthenticatedUser = {
    id: "user-uuid",
    authUserId: "supabase-auth-uuid",
    email: "admin@example.gov.in",
    status: "ACTIVE",
    roles: [{ code: "SUPER_ADMIN", name: "Super Admin", scope: "GLOBAL" }],
    permissions: ["knowledge.create", "knowledge.read", "knowledge.delete"]
  };

  const defaultDoc: KnowledgeDocument = {
    id: "doc-uuid",
    title: "Test Guide",
    sourceType: "OFFICIAL_PDF",
    languageCode: "en-IN",
    approvalStatus: "APPROVED",
    processingStatus: "INACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    departmentId: null,
    serviceId: null,
    schemeId: null,
    uploadedByUserId: null,
    approvedByUserId: null,
    sourceUrl: null,
    sourceReference: null,
    checksum: null,
    versionLabel: null,
    effectiveFrom: null,
    effectiveUntil: null,
    publishedAt: null,
    approvedAt: null
  };

  beforeEach(() => {
    createDocumentMock = vi.fn().mockResolvedValue({
      ...defaultDoc
    });

    updateDocumentMock = vi.fn().mockResolvedValue({
      ...defaultDoc,
      processingStatus: "ACTIVE"
    });

    saveChunksAndEmbeddingsMock = vi.fn().mockResolvedValue(undefined);

    deleteDocumentMock = vi.fn().mockResolvedValue({
      ...defaultDoc
    });

    findDocumentByIdMock = vi.fn().mockResolvedValue({
      ...defaultDoc
    });

    parseDocumentMock = vi.fn().mockResolvedValue(
      "This is some extracted text from a PDF document for testing."
    );

    generateEmbeddingMock = vi.fn().mockResolvedValue(
      new Array(768).fill(0.1)
    );

    assertPermissionMock = vi.fn().mockImplementation(() => undefined);

    logMock = vi.fn().mockResolvedValue(undefined);

    searchSimilarChunksMock = vi.fn().mockResolvedValue([
      { id: "chunk-1", score: 0.9, content: "Test chunk content" }
    ]);

    const mockRepository = {
      createDocument: createDocumentMock,
      updateDocument: updateDocumentMock,
      saveChunksAndEmbeddings: saveChunksAndEmbeddingsMock,
      deleteDocument: deleteDocumentMock,
      findDocumentById: findDocumentByIdMock,
      searchSimilarChunks: searchSimilarChunksMock
    } as unknown as KnowledgeRepository;

    const mockParser = {
      parseDocument: parseDocumentMock
    } as unknown as DocumentParserService;

    const mockGemini = {
      generateEmbedding: generateEmbeddingMock
    } as unknown as GeminiService;

    const mockAuthService = {
      assertPermission: assertPermissionMock
    } as unknown as AuthService;

    const mockAuditService = {
      log: logMock
    } as unknown as AuditService;

    service = new KnowledgeService(
      mockRepository,
      mockParser,
      mockGemini,
      mockAuthService,
      mockAuditService
    );
  });

  describe("ingestDocument", () => {
    it("successfully creates, chunks, embeds, and updates status", async () => {
      const doc = await service.ingestDocument(actorUser, {
        title: "Test Guide",
        sourceType: "OFFICIAL_PDF",
        fileBuffer: Buffer.from("dummy pdf buffer"),
        mimetype: "application/pdf"
      });

      expect(assertPermissionMock).toHaveBeenCalledWith(actorUser, "knowledge.create");
      expect(createDocumentMock).toHaveBeenCalled();
      expect(parseDocumentMock).toHaveBeenCalled();
      expect(generateEmbeddingMock).toHaveBeenCalled();
      expect(saveChunksAndEmbeddingsMock).toHaveBeenCalled();
      expect(updateDocumentMock).toHaveBeenCalledWith("doc-uuid", {
        processingStatus: "ACTIVE",
        publishedAt: expect.any(Date)
      });
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "KNOWLEDGE_INGEST",
          entityType: "KnowledgeDocument",
          entityId: "doc-uuid"
        })
      );
      expect(doc.processingStatus).toBe("ACTIVE");
    });

    it("rolls back document state to INACTIVE if parsing or chunking fails", async () => {
      parseDocumentMock.mockRejectedValue(new Error("PDF corrupted"));

      await expect(
        service.ingestDocument(actorUser, {
          title: "Corrupt Document",
          sourceType: "OFFICIAL_PDF",
          fileBuffer: Buffer.from("broken"),
          mimetype: "application/pdf"
        })
      ).rejects.toThrow(AppError);

      expect(updateDocumentMock).toHaveBeenCalledWith("doc-uuid", {
        processingStatus: "INACTIVE"
      });
    });
  });

  describe("deleteDocument", () => {
    it("successfully deletes the document if permission is checked", async () => {
      const result = await service.deleteDocument(actorUser, "doc-uuid");

      expect(assertPermissionMock).toHaveBeenCalledWith(actorUser, "knowledge.delete");
      expect(findDocumentByIdMock).toHaveBeenCalledWith("doc-uuid");
      expect(deleteDocumentMock).toHaveBeenCalledWith("doc-uuid");
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "KNOWLEDGE_DELETE"
        })
      );
      expect(result.id).toBe("doc-uuid");
    });

    it("throws 404 AppError if document to delete does not exist", async () => {
      findDocumentByIdMock.mockResolvedValue(null);

      await expect(service.deleteDocument(actorUser, "missing-uuid")).rejects.toThrow(
        new AppError(404, "DOCUMENT_NOT_FOUND", "KnowledgeDocument with ID 'missing-uuid' was not found.")
      );
    });
  });

  describe("search cache", () => {
    it("should return cached results on subsequent queries and clear on ingest/delete", async () => {
      const q = "test question";

      // First search: should hit gemini and db
      const res1 = await service.search(actorUser, q);
      expect(res1[0]?.content).toBe("Test chunk content");
      expect(generateEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(searchSimilarChunksMock).toHaveBeenCalledTimes(1);

      // Second search: should return cached data (generateEmbedding not called again)
      const res2 = await service.search(actorUser, q);
      expect(res2).toEqual(res1);
      expect(generateEmbeddingMock).toHaveBeenCalledTimes(1);
      expect(searchSimilarChunksMock).toHaveBeenCalledTimes(1);

      // Clear/Ingest document: should evict cache
      await service.ingestDocument(actorUser, {
        title: "Test Guide",
        sourceType: "OFFICIAL_PDF",
        fileBuffer: Buffer.from("dummy pdf buffer"),
        mimetype: "application/pdf"
      });

      // Third search: should miss cache and call services again
      const res3 = await service.search(actorUser, q);
      expect(res3).toEqual(res1);
      expect(generateEmbeddingMock).toHaveBeenCalledTimes(3); // Ingest calls generateEmbedding (once per chunk) + Search calls generateEmbedding (once)
    });
  });
});
