import { Injectable } from '@nestjs/common';
import { DeliveryService } from '../notifications/delivery.service';
import { nudgesPaused } from '../notifications/notification-policy';
import { CompanionContextService } from './companion-context.service';
import { dayHeadline, morningPush } from './companion.copy';

/** Morning brief at the user's wake time (user-flow §03): one push in their vibe that opens Today. */
@Injectable()
export class MorningBriefService {
  constructor(
    private readonly context: CompanionContextService,
    private readonly delivery: DeliveryService,
  ) {}

  async send(userId: string, day: string): Promise<'sent' | 'skipped'> {
    const user = await this.context.user(userId);
    if (!user || !user.settings.morningBrief || nudgesPaused(user.settings)) return 'skipped';
    const facts = await this.context.day(userId, user.timezone, day);
    const push = morningPush(user.lang, user.name, dayHeadline(user.lang, facts));
    await this.delivery.deliver({
      userId,
      type: 'morning_brief',
      templateKey: 'morning_brief',
      vars: push,
      fallback: push,
      data: { url: '/home' },
    });
    return 'sent';
  }
}
