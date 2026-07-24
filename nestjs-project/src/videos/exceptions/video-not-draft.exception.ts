import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class VideoNotDraftException extends DomainException {
  constructor(message = 'Video is not in DRAFT status') {
    super('VIDEO_NOT_DRAFT', HttpStatus.BAD_REQUEST, message);
  }
}
