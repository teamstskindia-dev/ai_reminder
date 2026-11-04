import { Injectable, Logger } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, TargetType } from 'puppeteer-core';
import type { Browser, HTTPRequest, Page, Target } from 'puppeteer-core';
import { AppConfig } from '../../../config/app-config';
import { causeChain } from '../../../common/errors/app.exception';
import { isJoinableMeetUrl } from '../../../common/validation/safe-url';
import type { BotSettings } from '../../content/settings.schemas';
import type { BotSession, SessionOutcome } from './bot-session';
import { BotStep, BotStepError, failureReasonFrom, runStep } from './bot-step-error';
import { captionObserverScript } from './caption-observer';
import { isAllowedNavigation, isMeetPage } from './navigation-guard';
import { textPattern } from './text-pattern';

export { textPattern } from './text-pattern';

export interface RunContext {
  session: BotSession;
  meetingUrl: string;
  botName: string;
  bot: BotSettings;
}

const BINDING = '__remiCaption';
const POLL_MS = 2000;
/** Chromium's single-instance locks; stale copies after a crash would stop the persistent profile from opening. */
const CHROME_LOCK_FILES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
const NAVIGATION_TIMEOUT_MS = 60_000;
const JOIN_BUTTON_TIMEOUT_MS = 2 * 60_000;
const MISSING_IN_CALL_MS = 15_000;

const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--window-size=1280,800',
  '--lang=en-US',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-sync',
  '--disable-background-networking',
];

/**
 * Drives Chromium into a Google Meet call as a guest and streams live captions into the session.
 *
 * - Every selector/text comes from `app_settings.bot.selectors` (hot-fixable from the admin panel).
 * - Hardening: only strict Meet URLs are opened; main-frame navigations outside Google are aborted;
 *   popups are closed; downloads are denied.
 * - Profile: with BOT_PROFILE_DIR the bot uses that persistent profile, signed in to its own Google account
 *   (Meet refuses signed-out automated guests); otherwise each job gets a fresh temporary profile.
 * - No stealth/anti-detection tricks: the bot joins as itself and the host admits it.
 * - Logs never contain caption text, speaker names or the bot's display name.
 */
@Injectable()
export class MeetRunner {
  private readonly logger = new Logger(MeetRunner.name);

  constructor(private readonly config: AppConfig) {}

  async run(ctx: RunContext): Promise<SessionOutcome> {
    const { session, bot } = ctx;
    const meetingId = session.meetingId;
    const res: { browser?: Browser; profileDir?: string } = {};
    try {
      if (!isJoinableMeetUrl(ctx.meetingUrl)) throw new BotStepError('navigate', 'invalid Google Meet URL');

      const page = await this.timed(meetingId, 'navigate', async () => {
        const persistentProfile = this.config.bot.profileDir;
        let profileDir: string;
        if (persistentProfile) {
          // Concurrency is 1 with a persistent profile (env validation), so any lock left here is from a crash.
          await Promise.all(
            CHROME_LOCK_FILES.map((f) => rm(join(persistentProfile, f), { force: true }).catch(() => undefined)),
          );
          profileDir = persistentProfile;
        } else {
          profileDir = await mkdtemp(join(tmpdir(), 'remi-bot-'));
          res.profileDir = profileDir; // only temporary profiles are deleted afterwards
        }
        const browser = await runStep('navigate', 'browser failed to start', () =>
          launch({
            executablePath: this.config.bot.chromePath,
            headless: bot.headless,
            userDataDir: profileDir,
            defaultViewport: { width: 1280, height: 800 },
            args: CHROME_ARGS,
          }),
        );
        res.browser = browser;
        return this.openMeeting(browser, ctx.meetingUrl, meetingId);
      });

      const admitted = await this.timed(meetingId, 'admission', () => this.joinCall(page, ctx));
      if (!admitted) return { ok: true, reason: 'stopped_before_join' };

      await session.markInCall();
      await this.timed(meetingId, 'captions', () => this.startCaptions(page, ctx));
      const reason = await this.timed(meetingId, 'capture', () => this.monitorCall(page, ctx));
      await this.timed(meetingId, 'leave', () => this.leave(page, bot.selectors.leaveButton));
      return { ok: true, reason };
    } catch (err) {
      const failureReason = failureReasonFrom(err, session.inCall ? 'capture' : 'join');
      this.logger.warn({ meetingId, failureReason, causes: causeChain(err) }, 'bot run failed');
      return { ok: false, reason: failureReason };
    } finally {
      if (res.browser) await res.browser.close().catch(() => undefined);
      if (res.profileDir) await rm(res.profileDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Locks the browser down (downloads, popups, off-Google navigations), then opens the meeting. */
  private async openMeeting(browser: Browser, meetingUrl: string, meetingId: string): Promise<Page> {
    await runStep('navigate', 'could not configure the browser', async () => {
      await browser
        .defaultBrowserContext()
        .overridePermissions('https://meet.google.com', ['microphone', 'camera', 'notifications']);
      const cdp = await browser.target().createCDPSession();
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    });

    const page = await runStep('navigate', 'could not open a browser tab', () => browser.newPage());
    browser.on('targetcreated', (target: Target) => void this.closePopup(target, page, meetingId));

    await runStep('navigate', 'could not configure the browser tab', async () => {
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      page.on('request', (request: HTTPRequest) => this.guardRequest(request, page, meetingId));
      await page.setRequestInterception(true);
    });

    await runStep('navigate', 'page failed to load', () =>
      page.goto(meetingUrl, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
      }),
    );
    if (!isMeetPage(page.url())) {
      throw new BotStepError(
        'navigate',
        'meeting redirected away from Google Meet (it may require a signed-in account)',
      );
    }
    return page;
  }

  /** Aborts main-frame navigations to non-Google origins; everything else continues. */
  private guardRequest(request: HTTPRequest, page: Page, meetingId: string): void {
    if (request.isInterceptResolutionHandled()) return;
    try {
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame() &&
        !isAllowedNavigation(request.url())
      ) {
        let origin = 'invalid-url';
        try {
          origin = new URL(request.url()).origin;
        } catch {
          /* keep placeholder */
        }
        this.logger.warn({ meetingId, origin }, 'blocked main-frame navigation');
        void request.abort('blockedbyclient').catch(() => undefined);
        return;
      }
      void request.continue().catch(() => undefined);
    } catch {
      void request.continue().catch(() => undefined);
    }
  }

  private async closePopup(target: Target, mainPage: Page, meetingId: string): Promise<void> {
    if (target.type() !== TargetType.PAGE) return;
    try {
      const popup = await target.page();
      if (popup && popup !== mainPage) {
        this.logger.warn({ meetingId }, 'closed popup window');
        await popup.close();
      }
    } catch {
      /* already gone */
    }
  }

  /**
   * Pre-join screen → "Ask to join" → waiting room → in call.
   * Returns true when in the call, false when a stop was requested first; throws BotStepError on failure.
   */
  private async joinCall(page: Page, ctx: RunContext): Promise<boolean> {
    const { session, bot } = ctx;
    const sel = bot.selectors;
    const started = Date.now();
    let waitingDeadline: number | null = null;
    let nameTyped = false;
    let devicesOff = false;
    let joinClicked = false;

    while (!session.stopRequested) {
      if (await this.exists(page, sel.inCallIndicator)) return true;
      if (await this.bodyMatches(page, sel.deniedText, sel.captionsRegion)) {
        if (!joinClicked) {
          // Meet's "You can't join this video call" page: shown to signed-out automated guests before any join
          // button exists. Not a host decision, so say what actually fixes it.
          throw new BotStepError(
            'join',
            this.config.bot.profileDir
              ? 'Google Meet refused the bot account (check the meeting allows guests from outside the organization)'
              : 'Google Meet refused the bot because it is not signed in to a Google account (see docs/DEPLOYMENT.md → bot sign-in)',
          );
        }
        throw new BotStepError('admission', 'Host denied the request to join');
      }

      if (!joinClicked) {
        // prejoin steps are best effort: Meet variants differ, the join button is what matters.
        await this.clickByText(page, sel.dismissButtonText);
        if (!nameTyped) nameTyped = await this.typeName(page, sel.nameInput, ctx.botName);
        if (!devicesOff) {
          const mic = await this.clickSelector(page, sel.micOffButton);
          const cam = await this.clickSelector(page, sel.camOffButton);
          devicesOff = mic || cam;
        }
        joinClicked = await this.clickByText(page, sel.joinButtonText);
        if (joinClicked) {
          waitingDeadline = Date.now() + bot.waitingRoomTimeoutMinutes * 60_000;
          this.logger.log(
            {
              meetingId: session.meetingId,
              nameTyped,
              devicesOff,
              elapsedMs: Date.now() - started,
            },
            'join requested',
          );
        } else if (Date.now() - started > JOIN_BUTTON_TIMEOUT_MS) {
          throw new BotStepError(
            'join',
            'could not find the join button (the Meet link may be invalid or the UI changed)',
          );
        }
      } else if (await this.bodyMatches(page, sel.waitingRoomText, sel.captionsRegion)) {
        await session.markWaitingRoom();
      }

      if (waitingDeadline !== null && Date.now() > waitingDeadline) {
        throw new BotStepError('admission', 'Not admitted to the meeting');
      }
      await session.sleep(POLL_MS);
    }
    return false;
  }

  private async startCaptions(page: Page, ctx: RunContext): Promise<void> {
    const sel = ctx.bot.selectors;
    const { session } = ctx;
    await runStep('captions', 'could not attach the caption listener', () =>
      page.exposeFunction(BINDING, (speaker: unknown, text: unknown) => {
        session.onCaption(typeof speaker === 'string' ? speaker : '', typeof text === 'string' ? text : '');
      }),
    );
    await this.enableCaptions(page, sel.captionsButton);
    await runStep('captions', 'could not start the caption observer', () =>
      page.evaluate(
        captionObserverScript(
          {
            captionsRegion: sel.captionsRegion ?? '',
            captionBlock: sel.captionBlock ?? '',
            captionSpeaker: sel.captionSpeaker ?? '',
            captionText: sel.captionText ?? '',
          },
          BINDING,
        ),
      ),
    );
    // Captions sometimes need a second attempt once the call UI has settled.
    await session.sleep(8000);
    if (!session.stopRequested && !(await this.exists(page, sel.captionsRegion))) {
      this.logger.warn({ meetingId: session.meetingId }, 'captions region not visible, retrying');
      await this.enableCaptions(page, sel.captionsButton);
    }
  }

  private async enableCaptions(page: Page, captionsButton: string | undefined): Promise<void> {
    if (await this.clickSelector(page, captionsButton)) return;
    try {
      await page.keyboard.press('c');
    } catch {
      /* ignore */
    }
  }

  /** Watches the call until it ends, the bot is alone/kicked, max duration, or a stop request. */
  private async monitorCall(page: Page, ctx: RunContext): Promise<string> {
    const { session, bot } = ctx;
    const sel = bot.selectors;
    const started = Date.now();
    let missingSince: number | null = null;
    let aloneSince: number | null = null;

    while (!session.stopRequested) {
      const now = Date.now();
      if (now - started >= bot.maxDurationMinutes * 60_000) return 'max_duration';
      if (page.isClosed()) throw new BotStepError('capture', 'browser tab closed unexpectedly');
      if (await this.bodyMatches(page, sel.endedText, sel.captionsRegion)) return 'meeting_ended';
      if (await this.bodyMatches(page, sel.deniedText, sel.captionsRegion)) return 'removed_from_meeting';

      if (await this.exists(page, sel.inCallIndicator)) missingSince = null;
      else {
        missingSince ??= now;
        if (now - missingSince > MISSING_IN_CALL_MS) return 'left_call';
      }

      if (bot.leaveWhenAloneMinutes > 0) {
        const count = await this.participantCount(page, sel.participantCount);
        if (count !== null && count <= 1) {
          aloneSince ??= now;
          if (now - aloneSince >= bot.leaveWhenAloneMinutes * 60_000) return 'alone';
        } else aloneSince = null;
      }
      await session.sleep(POLL_MS);
    }
    return session.stopReasonValue ?? 'stopped';
  }

  /** Best effort: clicking "Leave call" lets other participants see the bot leave cleanly. */
  private async leave(page: Page, leaveButton: string | undefined): Promise<void> {
    try {
      if (!page.isClosed() && (await this.clickSelector(page, leaveButton))) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch {
      /* best effort */
    }
  }

  /** Runs a step with start/finish logs (ids, durations and outcome only). */
  private async timed<T>(meetingId: string, step: BotStep, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    this.logger.debug({ meetingId, step }, 'bot step started');
    try {
      const result = await fn();
      this.logger.log({ meetingId, step, durationMs: Date.now() - started }, 'bot step finished');
      return result;
    } catch (err) {
      this.logger.warn(
        {
          meetingId,
          step,
          durationMs: Date.now() - started,
          failedStep: err instanceof BotStepError ? err.step : step,
        },
        'bot step failed',
      );
      throw err;
    }
  }

  // ---------------------------------------------------------------- DOM helpers (never throw)

  private async exists(page: Page, selector: string | undefined): Promise<boolean> {
    if (!selector) return false;
    try {
      return (await page.$(selector)) !== null;
    } catch {
      return false;
    }
  }

  private async clickSelector(page: Page, selector: string | undefined): Promise<boolean> {
    if (!selector) return false;
    try {
      const el = await page.$(selector);
      if (!el) return false;
      await el.click();
      return true;
    } catch {
      return false;
    }
  }

  private async typeName(page: Page, selector: string | undefined, name: string): Promise<boolean> {
    if (!selector) return false;
    try {
      const el = await page.$(selector);
      if (!el) return false;
      await el.click({ count: 3 });
      await el.type(name, { delay: 40 });
      return true;
    } catch {
      return false;
    }
  }

  /** Clicks the first visible button whose text or aria-label matches one of the `a|b|c` texts. */
  private async clickByText(page: Page, texts: string | undefined): Promise<boolean> {
    const pattern = textPattern(texts);
    if (!pattern) return false;
    try {
      return await page.evaluate((source: string) => {
        const re = new RegExp(source, 'i');
        const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'));
        for (const el of candidates) {
          const label = `${el.innerText || ''} ${el.getAttribute('aria-label') || ''}`.trim();
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (re.test(label)) {
            el.click();
            return true;
          }
        }
        return false;
      }, pattern);
    } catch {
      return false;
    }
  }

  /** Whether the page text (excluding live captions) contains one of the `a|b|c` texts. */
  private async bodyMatches(
    page: Page,
    texts: string | undefined,
    captionsRegion: string | undefined,
  ): Promise<boolean> {
    const pattern = textPattern(texts);
    if (!pattern) return false;
    try {
      return await page.evaluate(
        (source: string, region: string) => {
          let text = document.body?.innerText ?? '';
          if (region) {
            try {
              const captions = document.querySelector<HTMLElement>(region)?.innerText;
              if (captions) text = text.replace(captions, ' ');
            } catch {
              /* invalid selector */
            }
          }
          return new RegExp(source, 'i').test(text);
        },
        pattern,
        captionsRegion ?? '',
      );
    } catch {
      return false;
    }
  }

  private async participantCount(page: Page, selector: string | undefined): Promise<number | null> {
    if (!selector) return null;
    try {
      return await page.evaluate((sel: string) => {
        let el: Element | null = null;
        try {
          el = document.querySelector(sel);
        } catch {
          return null;
        }
        if (!el) return null;
        const raw = el.getAttribute('data-avatar-count') ?? el.textContent ?? '';
        const m = /\d+/.exec(raw);
        return m ? Number(m[0]) : null;
      }, selector);
    } catch {
      return null;
    }
  }
}
