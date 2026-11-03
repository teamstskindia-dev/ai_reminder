import { Injectable, Logger } from '@nestjs/common';
import type { BotSession, SessionOutcome } from './bot-session';
import type { RunContext } from './meet-runner';
import { SAMPLE_TRANSCRIPT } from './sample-transcript';

/**
 * BOT_MODE=simulate: pretends to join, then streams the sample transcript through the same
 * caption pipeline as the real bot (with progressive word-by-word growth on some lines), so the
 * whole flow — transcript → AI report → reminders — can be tested locally without Google Meet.
 * Logs carry ids and counts only (never caption text).
 */
@Injectable()
export class SimulateRunner {
  private readonly logger = new Logger(SimulateRunner.name);

  async run(ctx: Pick<RunContext, 'session' | 'botName'>): Promise<SessionOutcome> {
    const { session } = ctx;
    const started = Date.now();
    this.logger.log({ meetingId: session.meetingId, lines: SAMPLE_TRANSCRIPT.length }, 'simulated bot joining');
    if (await session.sleep(1000)) return { ok: true, reason: 'stopped_before_join' };
    await session.markInCall();

    let spoken = 0;
    for (const [i, line] of SAMPLE_TRANSCRIPT.entries()) {
      if (session.stopRequested) break;
      if (i % 3 === 0) {
        if (await this.speakProgressively(session, line.speaker, line.text)) break;
      } else {
        session.onCaption(line.speaker, line.text);
      }
      spoken++;
      if (await session.sleep(1200)) break;
    }

    // Let the aggregator finalise the last segments before the session drains.
    await session.sleep(4000);
    this.logger.log(
      {
        meetingId: session.meetingId,
        spoken,
        durationMs: Date.now() - started,
      },
      'simulated meeting finished',
    );
    return {
      ok: true,
      reason: session.stopReasonValue ?? 'simulation_complete',
    };
  }

  /** Emits growing prefixes of the line (like Meet's live captions). Returns true if stopped. */
  private async speakProgressively(session: BotSession, speaker: string, text: string): Promise<boolean> {
    const words = text.split(' ');
    for (let n = 2; n <= words.length; n += 2) {
      session.onCaption(speaker, words.slice(0, n).join(' '));
      if (await session.sleep(150)) return true;
    }
    session.onCaption(speaker, text);
    return false;
  }
}
