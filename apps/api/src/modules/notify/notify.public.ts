import { Injectable } from '@nestjs/common';

import { NotifyService } from './notify.service';

/** What other modules may use from notify (SRS-ARC-001). */
@Injectable()
export class NotifyPublic {
  constructor(private readonly notify: NotifyService) {}

  /**
   * A plain transactional message to one address. Uses a published template for `event` if the
   * organisation has one, else the inline title/body. Delivery problems never bubble up.
   */
  async sendMessage(input: {
    event: string;
    recipient: string;
    recipientRef?: string;
    localeCode?: string;
    title: string;
    body: string;
    sourceType?: string;
    sourceId?: string;
  }): Promise<void> {
    await this.notify.send({
      event: input.event,
      recipient: input.recipient,
      recipientRef: input.recipientRef,
      localeCode: input.localeCode,
      variables: { title: input.title, body: input.body },
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      fallback: { subject: input.title, body: input.body },
    });
  }
}
