# Velven image editing replacement

The full audit, configuration, cost estimates, test scope and manual Modal retirement list are in the sibling backend repository: [ImageAi/README.md](../../WebsiteAPI/ImageAi/README.md).

Frontend changes reuse the Watermark Remover and List Your Property form/gallery. Images are processed only by explicit admin action; originals remain available, listing previews require approval, and submission/publication remains separate. `/Hdreal` and `/RemoveWaterMark` describe the preservation/removal intent and are not API flags. No key is sent to Angular.

Changed Angular files:
- `src/app/services/image-ai.service.ts`: reusable multipart editing contract and explicit draft approval.
- `src/app/crm/photo-cleaner/photo-cleaner.ts`, `.html`, `.css`: explicit permission/start, masks, original/result downloads and comparison.
- `src/app/upload-apartment/upload-apartament.ts`, `upload-apartaments.html`, `upload-apartment.css`: remove background detection/automatic replacement; add enhancement/removal previews, approve/discard/restore.
- `src/app/admin-panel/image-ai-card.ts`, `.html`: explicit editing modes, estimated cost and no retry UI.
- `scripts/test-image-editing-ui.mjs`: offline browser checks.

Backend changes: `Program.cs`, `Controllers/PhotoChecksController.cs`, `Controllers/ImageProcessingController.cs`, `Controllers/ApartmentsController.cs`, `Service/ImageAiOptions.cs`, `Service/ImageProcessingQueue.cs`, `Service/ImageProcessingWorker.cs`, new `Service/OpenAIImageEditingService.cs`, new `Service/ImageEditingGuard.cs`, backend/test project files, new mocked integration tests, `.dockerignore`, and `ImageAi/README.md`. The Modal client, deployment/vendor files, old live contract test and obsolete partner OCR assumptions were removed. No database migration is needed. See backend git diff for the complete per-file removal list.

Validation results: Angular production build and local API Release publish succeeded. Browser tests passed with all API requests intercepted. The backend suite passed 175 tests with 11 local-PostgreSQL-dependent tests skipped; the image-editing subset includes 18 passing offline tests and one skipped PostgreSQL advisory-lock test. Existing Angular style-size/CommonJS warnings and the existing transitive `System.Security.Cryptography.Pkcs` NuGet vulnerability warnings remain; they are not introduced by this image integration.
