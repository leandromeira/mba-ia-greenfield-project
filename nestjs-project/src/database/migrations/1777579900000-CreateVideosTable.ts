import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideosTable1777579900000 implements MigrationInterface {
  name = 'CreateVideosTable1777579900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."video_status" AS ENUM('DRAFT', 'PROCESSING', 'READY', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "videos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(255) NOT NULL,
        "description" text,
        "slug" character varying(12) NOT NULL,
        "status" "public"."video_status" NOT NULL DEFAULT 'DRAFT',
        "original_filename" character varying(255) NOT NULL,
        "file_key" character varying(500) NOT NULL,
        "thumbnail_key" character varying(500),
        "mime_type" character varying(100) NOT NULL,
        "size_bytes" bigint NOT NULL,
        "duration_seconds" double precision,
        "width" integer,
        "height" integer,
        "processing_error" text,
        "channel_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_videos_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_videos_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_videos_channel_id" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_videos_slug" ON "videos" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_videos_channel_id" ON "videos" ("channel_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_videos_status" ON "videos" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_videos_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_videos_channel_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_videos_slug"`);
    await queryRunner.query(`DROP TABLE "videos"`);
    await queryRunner.query(`DROP TYPE "public"."video_status"`);
  }
}
