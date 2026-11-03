import { Injectable, Logger } from '@nestjs/common';
import { Marked } from 'marked';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfig } from '../../config/app-config';
import { escapeHtml } from '../../common/utils/template.util';
import { isSafeUrl } from '../../common/validation/safe-url';
import { callExternal } from '../external/external-call';

export interface MailMessage {
  to: string;
  subject: string;
  /** Markdown whose variables were already HTML-escaped by the caller. */
  markdown: string;
  /** Plain-text alternative. */
  text: string;
  fromName: string;
  fromEmail: string;
}

/** Markdown → HTML with raw HTML disabled and only http(s)/mailto/relative links. */
const markdown = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, text }) {
      const ok = /^https?:\/\//i.test(href) || isSafeUrl(href, { appScheme: false });
      return ok ? `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>` : escapeHtml(text);
    },
    image({ text }) {
      return escapeHtml(text);
    },
  },
});

export function renderEmailHtml(md: string): string {
  const body = markdown.parse(md) as string;
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:600px;margin:0 auto;padding:24px">${body}</body></html>`;
}

/** Removes CR/LF so template values can never inject mail headers. */
export function sanitizeHeader(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 250);
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly config: AppConfig) {}

  get configured(): boolean {
    return this.config.smtp.configured;
  }

  private get transport(): Transporter {
    if (!this.transporter) {
      const { host, port, user, pass } = this.config.smtp;
      this.transporter = createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: port !== 465 && this.config.isProduction,
        auth: user ? { user, pass } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
    return this.transporter;
  }

  async send(msg: MailMessage): Promise<void> {
    if (!this.configured) return;
    const html = renderEmailHtml(msg.markdown);
    await callExternal({ provider: 'smtp', operation: 'sendMail', retries: 1, timeoutMs: 30_000 }, () =>
      this.transport.sendMail({
        from: { name: sanitizeHeader(msg.fromName), address: msg.fromEmail },
        to: msg.to,
        subject: sanitizeHeader(msg.subject),
        text: msg.text,
        html,
      }),
    );
    this.logger.debug({ subjectLength: msg.subject.length }, 'email sent');
  }
}
