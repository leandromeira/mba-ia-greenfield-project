# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

> **Phase:** 03 — Upload e Processamento de Vídeos  
> **Status:** Decided  
> **Date:** 2026-07-23  

---

## TD-01: Message Queue & Job Processing Stack

**Context:** Video processing tasks (metadata extraction, thumbnail generation, media format validation) are CPU-intensive and time-consuming operations. Executing them synchronously inside NestJS HTTP request cycles would block the Node.js event loop and cause API timeouts. A background message queue is required to decouple video upload completion from asynchronous video processing.

**Options:**

### Option A: BullMQ + Redis (`@nestjs/bullmq` + `ioredis`)
- BullMQ is a modern, TypeScript-native queue library built on top of Redis. It integrates directly into NestJS via the official `@nestjs/bullmq` package.
- **Pros:** Native NestJS module (`@nestjs/bullmq`) supported by core ecosystem. Exceptional performance, lightweight Docker footprint (Redis 7 container), native support for automatic retries with backoff, concurrency tuning, job progress tracking, and dead-letter queues. Monitoring available via Bull-Board.
- **Cons:** Requires adding a Redis service to `compose.yaml` (though Redis container footprint is minimal ~30MB RAM).

### Option B: RabbitMQ (`@nestjs/microservices` + `amqplib`)
- RabbitMQ is an enterprise-grade AMQP message broker supporting complex exchanges and routing topologies.
- **Pros:** Robust message routing (direct, topic, fanout exchanges), strong delivery guarantees, widely used in large-scale multi-service architectures.
- **Cons:** Heavier Docker container setup (~150MB+ RAM), higher configuration complexity for simple delayed job processing, less intuitive job progress reporting compared to BullMQ.

### Option C: PostgreSQL-based Queue (`pg-boss`)
- `pg-boss` implements a background job queue using PostgreSQL table structures and LISTEN/NOTIFY or polling mechanisms.
- **Pros:** No additional Docker service required (leverages existing PostgreSQL database).
- **Cons:** Increases IOPS and database lock contention on the primary relational database; not optimized for high-frequency status polling or intensive worker concurrency; lacks official NestJS module integrations.

**Recommendation:** **Option A (BullMQ + Redis)** — BullMQ is the standard job queue solution for Node.js/NestJS. It provides official NestJS DI integration (`@nestjs/bullmq`), native job progress tracking, automatic retries with exponential backoff, and trivial Docker integration via a lightweight Redis container.

**Decision:** A (BullMQ + Redis)

---

## TD-02: 10GB Large Video Upload Strategy

**Context:** The platform must support video uploads up to 10GB without blocking or degrading NestJS API performance. Receiving 10GB files directly through NestJS HTTP endpoints would exhaust container memory (OOM crashes), saturate node network interfaces, and fail on slow client connections.

**Options:**

### Option A: Direct-to-Storage via S3 Presigned URLs & Multipart Upload
- The client requests upload authorization from NestJS (`POST /videos/upload-url`). The API creates a `DRAFT` video record and returns S3 Presigned Upload URLs (using `@aws-sdk/s3-request-presigner`). The client uploads the binary directly to MinIO/S3 object storage, bypassing the API. Upon completion, the client notifies the API (`POST /videos/:id/complete-upload`), triggering background queue processing.
- **Pros:** Zero CPU, RAM, or bandwidth overhead on the NestJS API container during 10GB file transfers. Supports client-side pause/resume using S3 Multipart Upload. Highly scalable cloud-native pattern.
- **Cons:** Requires client orchestration across 2-3 API steps (request URL -> upload binary to storage -> notify completion).

### Option B: Streamed Multipart Form Upload via NestJS API Gateway
- The client POSTs the 10GB video file directly to a NestJS endpoint (`POST /videos/upload`), which uses `busboy` or `multer` to stream chunks directly from the HTTP request stream into S3.
- **Pros:** Simple single-endpoint API contract for the client.
- **Cons:** Keeps HTTP connection open for the full duration of a 10GB upload. High risk of HTTP connection timeouts on slow networks. If the API container restarts, active uploads fail immediately.

### Option C: Chunked File Upload to Local Disk on API Container
- The client splits the 10GB file into 5MB chunks and uploads them sequentially to local disk storage on the API container, which reassembles the file before uploading it to S3.
- **Pros:** Custom client pause/resume control.
- **Cons:** Heavy local disk IO on API container, risk of disk space exhaustion, complex file chunk reassembly logic.

**Recommendation:** **Option A (Direct-to-Storage via S3 Presigned URLs & Multipart Upload)** — Eliminates API resource saturation entirely, allows 10GB uploads to bypass Node.js process memory limits, and leverages S3/MinIO native capabilities for chunked multipart uploads and resumability.

**Decision:** A (Direct-to-Storage via S3 Presigned URLs & Multipart Upload)

---

## TD-03: Object Storage Provider & Local Docker Environment

**Context:** Videos and generated thumbnails must be stored in an object storage solution. The setup must run locally in Docker Compose while maintaining 100% API parity with cloud production storage (AWS S3).

**Options:**

### Option A: MinIO Container with `@aws-sdk/client-s3`
- Run a MinIO container in `compose.yaml` configured with S3-compatible API endpoints and credentials. The NestJS API and Video Worker use official AWS SDK v3 packages (`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`).
- **Pros:** 100% S3 API compatibility. Zero code changes required when switching from local MinIO to AWS S3, Cloudflare R2, or DigitalOcean Spaces in production. Includes a web admin console for inspecting buckets and files.
- **Cons:** Requires a `minio` container service in `compose.yaml` (~100MB RAM).

### Option B: Local Filesystem Storage (`public/uploads`)
- Store uploaded files directly on local disk folders mounted in Docker volumes.
- **Pros:** No extra container needed.
- **Cons:** Not production-ready, lacks S3 Presigned URL support for direct client uploads, incompatible with distributed worker containers or cloud storage paradigms.

**Recommendation:** **Option A (MinIO Container with `@aws-sdk/client-s3`)** — Matches the architectural plan in `docs/project-plan.md`. Provides true S3 API parity in local Docker, allowing `@aws-sdk/client-s3` to be used across all environments without branching codebase logic.

**Decision:** A (MinIO Container with `@aws-sdk/client-s3`)

---

## TD-04: Video Processing Worker & FFmpeg Strategy

**Context:** After a video is uploaded, the system must extract metadata (duration, width, height, codec) and generate a representative thumbnail image (JPEG). FFmpeg processing is CPU and memory intensive.

**Options:**

### Option A: Dedicated Worker Container (`video-worker`) running FFmpeg
- A dedicated Node.js worker service (`video-worker`) running in a separate Docker container with FFmpeg installed. It listens to the `video-processing` BullMQ queue, streams raw video from MinIO, executes `ffprobe` and `ffmpeg` commands, uploads the generated thumbnail to MinIO, and updates PostgreSQL.
- **Pros:** Complete isolation: heavy FFmpeg CPU/RAM spikes do not impact NestJS HTTP API responsiveness. The worker container can be scaled independently of the API.
- **Cons:** Requires a dedicated service definition in `compose.yaml` and a custom Dockerfile with FFmpeg binaries installed.

### Option B: Inline FFmpeg Execution inside Main NestJS API Process
- Execute `child_process.exec('ffmpeg ...')` directly inside the NestJS API process when a job is processed.
- **Pros:** Single codebase and single container service.
- **Cons:** Risks freezing or crashing the HTTP API server during heavy CPU video encoding. Violates single responsibility principle.

**Recommendation:** **Option A (Dedicated Worker Container running FFmpeg)** — Ensures resource isolation between HTTP request handling and heavy video media processing, keeping API response times fast and consistent even under heavy upload load.

**Decision:** A (Dedicated Worker Container running FFmpeg)

---

## TD-05: Unique Video Identifier (Slug & Public URL Strategy)

**Context:** Public watch URLs (e.g., `/watch?v=k9Xm2P8zL1q`) require a unique, short, URL-safe identifier (`slug`). Sequential numeric IDs (1, 2, 3) expose total video counts and enable enumeration scraping attacks.

**Options:**

### Option A: Native `node:crypto` Helper (12-char URL-safe Slug)
- Generate a 12-character URL-safe random string using Node.js native `crypto.randomBytes()` (e.g., `crypto.randomBytes(9).toString('base64url')` or custom alphabet mapping).
- **Pros:** Zero external dependencies (uses Node.js standard library built-in `node:crypto`). Cryptographically secure, compact, unguessable, collision-resistant, 100% URL-safe. Similar to YouTube's 11-character video IDs.
- **Cons:** Requires a short helper function (3 lines of code) and indexed database lookup (`slug` column).

### Option B: Third-Party `nanoid` Package
- Generate a 12-character URL-safe random string using the `nanoid` npm package.
- **Pros:** Popular utility library (~30M weekly downloads).
- **Cons:** Adds an external npm package dependency. ESM/CommonJS versioning incompatibilities across Node/NestJS tooling.

### Option C: UUIDv4 (36 characters)
- Use standard 128-bit UUID (e.g., `123e4567-e89b-12d3-a456-426614174000`).
- **Pros:** Standard database primary key type in PostgreSQL. Guaranteed uniqueness.
- **Cons:** Extremely long and cluttered in public watch URLs (`/watch?v=123e4567-e89b-12d3-a456-426614174000`).

### Option D: Auto-Increment ID + Hashids
- Use auto-incrementing integer IDs internally and encode/decode them to Hashids for public URLs.
- **Pros:** Short URLs, deterministic reversible mapping.
- **Cons:** Obfuscation rather than true randomness; if the salt is compromised, internal database IDs can be decoded.

**Recommendation:** **Option A (Native `node:crypto` for public slug + UUIDv4 for internal PK)** — Using `node:crypto` provides cryptographically secure 12-char URL-safe slugs with zero extra npm dependencies, avoiding ESM/CJS compatibility issues while keeping URLs clean like YouTube. Use UUIDv4 for internal database primary keys (`id`).

**Decision:** A (Native node:crypto for public slug + UUIDv4 for internal PK)

---

## TD-06: Video Streaming & Download Strategy

**Context:** Users need to play videos immediately in the browser without downloading the full 10GB file first, and direct file downloading must also be supported.

**Options:**

### Option A: HTTP 206 Partial Content (Byte-Range Requests) & Presigned GET Downloads
- Support HTTP Range requests (`Range: bytes=0-1048575`). For streaming, NestJS streams byte ranges directly from MinIO using S3 `GetObject` with the requested Range header (returning status `206 Partial Content`). For downloads (`GET /videos/:slug/download`), generate an S3 Presigned GET URL with `Content-Disposition: attachment`.
- **Pros:** Native HTML5 `<video>` player support in all modern browsers without complex video transcoding pipelines. Low overhead, fast time-to-first-frame.
- **Cons:** Does not support adaptive bitrate switching (ABR) out of the box (unlike HLS/DASH), but fully satisfies Phase 03 requirements.

### Option B: HLS (HTTP Live Streaming) Transcoding (.m3u8 playlist + .ts segments)
- Transcode video into HLS multi-bitrate chunks (1080p, 720p, 480p) and `.m3u8` playlists in the worker.
- **Pros:** Adaptive bitrate streaming according to client bandwidth.
- **Cons:** Significantly higher CPU/disk overhead during worker processing for 10GB files; requires complex multi-pass FFmpeg HLS segmentation out of scope for initial Phase 03 delivery.

**Recommendation:** **Option A (HTTP 206 Byte-Range Streaming + Presigned GET Downloads)** — Fulfills all Phase 03 requirements (immediate playback without full download + direct file download) using standard HTTP Byte-Ranges and HTML5 video player compatibility.

**Decision:** A (HTTP 206 Byte-Range Streaming + Presigned GET Downloads)

---

## TD-07: Video Status Lifecycle & Error State Machine

**Context:** Video creation involves asynchronous multi-step operations (creation -> upload -> queue -> processing -> ready/error). A strict status state machine is needed to handle processing failures and maintain data consistency.

**Options:**

### Option A: Explicit Video Status Enum (`DRAFT` -> `PROCESSING` -> `READY` / `FAILED`)
- States:
  - `DRAFT`: Video record created, awaiting direct upload to MinIO.
  - `PROCESSING`: Binary upload complete, job dispatched to BullMQ queue, FFmpeg worker active.
  - `READY`: Processing complete, thumbnail generated, video ready for public streaming.
  - `FAILED`: Processing failed (corrupt file, invalid codec, worker timeout). Error reason stored in `processing_error` column.
- **Pros:** Clear operational state visibility, enables public feed filtering (only show `READY` videos), allows error reporting, prevents streaming incomplete or corrupt uploads.
- **Cons:** Requires state transition checks in the service layer.

### Option B: Simple Boolean Flag (`is_processed: boolean`)
- **Pros:** Minimal database schema.
- **Cons:** Cannot distinguish between uploading, processing, or failed states.

**Recommendation:** **Option A (Explicit Video Status Enum)** — Provides robust state management, clear user feedback on processing status, and safe streaming validation.

**Decision:** A (Explicit Video Status Enum)

---

## Decisions Summary

| ID | Decision | Recommendation | Choice |
| :--- | :--- | :--- | :---: |
| **TD-01** | Message Queue & Job Processing Stack | **Option A (BullMQ + Redis)** | **Option A** |
| **TD-02** | 10GB Large Video Upload Strategy | **Option A (Direct-to-Storage via S3 Presigned URLs)** | **Option A** |
| **TD-03** | Object Storage Setup & Docker Env | **Option A (MinIO Container with `@aws-sdk/client-s3`)** | **Option A** |
| **TD-04** | Video Worker & FFmpeg Strategy | **Option A (Dedicated Worker Container running FFmpeg)** | **Option A** |
| **TD-05** | Unique Video Identifier (Slug Strategy) | **Option A (Native `node:crypto` 12-char slug + UUID PK)** | **Option A** |
| **TD-06** | Video Streaming & Download Strategy | **Option A (HTTP 206 Byte-Range Streaming + Presigned GET)** | **Option A** |
| **TD-07** | Video Status Lifecycle State Machine | **Option A (Explicit Enum: DRAFT/PROCESSING/READY/FAILED)** | **Option A** |
