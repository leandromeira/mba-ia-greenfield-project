import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../common/exceptions/domain.exception';

export class ChannelNotFoundException extends DomainException {
  constructor(message = 'User does not have an active channel') {
    super('CHANNEL_NOT_FOUND', HttpStatus.FORBIDDEN, message);
  }
}
