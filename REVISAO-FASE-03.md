# Revisão Completa — Fase 03: Upload e Processamento de Vídeos

> **Data da revisão:** 2026-07-23  
> **Revisor:** Antigravity (Claude Opus 4.6)  
> **Escopo:** Verificação minuciosa de todos os Critérios de Aceite do [ENUNCIADO.md](ENUNCIADO.md) contra a implementação real

---

## Sumário Executivo

A Fase 03 foi implementada de forma **substancialmente completa**, cobrindo os pilares principais: documentação de decisões, planejamento com artefatos, módulo de vídeos, storage S3/MinIO, fila BullMQ, worker FFmpeg, streaming e download. Porém, foram identificados **problemas pontuais** que necessitam atenção, incluindo itens que podem levar à **reprova** se não corrigidos.

### Veredicto por Área

| Área | Status | Observação |
|:-----|:------:|:-----------|
| Decisões técnicas | ✅ OK | 7 decisões documentadas e justificadas |
| Artefatos de planejamento | ✅ OK | Todos os 5 arquivos presentes com formato correto |
| Upload 10GB sem travar | ✅ OK | Presigned URLs direto ao MinIO |
| Processamento automático | ⚠️ Parcial | Worker tem lógica correta mas **o container não inicia o processo automaticamente** |
| URL única / slug | ✅ OK | Slug 12 chars via `node:crypto` |
| Streaming (206) | ✅ OK | Range requests implementados |
| Download | ✅ OK | Redirect para presigned GET URL |
| Ciclo de status | ✅ OK | DRAFT → PROCESSING → READY / FAILED |
| Docker Compose | ⚠️ Parcial | Serviços presentes mas worker CMD é `tail -f /dev/null` |
| Migration | ✅ OK | Tabela `videos` criada corretamente |
| Testes | ⚠️ Parcial | Existem em 3 níveis, mas E2E são superficiais |
| Definition of Done | ❓ Não verificado | Precisaria rodar `tsc`, `lint` e testes no container |
| Git Flow | ✅ OK | Branch `feature/phase-03-upload-processamento-video` |
| CLAUDE.md atualizado | ✅ OK | Consistente com o código |
| `.env` | ⚠️ Incompleto | Faltam variáveis de S3/Redis no `.env` |

---

## 1. Decisões Técnicas e Planejamento

### 1.1 `technical-decisions-phase-03-videos.md` ✅

**Arquivo:** `docs/decisions/technical-decisions-phase-03-videos.md`

O documento cobre **7 decisões técnicas** com opções, trade-offs e justificativas:

| # | Decisão | Escolha | Coberta? |
|:-:|:--------|:--------|:--------:|
| TD-01 | Tecnologia de fila | BullMQ + Redis | ✅ |
| TD-02 | Estratégia de upload (10GB) | Presigned URLs direto ao S3/MinIO | ✅ |
| TD-03 | Object storage + Docker | MinIO + `@aws-sdk/client-s3` | ✅ |
| TD-04 | Processamento / thumbnail | Worker container + FFmpeg | ✅ |
| TD-05 | URL única / slug | `node:crypto` 12-char base64url | ✅ |
| TD-06 | Streaming / download | HTTP 206 + Presigned GET | ✅ |
| TD-07 | Ciclo de status | DRAFT → PROCESSING → READY / FAILED | ✅ |

> O enunciado pede especificamente 5 decisões (fila, upload, streaming, processamento/thumbnail, ciclo de status). Foram entregues 7 — incluindo storage e slug — o que excede o requisito.

### 1.2 Pasta `docs/phases/phase-03-videos/` ✅

| Artefato | Existe? | Formato OK? | Observação |
|:---------|:-------:|:-----------:|:-----------|
| `context.md` | ✅ | ✅ | Frontmatter, scope, decisions index, testing requirements |
| `validation.md` | ✅ | ✅ | **Status: `clean`**, `issue_count: 0` |
| `library-refs.md` | ✅ | ✅ | AWS SDK, BullMQ, fluent-ffmpeg documentados |
| `phase-03-videos.md` | ✅ | ✅ | SIs, Tech Specs, Dep Map, Deliverables |
| `progress.md` | ✅ | ✅ | Todos SIs marcados como ✅ Completed |

### 1.3 Formato do Plano ✅

O plano `phase-03-videos.md` contém:

- **Step Implementations:** SI-03.1 a SI-03.7 ✅
- **Technical Specifications:**
  - Data Model ✅
  - API Contracts (especificados dentro dos SIs, não como seção separada — funcional mas difere levemente do format da Phase 02) ⚠️
  - Authorization Matrix ✅
  - Error Catalog ✅
  - Events/Messages (fila) ✅
- **Dependency Map** ✅
- **Deliverables** ✅

> **Observação menor:** Na Phase 02, os API Contracts estão em uma seção `### API Contracts` separada sob Technical Specifications. Na Phase 03, os contratos estão distribuídos dentro de cada SI. A informação está completa, mas não há paridade 1:1 de headers com a Phase 02.

---

## 2. Implementação — Feature

### 2.1 Upload de vídeo de até 10GB sem travar a API ✅

**Como funciona:**
1. O cliente chama `POST /videos/upload-url` enviando metadados (título, filename, mime_type, size_bytes)
2. A API cria um registro em status `DRAFT`, gera o slug, e retorna uma **presigned S3 PUT URL**
3. O cliente faz upload **direto ao MinIO** via a URL presigned — **zero bytes passam pela API**

**Arquivos relevantes:**
- `nestjs-project/src/videos/videos.controller.ts` — `createUploadUrl` (L33-66)
- `nestjs-project/src/videos/videos.service.ts` — `createUploadUrl` (L31-70)
- `nestjs-project/src/storage/storage.service.ts` — `getPresignedUploadUrl` (L75-86)

> O DTO `CreateVideoUploadDto` valida `size_bytes` como `@IsPositive()` mas **não valida o limite máximo de 10GB** (`@Max(10737418240)`). O upload direto ao S3 não seria bloqueado pelo tamanho, mas a validação no DTO documentaria a intenção.

### 2.2 Pré-cadastro como rascunho ao iniciar ✅

O vídeo é criado com `status: VideoStatus.DRAFT` na chamada de `createUploadUrl`. Verificado em `videos.service.ts` L50-L60.

### 2.3 Processamento automático após o upload ⚠️ ATENÇÃO

**A lógica do processamento existe e está correta**, mas há um **problema de infraestrutura**:

**O que funciona:**
- `POST /videos/:id/complete-upload` muda status para `PROCESSING` e enfileira job via BullMQ ✅
- `VideoProcessor` (`src/worker/video-processor.ts`) implementa corretamente: download → ffprobe (metadata) → ffmpeg (thumbnail) → upload thumbnail → status READY ✅
- Retry com backoff exponencial (3 tentativas, delay 5s) ✅
- Error handling: status → `FAILED` com `processing_error` ✅

> ⚠️ **PROBLEMA CRÍTICO:** O `Dockerfile.worker` tem `CMD ["tail", "-f", "/dev/null"]` — o container do worker **sobe mas NÃO executa o processo de consumo da fila**. O worker fica idle.
> 
> Além disso, **não existe um `main.ts` no diretório `src/worker/`** que bootstrappe o NestJS como aplicação standalone para consumir a fila.
> 
> **Impacto:** O processamento automático de vídeos **não funciona em produção** — o `Dockerfile.worker` precisa de um CMD que inicie o worker (ex: `CMD ["npx", "nest", "start", "--entryFile", "worker/main"]`) e o arquivo `worker/main.ts` precisa ser criado.

O mesmo padrão `tail -f /dev/null` é usado no `Dockerfile.dev`, o que sugere que o ambiente é operado manualmente com `docker compose exec`. No entanto, o enunciado exige que o worker **suba junto com a stack** e funcione automaticamente.

### 2.4 URL única por vídeo ✅

Slug de 12 caracteres gerado via `node:crypto` com `randomBytes().toString('base64url')`.

**Arquivos:**
- `src/common/utils/slug.util.ts` — geração
- `src/videos/entities/video.entity.ts` L28-L29 — `unique: true`
- Migration cria `UNIQUE` constraint + índice `idx_videos_slug` ✅

### 2.5 Streaming (206 Partial Content) ✅

**Implementação:** `VideosController.streamVideo` (L102-139)

- Lê header `Range` da request ✅
- Repassa o range ao S3 (`GetObjectCommand` com `Range`) ✅
- Retorna `206 Partial Content` com headers `Content-Range`, `Accept-Ranges: bytes` ✅
- Fallback para `200 OK` quando sem Range header ✅
- Faz pipe do stream S3 direto para a response ✅

### 2.6 Download do vídeo ✅

**Implementação:** `VideosController.getDownloadUrl` (L141-163)

- Gera presigned GET URL com `Content-Disposition: attachment` ✅
- Faz redirect (302) para a URL presigned ✅
- Endpoint público (`@Public()`) ✅

### 2.7 Ciclo de status ✅

`VideoStatus` enum:

```
DRAFT → PROCESSING → READY
                    → FAILED
```

- Upload cria como `DRAFT` ✅
- Complete-upload muda para `PROCESSING` ✅
- Worker sucesso: `READY` ✅
- Worker falha: `FAILED` com `processing_error` ✅
- Validação de transição: só aceita `completeUpload` se status é `DRAFT` ✅

---

## 3. Implementação — Infraestrutura e Qualidade

### 3.1 Docker Compose ⚠️

**Arquivo:** `nestjs-project/compose.yaml`

| Serviço | Imagem | Health Check | Status |
|:--------|:-------|:------------:|:------:|
| `nestjs-api` | Build `Dockerfile.dev` | ❌ | ✅ Existe |
| `db` | `postgres:17` | ✅ `pg_isready` | ✅ OK |
| `redis` | `redis:7-alpine` | ✅ `redis-cli ping` | ✅ OK |
| `minio` | `minio/minio:latest` | ✅ `curl health` | ✅ OK |
| `video-worker` | Build `Dockerfile.worker` | ❌ | ⚠️ CMD é `tail -f /dev/null` |
| `mailpit` | `axllent/mailpit` | ❌ | ✅ OK |

> **Problemas identificados:**
> 1. **Worker não inicia automaticamente** — `CMD ["tail", "-f", "/dev/null"]` mantém o container vivo mas sem executar nada. O worker precisa de um entrypoint que bootstrape o NestJS `WorkerModule`.
> 2. **Não há volumes persistentes** para MinIO e Redis — os dados se perdem no `docker compose down`.
> 3. O FFmpeg está instalado no worker Dockerfile via `apt install -y ffmpeg` ✅

### 3.2 Migration ✅

**Arquivo:** `src/database/migrations/1777579900000-CreateVideosTable.ts`

A migration cria:
- Tabela `videos` com todos os campos necessários ✅
- Enum `video_status` (DRAFT, PROCESSING, READY, FAILED) ✅
- FK `channel_id` → `channels(id)` com `ON DELETE CASCADE` ✅
- Unique constraint `UQ_videos_slug` ✅
- Índices: `idx_videos_slug`, `idx_videos_channel_id`, `idx_videos_status` ✅
- Down migration desfaz tudo ✅

### 3.3 Entidade ligada ao canal ✅

```typescript
@ManyToOne(() => Channel, (channel) => channel.videos, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'channel_id' })
channel: Channel;
```

### 3.4 Testes ⚠️

**Arquivos de teste encontrados:**

| Tipo | Arquivo | Cobertura |
|:-----|:--------|:----------|
| Unit | `src/videos/videos.service.spec.ts` | Upload URL, complete upload, ownership |
| Unit | `src/videos/streaming.controller.spec.ts` | Stream, download, video not ready |
| Unit | `src/storage/storage.service.spec.ts` | Presigned URLs, get/delete object |
| Unit | `src/worker/video-processor.spec.ts` | Processing, metadata, thumbnail, errors |
| Unit | `src/common/utils/slug.util.spec.ts` | Slug generation |
| Integration | `src/videos/entities/video.entity.integration-spec.ts` | Entity, constraints, relations |
| Integration | `src/storage/storage.service.integration-spec.ts` | Storage real com MinIO |
| Integration | `src/videos/queues/video-queue.integration-spec.ts` | Queue connection |
| Integration | `src/worker/video-processor.integration-spec.ts` | Worker processing |
| E2E | `test/videos.e2e-spec.ts` | 401 para upload-url e complete-upload |
| E2E | `test/videos-streaming.e2e-spec.ts` | 404 para stream e download não existentes |

> ⚠️ **Os testes E2E são muito superficiais.** Cada arquivo tem apenas 1-2 testes que verificam somente cenários de erro (401 e 404). Não há testes E2E para:
> - Fluxo completo de criação de upload URL (autenticado)
> - Complete upload com transição de status
> - Streaming com Range headers reais
> - Download com redirect
> - Validação de ownership
> - Validação de DTO (400 Bad Request)
>
> O enunciado diz: "Não mocke o que dá para testar de verdade com a infra do Compose." e "Testes nos níveis adequados". Os E2E deveriam cobrir o happy path autenticado.

### 3.5 Definition of Done ❓

O `progress.md` lista a Definition of Done como **checkboxes desmarcados** (`- [ ]`):

```
- [ ] All unit, integration, and E2E tests passing
- [ ] `npx tsc --noEmit` exits with code 0
- [ ] `npm run lint` passes with 0 errors
- [ ] All SIs completed and marked in progress table
```

> ⚠️ Os checkboxes da Definition of Done no `progress.md` estão **todos desmarcados** (`- [ ]` em vez de `- [x]`). Isso pode indicar que a verificação final não foi feita, ou que os checkboxes simplesmente não foram atualizados. **É necessário executar `tsc --noEmit`, `npm run lint` e os testes no container para confirmar.**

### 3.6 Git Flow ✅

- **Branch atual:** `feature/phase-03-upload-processamento-video` ✅
- **Branches long-lived:** `main` e `dev` presentes ✅
- **Nenhum commit direto na `main`** ✅
- **Commits descritivos:** Conventional Commits (`feat(videos):`, `test(config):`, `docs:`) com referência aos SIs ✅
- **Commits na feature branch:** Todos os 10 commits de Phase 03 estão na feature branch ✅

---

## 4. Documentação e Ferramenta

### 4.1 CLAUDE.md atualizado ✅

**CLAUDE.md raiz:**
- Menciona módulo de vídeos, worker, storage, queue ✅
- Diagrama C4 atualizado com todos os containers ✅
- Phase 03 referenciada ✅

**CLAUDE.md backend (`nestjs-project/CLAUDE.md`):**
- Lista todos os serviços Docker (incluindo redis, minio, video-worker) ✅
- Seção "Core Modules (Phase 03)" com endpoints, storage, worker ✅
- Endpoints documentados correspondem ao código ✅
- Consistente com o código real ✅

### 4.2 Portabilidade da fundação de IA ✅

- `AGENTS.md` (raiz e backend) são symlinks para `CLAUDE.md` ✅
- Diretório `.agents/` existe com `rules/` e `skills/` portados ✅
- Diretório `.claude/` original preservado ✅

---

## 5. Verificação dos Critérios de Reprova Automática

| Critério de Reprova | Status | Observação |
|:---------------------|:------:|:-----------|
| Pular workflow (sem research/planejamento/implementação) | ✅ OK | Workflow completo executado |
| Plano sem SIs ou sem Technical Specs | ✅ OK | SI-03.1 a SI-03.7 + todas as Tech Specs |
| `validation.md` não fecha em clean | ✅ OK | Status: `clean`, 0 issues |
| Passar 10GB pela API (sem upload assíncrono) | ✅ OK | Presigned URLs direto ao S3 |
| Não ter fila, worker e storage reais no Compose | ⚠️ **RISCO** | Serviços existem, mas worker CMD é `tail -f /dev/null` |
| `tsc` com erro, lint quebrado ou suíte vermelha | ❓ **Não verificado** | Checkboxes no progress.md desmarcados |
| Commit direto na `main` | ✅ OK | Zero commits na main |
| CLAUDE.md inconsistente com código | ✅ OK | Verificado e consistente |
| Outra ferramenta sem portar fundação | ✅ OK | AGENTS.md + `.agents/` + skills portados |

---

## 6. Achados Detalhados e Recomendações

### 🔴 Problemas Críticos (podem causar reprova)

#### 6.1 Worker não inicia automaticamente

**Problema:** O `Dockerfile.worker` usa `CMD ["tail", "-f", "/dev/null"]` e **não existe** `src/worker/main.ts` para bootstrapar o worker.

**Requisito do enunciado:** "Fila de processamento em segundo plano e um worker que a consome" + "tudo roda em containers" + "worker subindo via docker compose junto com o backend".

**Solução sugerida:**
1. Criar `src/worker/main.ts` que bootstrape `NestFactory.createApplicationContext(WorkerModule)`
2. Alterar `Dockerfile.worker` CMD para executar o worker (ex: `CMD ["npx", "ts-node", "src/worker/main.ts"]`)

#### 6.2 Definition of Done não confirmada

**Problema:** Os checkboxes no `progress.md` estão todos desmarcados, sugerindo que `tsc --noEmit`, `lint` e testes finais podem não ter sido executados.

**Solução:** Executar no container:
```bash
docker compose exec nestjs-api npx tsc --noEmit
docker compose exec nestjs-api npm run lint
docker compose exec nestjs-api npm test -- --runInBand
docker compose exec nestjs-api npm run test:e2e
```
E marcar os checkboxes como `[x]` após confirmar.

### 🟡 Problemas Moderados

#### 6.3 `.env` incompleto

**Problema:** O arquivo `.env` contém apenas variáveis de database (Phase 01/02). Faltam:
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (Phase 02)
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_VIDEOS`, `S3_BUCKET_THUMBNAILS` (Phase 03)
- `REDIS_HOST`, `REDIS_PORT` (Phase 03)

**Atenuante:** Os configs (`storage.config.ts`, `redis.config.ts`) usam defaults com `|| 'redis'` e `|| 'http://minio:9000'`, então funciona sem as variáveis. Porém, o `.env.example` também **não tem** as variáveis de Phase 03 — ele só cobre até Phase 02.

**Solução:** Atualizar tanto `.env` quanto `.env.example` com todas as variáveis documentadas.

#### 6.4 Testes E2E superficiais

**Problema:** Os testes E2E cobrem apenas cenários de erro (401 e 404). Faltam:
- Happy path autenticado para `POST /videos/upload-url`
- Fluxo completo: criar usuário → login → criar upload URL → complete upload
- Streaming com Range header
- Validação de ownership

**Atenuante:** Os testes unitários e de integração cobrem bem a lógica de negócio.

**Recomendação:** Adicionar pelo menos 2-3 testes E2E com cenários autenticados de sucesso.

#### 6.5 Upload de thumbnail usa cast `as unknown` no processor

**Problema:** Em `video-processor.ts` (L149-167), o upload do thumbnail acessa `this.storageService` via cast `as unknown` para chegar ao `s3Client` interno. Isso quebra o encapsulamento e é frágil:

```typescript
const s3Client = (
  this.storageService as unknown as {
    s3Client: { send: (cmd: unknown) => Promise<unknown> };
  }
).s3Client;
```

**Solução:** Adicionar um método público `uploadObject(bucket, key, body, contentType)` ao `StorageService` e usá-lo no processor.

### 🟢 Observações Menores

#### 6.6 Sem validação `@Max()` no DTO para 10GB

O `CreateVideoUploadDto` valida `size_bytes` como `@IsPositive()` mas não tem `@Max(10737418240)`. O upload direto funciona de qualquer jeito, mas a validação documentaria o limite.

#### 6.7 Sem validação de `mime_type` como `video/*`

O DTO aceita qualquer string como `mime_type`. Uma validação `@Matches(/^video\//)` seria recomendável.

#### 6.8 `WorkerModule` faz `ConfigModule.forRoot` sem `storageConfig`

O `WorkerModule` carrega apenas `redisConfig` e `databaseConfig` no `ConfigModule.forRoot`, mas o `StorageModule` precisa de `storageConfig`. A resolução pode depender de como o `StorageModule` injeta a config (se é global, pode já estar registrada).

#### 6.9 Sem volumes persistentes no Docker Compose

MinIO e Redis não possuem named volumes declarados. Os dados se perdem a cada `docker compose down`.

---

## 7. Checklist Final dos Critérios de Aceite

### Decisões e planejamento

- [x] `technical-decisions-phase-03-videos.md` com decisões justificadas (fila, upload, streaming, processamento/thumbnail, ciclo de status)
- [x] Pasta `docs/phases/phase-03-videos/` com `context.md`, `validation.md` (clean), `phase-03-videos.md`, `progress.md` e `library-refs.md`
- [x] Plano com SIs SI-03.x, Technical Specifications, Dependency Map e Deliverables

### Implementação — feature

- [x] Upload de vídeo de até 10GB sem travar a API (presigned URLs)
- [x] Pré-cadastro como rascunho ao iniciar upload
- [⚠️] Processamento automático após upload — **lógica correta mas worker container não inicia automaticamente**
- [x] URL única por vídeo (slug 12 chars, unique index)
- [x] Streaming (206 Partial Content) e download disponível
- [x] Ciclo de status (DRAFT → PROCESSING → READY/FAILED) refletido no banco

### Implementação — infraestrutura e qualidade

- [⚠️] Object storage, fila e worker no Docker Compose — **serviços existem mas worker CMD é `tail -f /dev/null`**
- [x] Migration cria tabela de vídeos; entidade ligada ao canal
- [⚠️] Testes nos níveis adequados — **existem mas E2E são muito superficiais**
- [❓] Definition of Done — **checkboxes não marcados no progress.md; execução não confirmada**
- [x] Git Flow respeitado (`feature/phase-03-upload-processamento-video`, sem commits na `main`)

### Documentação e ferramenta

- [x] CLAUDE.md atualizado com seção de vídeos, coerente com o código
- [x] Fundação de IA portada para Antigravity (AGENTS.md + `.agents/` com skills e rules)

---

## 8. Prioridade de Correção

| Prioridade | Item | Descrição |
|:----------:|:-----|:----------|
| 🔴 P0 | Worker CMD | Criar `worker/main.ts` e corrigir `Dockerfile.worker` CMD |
| 🔴 P0 | Definition of Done | Executar `tsc`, `lint`, testes e marcar checkboxes |
| 🟡 P1 | `.env` incompleto | Adicionar variáveis de S3 e Redis ao `.env` e `.env.example` |
| 🟡 P1 | E2E superficiais | Adicionar testes E2E para happy path autenticado |
| 🟡 P2 | Upload thumbnail | Refatorar `uploadThumbnailFile` para usar método público do `StorageService` |
| 🟢 P3 | DTO validation | Adicionar `@Max(10GB)` e validação de mime_type |
| 🟢 P3 | Docker volumes | Adicionar named volumes para MinIO e Redis |
