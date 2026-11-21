import type { IntegrationTarget, ToolItem, ToolProvider } from '../../common/types/api.types';
import { NOTION_VERSION } from '../connections/oauth-providers';
import { httpJson, ProviderHttpError } from '../connections/provider-http';

/**
 * Notion, Jira, Linear and Todoist behind one small interface (user-flow §08): pick a default project,
 * create a task, find similar open ones (duplicates), list what is open for the user and read a task's
 * status and due date back.
 */

export interface ToolContext {
  token: string;
  /** connected_accounts.settings: cloudId, siteUrl, accountId (Jira), viewerId (Linear) … */
  settings: Record<string, unknown>;
}

export interface NewToolTask {
  title: string;
  details: string | null;
  /** YYYY-MM-DD in the user's time zone. */
  dueDate: string | null;
  ownerName: string | null;
  /** "From your meeting with Rahul", shown in the task body. */
  sourceLine: string | null;
}

export interface CreatedTask {
  externalId: string;
  externalKey: string | null;
  url: string | null;
  /** The owner was assigned in the tool (otherwise only named in the description). */
  assigned: boolean;
}

export interface TaskState {
  done: boolean;
  dueDate: string | null;
}

export interface ToolApi {
  listTargets(ctx: ToolContext): Promise<IntegrationTarget[]>;
  /** Open items in the target, newest first (for the duplicate check). */
  candidates(ctx: ToolContext, targetId: string): Promise<ToolItem[]>;
  create(ctx: ToolContext, targetId: string, task: NewToolTask): Promise<CreatedTask>;
  /** What is open for the user ("what is pending on my Jira?"). */
  listMine(ctx: ToolContext, targetId: string | null): Promise<ToolItem[]>;
  /** null when the task was deleted in the tool. */
  status(ctx: ToolContext, externalId: string): Promise<TaskState | null>;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

function bodyText(task: NewToolTask, assigned: boolean): string {
  return [
    task.details,
    task.ownerName && !assigned ? `Owner: ${task.ownerName}` : null,
    task.sourceLine,
    'Created with Remi.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ProviderHttpError && err.status === 404) return null;
    throw err;
  }
}

// ---------------------------------------------------------------- Jira (Atlassian Cloud REST v3)

function jiraBase(ctx: ToolContext): string {
  const cloudId = str(ctx.settings.cloudId);
  if (!cloudId) throw new Error('Jira site is unknown: reconnect Jira');
  return `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3`;
}

function jiraUrl(ctx: ToolContext, key: string): string | null {
  const site = str(ctx.settings.siteUrl);
  return site ? `${site.replace(/\/$/, '')}/browse/${encodeURIComponent(key)}` : null;
}

interface JiraIssue {
  id: string;
  key: string;
  fields?: { summary?: string; status?: { name?: string; statusCategory?: { key?: string } }; duedate?: string | null };
}

function jiraItem(ctx: ToolContext, i: JiraIssue): ToolItem {
  return {
    id: i.id,
    key: i.key,
    title: i.fields?.summary ?? i.key,
    status: i.fields?.status?.name ?? null,
    url: jiraUrl(ctx, i.key),
    dueAt: i.fields?.duedate ?? null,
  };
}

async function jiraSearch(ctx: ToolContext, jql: string, max: number): Promise<ToolItem[]> {
  const res = await httpJson<{ issues?: JiraIssue[] }>({
    provider: 'atlassian',
    operation: 'jira.search',
    token: ctx.token,
    url: `${jiraBase(ctx)}/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${max}&fields=summary,status,duedate`,
  });
  return (res.issues ?? []).map((i) => jiraItem(ctx, i));
}

/** Plain text → Atlassian Document Format paragraphs. */
function adf(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: text
      .split(/\n{2,}/)
      .filter(Boolean)
      .slice(0, 50)
      .map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p.slice(0, 5000) }] })),
  };
}

const jira: ToolApi = {
  async listTargets(ctx) {
    const res = await httpJson<{ values?: { id: string; key: string; name: string }[] }>({
      provider: 'atlassian',
      operation: 'jira.projects',
      token: ctx.token,
      url: `${jiraBase(ctx)}/project/search?maxResults=50&orderBy=name`,
    });
    return (res.values ?? []).map((p) => ({ id: p.key, name: `${p.name} (${p.key})` }));
  },
  candidates(ctx, projectKey) {
    return jiraSearch(
      ctx,
      `project = "${projectKey.replace(/"/g, '')}" AND statusCategory != Done ORDER BY created DESC`,
      50,
    );
  },
  async create(ctx, projectKey, task) {
    const base = jiraBase(ctx);
    const project = await httpJson<{ issueTypes?: { id: string; name: string; subtask?: boolean }[] }>({
      provider: 'atlassian',
      operation: 'jira.project',
      token: ctx.token,
      url: `${base}/project/${encodeURIComponent(projectKey)}`,
    });
    const types = (project.issueTypes ?? []).filter((t) => !t.subtask);
    const type = types.find((t) => /^task$/i.test(t.name)) ?? types[0];
    let assigneeId: string | null = null;
    if (task.ownerName) {
      const users = await httpJson<{ accountId: string }[]>({
        provider: 'atlassian',
        operation: 'jira.assignable',
        token: ctx.token,
        url: `${base}/user/assignable/search?project=${encodeURIComponent(projectKey)}&query=${encodeURIComponent(task.ownerName)}&maxResults=2`,
      }).catch(() => []);
      // Only when the name is unambiguous.
      if (users.length === 1) assigneeId = users[0].accountId;
    }
    const created = await httpJson<{ id: string; key: string }>({
      provider: 'atlassian',
      operation: 'jira.create',
      method: 'POST',
      token: ctx.token,
      retries: 0,
      url: `${base}/issue`,
      body: {
        fields: {
          project: { key: projectKey },
          summary: task.title.slice(0, 250),
          issuetype: type ? { id: type.id } : { name: 'Task' },
          description: adf(bodyText(task, Boolean(assigneeId))),
          ...(task.dueDate ? { duedate: task.dueDate } : {}),
          ...(assigneeId ? { assignee: { accountId: assigneeId } } : {}),
        },
      },
    });
    return {
      externalId: created.id,
      externalKey: created.key,
      url: jiraUrl(ctx, created.key),
      assigned: Boolean(assigneeId),
    };
  },
  listMine(ctx) {
    // Assigned to the user, or created by them and not assigned to anyone yet (Jira's default for new issues).
    return jiraSearch(
      ctx,
      '(assignee = currentUser() OR (assignee is EMPTY AND reporter = currentUser())) AND statusCategory != Done ORDER BY updated DESC',
      15,
    );
  },
  async status(ctx, id) {
    const issue = await orNull(
      httpJson<JiraIssue>({
        provider: 'atlassian',
        operation: 'jira.issue',
        token: ctx.token,
        url: `${jiraBase(ctx)}/issue/${encodeURIComponent(id)}?fields=status,duedate`,
      }),
    );
    if (!issue) return null;
    return { done: issue.fields?.status?.statusCategory?.key === 'done', dueDate: issue.fields?.duedate ?? null };
  },
};

// ---------------------------------------------------------------- Linear (GraphQL)

async function linearQuery<T>(
  ctx: ToolContext,
  operation: string,
  query: string,
  variables: object,
  retries = 2,
): Promise<T> {
  const res = await httpJson<{ data?: T }>({
    provider: 'linear',
    operation,
    method: 'POST',
    token: ctx.token,
    retries,
    url: 'https://api.linear.app/graphql',
    body: { query, variables },
  });
  if (!res.data) throw new Error('Linear returned no data');
  return res.data;
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  dueDate?: string | null;
  state?: { name?: string; type?: string };
}

const linearItem = (i: LinearIssue): ToolItem => ({
  id: i.id,
  key: i.identifier,
  title: i.title,
  status: i.state?.name ?? null,
  url: i.url,
  dueAt: i.dueDate ?? null,
});

const OPEN_STATES = '{ state: { type: { nin: ["completed", "canceled"] } } }';
const ISSUE_FIELDS = 'id identifier title url dueDate state { name type }';

const linear: ToolApi = {
  async listTargets(ctx) {
    const d = await linearQuery<{ teams: { nodes: { id: string; name: string; key: string }[] } }>(
      ctx,
      'linear.teams',
      '{ teams(first: 50) { nodes { id name key } } }',
      {},
    );
    return d.teams.nodes.map((t) => ({ id: t.id, name: `${t.name} (${t.key})` }));
  },
  async candidates(ctx, teamId) {
    const d = await linearQuery<{ team: { issues: { nodes: LinearIssue[] } } | null }>(
      ctx,
      'linear.candidates',
      `query($id: String!) { team(id: $id) { issues(first: 50, orderBy: createdAt, filter: ${OPEN_STATES}) { nodes { ${ISSUE_FIELDS} } } } }`,
      { id: teamId },
    );
    return (d.team?.issues.nodes ?? []).map(linearItem);
  },
  async create(ctx, teamId, task) {
    let assigneeId: string | null = null;
    if (task.ownerName) {
      const u = await linearQuery<{ users: { nodes: { id: string }[] } }>(
        ctx,
        'linear.users',
        'query($q: String!) { users(first: 2, filter: { name: { containsIgnoreCase: $q } }) { nodes { id } } }',
        { q: task.ownerName },
      ).catch(() => ({ users: { nodes: [] } }));
      if (u.users.nodes.length === 1) assigneeId = u.users.nodes[0].id;
    }
    const d = await linearQuery<{ issueCreate: { success: boolean; issue: LinearIssue | null } }>(
      ctx,
      'linear.create',
      `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
      {
        input: {
          teamId,
          title: task.title.slice(0, 250),
          description: bodyText(task, Boolean(assigneeId)),
          ...(task.dueDate ? { dueDate: task.dueDate } : {}),
          ...(assigneeId ? { assigneeId } : {}),
        },
      },
      0,
    );
    const issue = d.issueCreate.issue;
    if (!d.issueCreate.success || !issue) throw new Error('Linear did not create the issue');
    return { externalId: issue.id, externalKey: issue.identifier, url: issue.url, assigned: Boolean(assigneeId) };
  },
  async listMine(ctx) {
    // Assigned to the user, plus issues they created that nobody is assigned to yet.
    const d = await linearQuery<{
      viewer: { assignedIssues: { nodes: LinearIssue[] }; createdIssues: { nodes: LinearIssue[] } };
    }>(
      ctx,
      'linear.mine',
      `{ viewer {
          assignedIssues(first: 15, orderBy: updatedAt, filter: ${OPEN_STATES}) { nodes { ${ISSUE_FIELDS} } }
          createdIssues(first: 15, orderBy: updatedAt, filter: { assignee: { null: true }, state: { type: { nin: ["completed", "canceled"] } } }) { nodes { ${ISSUE_FIELDS} } }
        } }`,
      {},
    );
    const seen = new Set<string>();
    return [...d.viewer.assignedIssues.nodes, ...d.viewer.createdIssues.nodes]
      .filter((i) => !seen.has(i.id) && seen.add(i.id))
      .slice(0, 15)
      .map(linearItem);
  },
  async status(ctx, id) {
    const d = await linearQuery<{ issue: LinearIssue | null }>(
      ctx,
      'linear.issue',
      `query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
      { id },
    ).catch((err: unknown) => {
      if (err instanceof ProviderHttpError && err.status !== 401) return { issue: null };
      throw err;
    });
    if (!d.issue) return null;
    return { done: ['completed', 'canceled'].includes(d.issue.state?.type ?? ''), dueDate: d.issue.dueDate ?? null };
  },
};

// ---------------------------------------------------------------- Todoist (unified API v1)

const TODOIST = 'https://api.todoist.com/api/v1';

interface TodoistTask {
  id: string;
  content: string;
  checked?: boolean;
  is_completed?: boolean;
  due?: { date?: string } | null;
}

function results<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = (res as { results?: unknown })?.results;
  return Array.isArray(r) ? (r as T[]) : [];
}

const todoistUrl = (id: string) => `https://app.todoist.com/app/task/${encodeURIComponent(id)}`;
const todoistItem = (t: TodoistTask): ToolItem => ({
  id: String(t.id),
  key: null,
  title: t.content,
  status: null,
  url: todoistUrl(String(t.id)),
  dueAt: t.due?.date ?? null,
});

const todoist: ToolApi = {
  async listTargets(ctx) {
    const res = await httpJson<unknown>({
      provider: 'todoist',
      operation: 'todoist.projects',
      token: ctx.token,
      url: `${TODOIST}/projects?limit=100`,
    });
    return results<{ id: string; name: string }>(res).map((p) => ({ id: String(p.id), name: p.name }));
  },
  async candidates(ctx, projectId) {
    const res = await httpJson<unknown>({
      provider: 'todoist',
      operation: 'todoist.tasks',
      token: ctx.token,
      url: `${TODOIST}/tasks?project_id=${encodeURIComponent(projectId)}&limit=50`,
    });
    return results<TodoistTask>(res).map(todoistItem);
  },
  async create(ctx, projectId, task) {
    const t = await httpJson<TodoistTask>({
      provider: 'todoist',
      operation: 'todoist.create',
      method: 'POST',
      token: ctx.token,
      retries: 0,
      url: `${TODOIST}/tasks`,
      body: {
        content: task.title.slice(0, 500),
        description: bodyText(task, false),
        project_id: projectId,
        ...(task.dueDate ? { due_date: task.dueDate } : {}),
      },
    });
    return { externalId: String(t.id), externalKey: null, url: todoistUrl(String(t.id)), assigned: false };
  },
  async listMine(ctx) {
    const res = await httpJson<unknown>({
      provider: 'todoist',
      operation: 'todoist.tasks',
      token: ctx.token,
      url: `${TODOIST}/tasks?limit=15`,
    });
    return results<TodoistTask>(res).map(todoistItem);
  },
  async status(ctx, id) {
    const t = await orNull(
      httpJson<TodoistTask>({
        provider: 'todoist',
        operation: 'todoist.task',
        token: ctx.token,
        url: `${TODOIST}/tasks/${encodeURIComponent(id)}`,
      }),
    );
    // Completed tasks disappear from the active list in some API versions: treat as done.
    if (!t) return { done: true, dueDate: null };
    return { done: Boolean(t.checked ?? t.is_completed), dueDate: t.due?.date ?? null };
  },
};

// ---------------------------------------------------------------- Notion

const NOTION = 'https://api.notion.com/v1';
const notionHeaders = { 'notion-version': NOTION_VERSION };

type NotionProp = {
  type: string;
  title?: { plain_text?: string }[];
  checkbox?: boolean;
  status?: { name?: string } | null;
  select?: { name?: string } | null;
  date?: { start?: string } | null;
};
interface NotionPage {
  id: string;
  url?: string;
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, NotionProp>;
}

function notionTitle(p: NotionPage): string {
  const prop = Object.values(p.properties ?? {}).find((x) => x.type === 'title');
  return (
    (prop?.title ?? [])
      .map((t) => t.plain_text ?? '')
      .join('')
      .trim() || 'Untitled'
  );
}

function notionState(p: NotionPage): TaskState {
  const props = Object.values(p.properties ?? {});
  const doneWord = /^(done|complete|completed|closed|shipped)$/i;
  const done =
    Boolean(p.archived || p.in_trash) ||
    props.some(
      (x) =>
        (x.type === 'checkbox' && x.checkbox === true) ||
        (x.type === 'status' && doneWord.test(x.status?.name ?? '')) ||
        (x.type === 'select' && doneWord.test(x.select?.name ?? '')),
    );
  const date = props.find((x) => x.type === 'date')?.date?.start ?? null;
  return { done, dueDate: date ? date.slice(0, 10) : null };
}

function notionItem(p: NotionPage): ToolItem {
  const statusProp = Object.values(p.properties ?? {}).find((x) => x.type === 'status' || x.type === 'select');
  return {
    id: p.id,
    key: null,
    title: notionTitle(p),
    status: statusProp?.status?.name ?? statusProp?.select?.name ?? null,
    url: p.url ?? null,
    dueAt: notionState(p).dueDate,
  };
}

function paragraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .flatMap((p) => p.match(/[\s\S]{1,1900}/g) ?? [])
    .slice(0, 90)
    .map((chunk) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] },
    }));
}

async function notionQuery(ctx: ToolContext, databaseId: string, size: number): Promise<NotionPage[]> {
  const res = await httpJson<{ results?: NotionPage[] }>({
    provider: 'notion',
    operation: 'notion.query',
    method: 'POST',
    token: ctx.token,
    headers: notionHeaders,
    url: `${NOTION}/databases/${encodeURIComponent(databaseId)}/query`,
    body: { page_size: size, sorts: [{ timestamp: 'created_time', direction: 'descending' }] },
  });
  return res.results ?? [];
}

/** Creates a page in a Notion database (a task, or a saved summary). */
export async function notionCreatePage(
  ctx: ToolContext,
  databaseId: string,
  page: { title: string; body: string; dueDate?: string | null },
): Promise<{ id: string; url: string | null }> {
  const db = await httpJson<{ properties?: Record<string, { type: string }> }>({
    provider: 'notion',
    operation: 'notion.database',
    token: ctx.token,
    headers: notionHeaders,
    url: `${NOTION}/databases/${encodeURIComponent(databaseId)}`,
  });
  const entries = Object.entries(db.properties ?? {});
  const titleProp = entries.find(([, p]) => p.type === 'title')?.[0] ?? 'Name';
  const dateProp = entries.find(([, p]) => p.type === 'date')?.[0];
  const created = await httpJson<{ id: string; url?: string }>({
    provider: 'notion',
    operation: 'notion.create',
    method: 'POST',
    token: ctx.token,
    headers: notionHeaders,
    retries: 0,
    url: `${NOTION}/pages`,
    body: {
      parent: { database_id: databaseId },
      properties: {
        [titleProp]: { title: [{ type: 'text', text: { content: page.title.slice(0, 1900) } }] },
        ...(dateProp && page.dueDate ? { [dateProp]: { date: { start: page.dueDate } } } : {}),
      },
      children: paragraphs(page.body),
    },
  });
  return { id: created.id, url: created.url ?? null };
}

const notion: ToolApi = {
  async listTargets(ctx) {
    const res = await httpJson<{ results?: { id: string; title?: { plain_text?: string }[] }[] }>({
      provider: 'notion',
      operation: 'notion.search',
      method: 'POST',
      token: ctx.token,
      headers: notionHeaders,
      url: `${NOTION}/search`,
      body: { filter: { property: 'object', value: 'database' }, page_size: 50 },
    });
    return (res.results ?? []).map((d) => ({
      id: d.id,
      name:
        (d.title ?? [])
          .map((t) => t.plain_text ?? '')
          .join('')
          .trim() || 'Untitled database',
    }));
  },
  async candidates(ctx, databaseId) {
    return (await notionQuery(ctx, databaseId, 50)).filter((p) => !notionState(p).done).map(notionItem);
  },
  async create(ctx, databaseId, task) {
    const page = await notionCreatePage(ctx, databaseId, {
      title: task.title,
      body: bodyText(task, false),
      dueDate: task.dueDate,
    });
    return { externalId: page.id, externalKey: null, url: page.url, assigned: false };
  },
  async listMine(ctx, databaseId) {
    if (!databaseId) return [];
    return (await notionQuery(ctx, databaseId, 50))
      .filter((p) => !notionState(p).done)
      .slice(0, 15)
      .map(notionItem);
  },
  async status(ctx, id) {
    const page = await orNull(
      httpJson<NotionPage>({
        provider: 'notion',
        operation: 'notion.page',
        token: ctx.token,
        headers: notionHeaders,
        url: `${NOTION}/pages/${encodeURIComponent(id)}`,
      }),
    );
    return page ? notionState(page) : null;
  },
};

export const TOOL_API: Record<ToolProvider, ToolApi> = { jira, linear, todoist, notion };
