import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class VideoForbiddenException extends DomainException {
  constructor(message = 'You do not have permission to manage this video') {
    super('VIDEO_FORBIDDEN', HttpStatus.FORBIDDEN, message);
  }
}
