import { Router } from "express";
import multer from "multer";

import { requireAuth } from "../auth/auth.middleware";
import type { AuthService } from "../auth/auth.service";
import { validateBody, validateQuery } from "../../shared/http/validate-request";
import type { KnowledgeController } from "./knowledge.controller";
import { ingestDocumentBodySchema, listDocumentsQuerySchema, searchQuerySchema } from "./knowledge.schemas";

// In-memory file storage engine configuration for multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // limit files to 15MB
  }
});

export const createKnowledgeRouter = (
  authService: AuthService,
  controller: KnowledgeController
): Router => {
  const router = Router();

  /**
   * POST /admin/knowledge
   * Permission: knowledge.create
   */
  router.post(
    "/",
    requireAuth(authService),
    upload.single("file"),
    validateBody(ingestDocumentBodySchema),
    (req, res, next) => {
      controller.uploadDocument(req, res, next).catch(next);
    }
  );

  /**
   * GET /admin/knowledge
   * Permission: knowledge.read
   */
  router.get(
    "/",
    requireAuth(authService),
    validateQuery(listDocumentsQuerySchema),
    (req, res, next) => {
      controller.listDocuments(req, res, next).catch(next);
    }
  );

  /**
   * GET /admin/knowledge/search
   * Permission: knowledge.read
   */
  router.get(
    "/search",
    requireAuth(authService),
    validateQuery(searchQuerySchema),
    (req, res, next) => {
      controller.querySearch(req, res, next).catch(next);
    }
  );

  /**
   * GET /admin/knowledge/:id
   * Permission: knowledge.read
   */
  router.get(
    "/:id",
    requireAuth(authService),
    (req, res, next) => {
      controller.getDocumentDetails(req, res, next).catch(next);
    }
  );

  /**
   * DELETE /admin/knowledge/:id
   * Permission: knowledge.delete
   */
  router.delete(
    "/:id",
    requireAuth(authService),
    (req, res, next) => {
      controller.deleteDocument(req, res, next).catch(next);
    }
  );

  return router;
};
