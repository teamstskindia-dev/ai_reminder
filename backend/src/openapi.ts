import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorResponse, PaginationMeta } from './common/swagger/api-models.dto';
import { finalizeOpenApiDocument } from './common/swagger/openapi-finalize';
import { contentOpenApiSchemas } from './modules/content/content.openapi';
import { COOKIES } from './modules/auth/auth-cookies.service';

export const API_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'docs';

const DESCRIPTION = `
Remi backend API. The contract lives in \`docs/API_CONTRACT.md\`; this document is generated from the code.

**Envelope.** Successful responses are \`{ "success": true, "data": … }\`. Paginated lists add
\`meta: { page, limit, total, totalPages }\`. Redirects, \`204\` and \`/health\` are not wrapped.

**Errors.** Every error is \`{ "success": false, "statusCode", "error": { "code", "message", "details"? }, "path",
"timestamp", "requestId" }\`. \`message\` is safe to show to users. \`details\` (only for \`VALIDATION_ERROR\`) lists
each invalid field. Every response carries an \`X-Request-Id\` header.

**Validation.** Request bodies and query strings are validated strictly: unknown fields are rejected, types are
not coerced (except numeric/boolean query parameters), timestamps must be ISO-8601 (\`2026-11-03T10:00:00.000Z\`)
and ids must be UUIDs.

**Authentication.** Mobile sends \`Authorization: Bearer <accessToken>\`. The website and admin panel use
httpOnly cookies set by the API. Admin routes need an admin token and the role shown on each operation.
`.trim();

/** Tag order and descriptions in Swagger UI (names must match each controller's `@ApiTags`). */
const TAGS: [string, string][] = [
  ['health', 'Liveness and readiness probes (no envelope).'],
  ['public', 'Public config and CMS content for the website and the app. No auth.'],
  ['auth', 'Google sign-in (PKCE for mobile), Sign in with Apple, email sign-in codes, token refresh and logout.'],
  ['me', 'The signed-in user profile, settings, personality profile and account deletion.'],
  ['onboarding', 'First-run get-to-know-you chat, voice answers, the first personality profile and finishing setup.'],
  ['integrations', 'Google Calendar connection and sync.'],
  ['dashboard', 'Home screen aggregate.'],
  ['analytics', 'Meeting analytics for a date range.'],
  ['meetings', 'Meetings, transcripts, uploads and the meeting bot.'],
  ['action-items', 'Action items extracted by AI or added by hand.'],
  ['reminders', 'Reminders delivered by push, in-app and email.'],
  ['notifications', 'In-app notification inbox.'],
  ['devices', 'Expo push token registration.'],
  ['assistant', 'Ask questions across meeting transcripts.'],
  ['webhooks', 'Signed callbacks from providers (Recall.ai meeting bots). Not for clients.'],
  ['admin: auth', 'Admin panel sign-in (email + password).'],
  ['admin: users & meetings', 'Admin dashboard, users and meetings.'],
  ['admin: content', 'Settings, landing sections, pages, navigation, banners and plans.'],
  [
    'admin: system',
    'Media, AI prompts, notification templates, broadcasts, admins, audit log, queues and bot providers.',
  ],
];

export function buildOpenApiConfig(): Omit<OpenAPIObject, 'paths'> {
  const builder = new DocumentBuilder()
    .setTitle('Remi API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'User access token (mobile).' },
      'bearer',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Admin access token.' },
      'admin-bearer',
    )
    .addCookieAuth(COOKIES.userAccess, { type: 'apiKey', in: 'cookie', name: COOKIES.userAccess }, COOKIES.userAccess)
    .addCookieAuth(
      COOKIES.adminAccess,
      { type: 'apiKey', in: 'cookie', name: COOKIES.adminAccess },
      COOKIES.adminAccess,
    );
  for (const [name, description] of TAGS) builder.addTag(name, description);
  return builder.build();
}

/** Builds the complete, post-processed OpenAPI document for an app (a full app or a `preview: true` one). */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const doc = SwaggerModule.createDocument(app, buildOpenApiConfig(), {
    extraModels: [ApiErrorResponse, PaginationMeta],
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
  doc.components = { ...doc.components, schemas: { ...doc.components?.schemas, ...contentOpenApiSchemas() } };
  return finalizeOpenApiDocument(doc);
}

/** Serves Swagger UI at `/docs` and the spec at `/docs-json` and `/docs-yaml`. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, () => createOpenApiDocument(app), {
    customSiteTitle: 'Remi API docs',
    swaggerOptions: {
      // Tokens pasted into "Authorize" stay in memory only (never localStorage).
      persistAuthorization: false,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
    },
  });
}
