# Context — Phase 03: Upload e Processamento de Vídeos

## Objective

Implement the complete video management foundation: high-capacity video upload support (up to 10GB using direct-to-storage presigned S3 URLs), background processing queue using BullMQ + Redis, a dedicated video processing worker container using FFmpeg for metadata extraction and thumbnail generation, unique video URLs (12-char `node:crypto` generated slugs), HTTP 206 Byte-Range video streaming, direct video downloading, and explicit video status state management.

---

## Technical Context & Decisions

This phase builds directly upon the architecture established in Phase 01 (Base Configuration & NestJS Foundation) and Phase 02 (Authentication, Users, & Channels). All architectural decisions for Phase 03 have been analyzed, finalized, and marked as `Decided` in [`docs/decisions/technical-decisions-phase-03-videos.md`](../../decisions/technical-decisions-phase-03-videos.md):

1. **TD-01: Message Queue Stack** — **BullMQ + Redis (`@nestjs/bullmq` + `ioredis`)**. Native NestJS module integration for background job dispatching, automatic retries with exponential backoff, concurrency tuning, and worker process isolation.
2. **TD-02: 10GB Upload Strategy** — **Direct-to-Storage via S3 Presigned URLs / Multipart Upload**. Bypasses NestJS API memory and CPU limits entirely during 10GB file transfers.
3. **TD-03: Object Storage Setup** — **MinIO Container (`compose.yaml`) + `@aws-sdk/client-s3` & `@aws-sdk/s3-request-presigner`**. 100% S3-compatible local development environment.
4. **TD-04: Video Worker & Processing** — **Dedicated Worker Container (`video-worker`) running FFmpeg**. Isolated from NestJS HTTP API to extract duration, resolution, codec, and thumbnail without degrading API performance.
5. **TD-05: Unique Video Identifier** — **Native `node:crypto` Helper (12-char URL-safe slug)** for public watch slugs (`slug`), avoiding external npm package overhead, combined with UUIDv4 primary keys (`id`) for internal DB relations.
6. **TD-06: Video Streaming & Download** — **HTTP 206 Partial Content (Byte-Range requests)** streaming directly via NestJS streaming controller / presigned GET URLs, with direct download endpoints.
7. **TD-07: Video Status Lifecycle** — State machine: `DRAFT` (upload initiated) → `PROCESSING` (upload complete, in queue) → `READY` (processed, streaming ready) / `FAILED` (processing error recorded).

---

## Domain Boundaries & Entity Relationships

- **Channel 1:N Video**: Videos belong to a `Channel` (which is linked 1:1 to a `User`). Only the channel owner can upload, edit, or delete their videos.
- **Video Entity Attributes**:
  - `id` (UUID, PK)
  - `title` (string, default from filename or title prompt)
  - `description` (text, optional)
  - `slug` (string, unique indexed, 12-char native crypto slug)
  - `status` (enum: `DRAFT`, `PROCESSING`, `READY`, `FAILED`)
  - `original_filename` (string)
  - `file_key` (string, S3 object key for video)
  - `thumbnail_key` (string, optional S3 object key for thumbnail)
  - `mime_type` (string, e.g. `video/mp4`)
  - `size_bytes` (bigint/number)
  - `duration_seconds` (number, float, optional — extracted by worker)
  - `width` (integer, optional — extracted by worker)
  - `height` (integer, optional — extracted by worker)
  - `processing_error` (text, optional)
  - `channel_id` (UUID, FK → channels)
  - `created_at`, `updated_at` (timestamps)

---

## Infrastructure Requirements (Docker Compose)

The backend `compose.yaml` must be expanded to include:
- `redis`: Redis 7 alpine container on port `6379` (BullMQ broker).
- `minio`: MinIO container on ports `9000` (S3 API) and `9001` (Web Console), creating default buckets `streamtube-videos` and `streamtube-thumbnails`.
- `video-worker`: Dedicated Node.js worker service building from Dockerfile with FFmpeg installed, sharing the codebase and consuming `video-processing` queue jobs from Redis.

---

## Deliverables Checklist

- [x] Technical Decisions Document ([docs/decisions/technical-decisions-phase-03-videos.md](../../decisions/technical-decisions-phase-03-videos.md))
- [ ] Phase Planning Docs (`context.md`, `validation.md` clean, `library-refs.md`, `phase-03-videos.md`, `progress.md`)
- [ ] MinIO + Redis + Video Worker services added to `compose.yaml`
- [ ] `Video` entity and TypeORM migration (`CreateVideosTable`)
- [ ] Presigned upload URL generation service and endpoints (`POST /videos/upload-url`, `POST /videos/:id/complete-upload`)
- [ ] BullMQ queue module and worker processor consuming video job events
- [ ] FFmpeg metadata extraction and thumbnail generation logic in worker
- [ ] Video streaming endpoint (`GET /videos/:slug/stream`) with HTTP 206 Partial Content support
- [ ] Direct download endpoint (`GET /videos/:slug/download`)
- [ ] Full unit, integration, and E2E test suite passing
- [ ] `CLAUDE.md` / `AGENTS.md` updated with video module architecture and endpoints
