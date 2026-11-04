/**
 * Builds the OpenAPI document without starting the API: Nest "preview" mode resolves modules and
 * routes but never instantiates providers, so no Redis, database or environment variables are needed.
 *
 *   node dist/scripts/generate-openapi.js [--out <file>] [--check]
 *
 *   --out <file>  write the JSON document to <file>
 *   --check       exit 1 if the document fails the quality gate (see lintOpenApiDocument)
 *
 * Must run from `dist/` (after `nest build`): the Swagger CLI plugin adds the DTO metadata at compile time.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ApiModule } from '../api.module';
import { lintOpenApiDocument } from '../common/swagger/openapi-lint';
import { API_PREFIX, createOpenApiDocument } from '../openapi';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const out = argValue('--out');
  const check = process.argv.includes('--check');
  if (process.argv.includes('--out') && !out) throw new Error('--out needs a file path');

  const app = await NestFactory.create(ApiModule, { preview: true, logger: ['error'], abortOnError: false });
  app.setGlobalPrefix(API_PREFIX);
  const doc = createOpenApiDocument(app);
  await app.close();

  const operations = Object.values(doc.paths).reduce((n, item) => n + Object.keys(item).length, 0);
  console.log(
    `OpenAPI: ${Object.keys(doc.paths).length} paths, ${operations} operations, ` +
      `${Object.keys(doc.components?.schemas ?? {}).length} schemas`,
  );

  if (out) {
    const file = resolve(out);
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`Wrote ${file}`);
  }

  if (check) {
    const problems = lintOpenApiDocument(doc);
    if (problems.length) {
      console.error(`OpenAPI check failed (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
      return 1;
    }
    console.log('OpenAPI check passed');
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
