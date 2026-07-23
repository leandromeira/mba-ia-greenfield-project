import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { VideoStatus } from '../enums/video-status.enum';

@Entity('videos')
@Index('idx_videos_slug', ['slug'], { unique: true })
@Index('idx_videos_channel_id', ['channel_id'])
@Index('idx_videos_status', ['status'])
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 12, unique: true })
  slug: string;

  @Column({
    type: 'enum',
    enum: VideoStatus,
    default: VideoStatus.DRAFT,
  })
  status: VideoStatus;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  original_filename: string;

  @Column({ name: 'file_key', type: 'varchar', length: 500 })
  file_key: string;

  @Column({
    name: 'thumbnail_key',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  thumbnail_key: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mime_type: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  size_bytes: string;

  @Column({ name: 'duration_seconds', type: 'float', nullable: true })
  duration_seconds: number | null;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ name: 'processing_error', type: 'text', nullable: true })
  processing_error: string | null;

  @Column({ name: 'channel_id', type: 'uuid' })
  channel_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Channel, (channel) => channel.videos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;
}
