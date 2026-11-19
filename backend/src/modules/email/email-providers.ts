import type { EmailProvider } from '../../common/types/api.types';
import { httpJson, ProviderHttpError } from '../connections/provider-http';
import { headerSafe, htmlToText, parseAddress, trimQuoted } from './email.util';

/** One new inbox email, as read from Gmail / Outlook. The text is used for triage only and never stored. */
export interface RawEmail {
  id: string;
  threadId: string | null;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  text: string;
  receivedAt: Date;
  labels: string[];
}

export interface FetchResult {
  emails: RawEmail[];
  cursor: string | null;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  /** Reply in this thread (provider message id of the email being answered). */
  replyToMessageId?: string | null;
  replyToThreadId?: string | null;
}

const MAX_PER_SYNC = 25;
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GRAPH = 'https://graph.microsoft.com/v1.0/me';

// ---------------------------------------------------------------- Gmail

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
}

function b64url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function findPart(part: GmailPart | undefined, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return b64url(part.body.data);
  for (const p of part.parts ?? []) {
    const found = findPart(p, mime);
    if (found) return found;
  }
  return null;
}

function header(msg: GmailMessage, name: string): string | null {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function gmailToRaw(msg: GmailMessage): RawEmail {
  const from = parseAddress(header(msg, 'From'));
  const plain = findPart(msg.payload, 'text/plain');
  const html = plain ? null : findPart(msg.payload, 'text/html');
  return {
    id: msg.id,
    threadId: msg.threadId ?? null,
    fromName: from.name,
    fromEmail: from.email,
    subject: header(msg, 'Subject'),
    text: trimQuoted(plain ?? (html ? htmlToText(html) : '')),
    receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
    labels: msg.labelIds ?? [],
  };
}

async function gmailMessage(token: string, id: string): Promise<GmailMessage> {
  return httpJson<GmailMessage>({
    provider: 'google',
    operation: 'gmail.get',
    token,
    url: `${GMAIL}/messages/${encodeURIComponent(id)}?format=full`,
  });
}

async function gmailFresh(token: string): Promise<{ ids: string[]; cursor: string | null }> {
  const [list, profile] = await Promise.all([
    httpJson<{ messages?: { id: string }[] }>({
      provider: 'google',
      operation: 'gmail.list',
      token,
      url: `${GMAIL}/messages?maxResults=${MAX_PER_SYNC}&q=${encodeURIComponent('in:inbox newer_than:1d')}`,
    }),
    httpJson<{ historyId?: string }>({
      provider: 'google',
      operation: 'gmail.profile',
      token,
      url: `${GMAIL}/profile`,
    }),
  ]);
  return { ids: (list.messages ?? []).map((m) => m.id), cursor: profile.historyId ?? null };
}

/** New inbox emails since the last historyId (first run: the last day). */
export async function gmailFetchNew(token: string, cursor: string | null): Promise<FetchResult> {
  let ids: string[] = [];
  let next: string | null = cursor;
  if (!cursor) {
    ({ ids, cursor: next } = await gmailFresh(token));
  } else {
    try {
      const res = await httpJson<{
        history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[];
        historyId?: string;
      }>({
        provider: 'google',
        operation: 'gmail.history',
        token,
        url: `${GMAIL}/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&labelId=INBOX&maxResults=100`,
      });
      ids = [
        ...new Set(
          (res.history ?? [])
            .flatMap((h) => h.messagesAdded ?? [])
            .filter((m) => (m.message.labelIds ?? ['INBOX']).includes('INBOX'))
            .map((m) => m.message.id),
        ),
      ];
      next = res.historyId ?? cursor;
    } catch (err) {
      // The history id is too old (404): start over from the last day.
      if (err instanceof ProviderHttpError && err.status === 404) ({ ids, cursor: next } = await gmailFresh(token));
      else throw err;
    }
  }
  const emails: RawEmail[] = [];
  for (const id of ids.slice(-MAX_PER_SYNC)) {
    try {
      const msg = await gmailMessage(token, id);
      if ((msg.labelIds ?? []).includes('SENT') && !(msg.labelIds ?? []).includes('INBOX')) continue;
      emails.push(gmailToRaw(msg));
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) continue; // deleted meanwhile
      throw err;
    }
  }
  return { emails, cursor: next };
}

function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function rfc822(e: OutgoingEmail, inReplyTo: string | null): string {
  const lines = [
    `To: ${headerSafe(e.to, 320)}`,
    `Subject: ${encodeHeader(headerSafe(e.subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    ...(inReplyTo ? [`In-Reply-To: ${headerSafe(inReplyTo)}`, `References: ${headerSafe(inReplyTo)}`] : []),
    '',
    Buffer.from(e.body, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'),
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

export async function gmailSend(token: string, e: OutgoingEmail): Promise<void> {
  let inReplyTo: string | null = null;
  if (e.replyToMessageId) {
    const original = await httpJson<GmailMessage>({
      provider: 'google',
      operation: 'gmail.get',
      token,
      url: `${GMAIL}/messages/${encodeURIComponent(e.replyToMessageId)}?format=metadata&metadataHeaders=Message-ID`,
    }).catch(() => null);
    inReplyTo = original ? header(original, 'Message-ID') : null;
  }
  await httpJson({
    provider: 'google',
    operation: 'gmail.send',
    method: 'POST',
    token,
    retries: 0,
    url: `${GMAIL}/messages/send`,
    body: { raw: rfc822(e, inReplyTo), ...(e.replyToThreadId ? { threadId: e.replyToThreadId } : {}) },
  });
}

// ---------------------------------------------------------------- Outlook (Microsoft Graph)

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string | null;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
  inferenceClassification?: string;
}

function graphToRaw(m: GraphMessage): RawEmail {
  const content = m.body?.content ?? '';
  const text = m.body?.contentType === 'html' ? htmlToText(content) : content;
  return {
    id: m.id,
    threadId: m.conversationId ?? null,
    fromName: m.from?.emailAddress?.name ?? null,
    fromEmail: m.from?.emailAddress?.address?.toLowerCase() ?? null,
    subject: m.subject ?? null,
    text: trimQuoted(text),
    receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
    // "Other" in the Focused inbox behaves like Gmail's promotions tab.
    labels: m.inferenceClassification === 'other' ? ['CATEGORY_PROMOTIONS'] : [],
  };
}

/** New inbox emails received after the cursor (an ISO time; first run: the last day). */
export async function outlookFetchNew(token: string, cursor: string | null): Promise<FetchResult> {
  const since = cursor ?? new Date(Date.now() - 24 * 3600_000).toISOString();
  const select = 'id,conversationId,subject,receivedDateTime,from,body,inferenceClassification';
  const res = await httpJson<{ value?: GraphMessage[] }>({
    provider: 'microsoft',
    operation: 'graph.inbox',
    token,
    headers: { prefer: 'outlook.body-content-type="text"' },
    url:
      `${GRAPH}/mailFolders/inbox/messages?$select=${select}&$top=${MAX_PER_SYNC}` +
      `&$orderby=receivedDateTime asc&$filter=${encodeURIComponent(`receivedDateTime gt ${since}`)}`,
  });
  const emails = (res.value ?? []).map(graphToRaw);
  const last = res.value?.[res.value.length - 1]?.receivedDateTime ?? null;
  return { emails, cursor: last ?? cursor ?? since };
}

export async function outlookSend(token: string, e: OutgoingEmail): Promise<void> {
  const to = [{ emailAddress: { address: headerSafe(e.to, 320) } }];
  if (e.replyToMessageId) {
    await httpJson({
      provider: 'microsoft',
      operation: 'graph.reply',
      method: 'POST',
      token,
      retries: 0,
      url: `${GRAPH}/messages/${encodeURIComponent(e.replyToMessageId)}/reply`,
      body: { message: { toRecipients: to }, comment: e.body },
    });
    return;
  }
  await httpJson({
    provider: 'microsoft',
    operation: 'graph.sendMail',
    method: 'POST',
    token,
    retries: 0,
    url: `${GRAPH}/sendMail`,
    body: {
      message: { subject: headerSafe(e.subject), body: { contentType: 'Text', content: e.body }, toRecipients: to },
      saveToSentItems: true,
    },
  });
}

/** The text of one email, fetched live (for drafting a reply; never stored). */
export async function fetchEmailText(provider: EmailProvider, token: string, id: string): Promise<string> {
  if (provider === 'gmail') return gmailToRaw(await gmailMessage(token, id)).text;
  const m = await httpJson<GraphMessage>({
    provider: 'microsoft',
    operation: 'graph.message',
    token,
    headers: { prefer: 'outlook.body-content-type="text"' },
    url: `${GRAPH}/messages/${encodeURIComponent(id)}?$select=id,subject,from,body,receivedDateTime`,
  });
  return graphToRaw(m).text;
}

export function fetchNew(provider: EmailProvider, token: string, cursor: string | null): Promise<FetchResult> {
  return provider === 'gmail' ? gmailFetchNew(token, cursor) : outlookFetchNew(token, cursor);
}

export function sendEmail(provider: EmailProvider, token: string, e: OutgoingEmail): Promise<void> {
  return provider === 'gmail' ? gmailSend(token, e) : outlookSend(token, e);
}

export function webUrl(provider: EmailProvider, messageId: string): string {
  return provider === 'gmail'
    ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(messageId)}`
    : `https://outlook.office.com/mail/inbox/id/${encodeURIComponent(messageId)}`;
}
