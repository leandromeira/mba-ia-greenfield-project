---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-07-23T09:54:25-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-07-23T10:28:40-03:00"
  docs/phases/phase-03-videos/library-refs.md: "2026-07-23T11:00:52-03:00"
---

# phase-03-videos — Context

## Scope

**Phase name:** Fase 03 — Upload e Processamento de Vídeos

**Capabilities**

- Serviço de armazenamento de arquivos (vídeos e thumbnails)
- Serviço de processamento em segundo plano (filas)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos
- Reprodução via streaming (sem necessidade de download completo)
- Download do vídeo pelo usuário

**Out of scope:** Edição de informações do vídeo, painel de administração do canal, comentários, likes/dislikes.

**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas.

**Affected subprojects:** `nestjs-project/`

**Deferred subprojects:** `next-frontend/`

**Sequencing notes:** Depends on Fase 01 — Configuração Base do Projeto, Fase 02 — Cadastro, Login e Gerenciamento de Conta.

**Neighbors (for boundary detection only):**
- **Phase 02 (prior):** Cadastro, Login e Gerenciamento de Conta
- **Phase 04 (next):** Gerenciamento de Vídeos e Canal

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-videos/TD-01 | technical-decisions-phase-03-videos.md | Backend | Message Queue & Job Processing Stack | decided | A (BullMQ + Redis) | `@nestjs/bullmq`^11.x, `bullmq`^5.x, `ioredis`^5.x |
| phase-03-videos/TD-02 | technical-decisions-phase-03-videos.md | Backend | 10GB Large Video Upload Strategy | decided | A (Direct-to-Storage via S3 Presigned URLs & Multipart Upload) | `@aws-sdk/s3-request-presigner`^3.x |
| phase-03-videos/TD-03 | technical-decisions-phase-03-videos.md | Backend | Object Storage Setup & Docker Env | decided | A (MinIO Container with `@aws-sdk/client-s3`) | `@aws-sdk/client-s3`^3.x |
| phase-03-videos/TD-04 | technical-decisions-phase-03-videos.md | Backend | Video Worker & FFmpeg Strategy | decided | A (Dedicated Worker Container running FFmpeg) | `fluent-ffmpeg`^2.1.3 |
| phase-03-videos/TD-05 | technical-decisions-phase-03-videos.md | Backend | Unique Video Identifier (Slug Strategy) | decided | A (Native `node:crypto` 12-char slug + UUID PK) | — |
| phase-03-videos/TD-06 | technical-decisions-phase-03-videos.md | Backend | Video Streaming & Download Strategy | decided | A (HTTP 206 Byte-Range Streaming + Presigned GET Downloads) | — |
| phase-03-videos/TD-07 | technical-decisions-phase-03-videos.md | Backend | Video Status Lifecycle State Machine | decided | A (Explicit Video Status Enum: DRAFT/PROCESSING/READY/FAILED) | — |

_Source files:_

- `docs/decisions/technical-decisions-phase-03-videos.md`

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-videos/TD-03 |
| Serviço de processamento em segundo plano (filas) | phase-03-videos/TD-01 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-videos/TD-02 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | phase-03-videos/TD-07 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-videos/TD-04 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-videos/TD-04 |
| URL única por vídeo, sem conflito com outros vídeos | phase-03-videos/TD-05 |
| Reprodução via streaming (sem necessidade de download completo) | phase-03-videos/TD-06 |
| Download do vídeo pelo usuário | phase-03-videos/TD-06 |

## Decisions Detail

### phase-03-videos/TD-01

**Recommendation:** BullMQ is the standard job queue solution for Node.js/NestJS. It provides official NestJS DI integration (`@nestjs/bullmq`), native job progress tracking, automatic retries with exponential backoff, and trivial Docker integration via a lightweight Redis container.
**Libraries:** `@nestjs/bullmq`^11.x, `bullmq`^5.x, `ioredis`^5.x

### phase-03-videos/TD-02

**Recommendation:** Direct-to-Storage via S3 Presigned URLs & Multipart Upload eliminates API resource saturation entirely, allows 10GB uploads to bypass Node.js process memory limits, and leverages S3/MinIO native capabilities for chunked multipart uploads and resumability.
**Libraries:** `@aws-sdk/s3-request-presigner`^3.x

### phase-03-videos/TD-03

**Recommendation:** MinIO Container with `@aws-sdk/client-s3` matches the architectural plan in `docs/project-plan.md`. Provides true S3 API parity in local Docker, allowing `@aws-sdk/client-s3` to be used across all environments without branching codebase logic.
**Libraries:** `@aws-sdk/client-s3`^3.x

### phase-03-videos/TD-04

**Recommendation:** Dedicated Worker Container running FFmpeg ensures resource isolation between HTTP request handling and heavy video media processing, keeping API response times fast and consistent even under heavy upload load.
**Libraries:** `fluent-ffmpeg`^2.1.3

### phase-03-videos/TD-05

**Recommendation:** Native `node:crypto` for public slug + UUIDv4 for internal PK provides cryptographically secure 12-char URL-safe slugs with zero extra npm dependencies, avoiding ESM/CJS compatibility issues while keeping URLs clean like YouTube. Use UUIDv4 for internal database primary keys (`id`).
**Libraries:** —

### phase-03-videos/TD-06

**Recommendation:** HTTP 206 Byte-Range Streaming + Presigned GET Downloads fulfills all Phase 03 requirements (immediate playback without full download + direct file download) using standard HTTP Byte-Ranges and HTML5 video player compatibility.
**Libraries:** —

### phase-03-videos/TD-07

**Recommendation:** Explicit Video Status Enum provides robust state management, clear user feedback on processing status, and safe streaming validation.
**Libraries:** —

## Inherited Decisions Detail

_No inherited TD details._

## Inherited Conventions

- Follow NestJS common conventions and module layer separation _(from phase 01)_
- All HTTP domain errors return standard `{ statusCode, error, message }` shape _(from phase 02)_
- Database tables use lower_snake_case with singular entity names _(from phase 02)_

## Inherited Deferred Capabilities

_No inherited deferred capabilities._

## Non-UI / Deferred Capabilities

_None._

## Testing Requirements

### nestjs-project

| Artifact type | Required layers |
|---------------|-----------------|
| Config Namespace | Unit |
| Storage Service | Unit + Integration |
| Video Entity | Integration |
| Video Controller | Unit + E2E |
| Video Processor Worker | Unit + Integration |
| Streaming Controller | Unit + E2E |
