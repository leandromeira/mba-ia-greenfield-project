import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class VideoNotFoundException extends DomainException {
  constructor(message = 'Video not found or not ready') {
    super('VIDEO_NOT_FOUND', HttpStatus.NOT_FOUND, message);
  }
}
