import type { OpenAPIObject, OperationObject, ResponseObject } from '@nestjs/swagger';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const;
/** Success statuses that legitimately have no body. */
const BODYLESS = new Set(['204', '302', '304']);

type Schema = Record<string, unknown>;

function isPlaceholderObject(schema: Schema | undefined): boolean {
  if (!schema || schema.$ref) return false;
  const properties = schema.properties as Record<string, unknown> | undefined;
  return (
    schema.type === 'object' &&
    (!properties || Object.keys(properties).length === 0) &&
    !schema.additionalProperties &&
    !schema.allOf &&
    !schema.oneOf &&
    !schema.anyOf
  );
}

function collectRefs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') out.add(value);
      else collectRefs(value, out);
    }
  }
}

/**
 * Quality gate for the generated document. Returns one message per problem (empty = good):
 * operations without a summary, success responses without a typed body, untyped placeholder models,
 * dangling `$ref`s, undeclared tags and leftover internal `x-remi-*` extensions.
 */
export function lintOpenApiDocument(doc: OpenAPIObject): string[] {
  const problems: string[] = [];
  const schemas = (doc.components?.schemas ?? {}) as Record<string, Schema>;
  const declaredTags = new Set((doc.tags ?? []).map((t) => t.name));

  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const op = item[method] as (OperationObject & Record<string, unknown>) | undefined;
      if (!op) continue;
      const where = `${method.toUpperCase()} ${path}`;

      if (!op.summary?.trim()) problems.push(`${where}: missing summary (@ApiOperation)`);
      for (const tag of op.tags ?? []) {
        if (!declaredTags.has(tag)) problems.push(`${where}: tag "${tag}" is not declared in openapi.ts`);
      }
      for (const key of Object.keys(op)) {
        if (key.startsWith('x-remi-')) problems.push(`${where}: internal extension ${key} was not removed`);
      }

      const responses = Object.entries(op.responses ?? {}) as [string, ResponseObject][];
      const successes = responses.filter(([status]) => status.startsWith('2') || status.startsWith('3'));
      if (!successes.length) problems.push(`${where}: no success response documented`);
      for (const [status, res] of successes) {
        if (BODYLESS.has(status)) continue;
        const schema = res.content?.['application/json']?.schema as Schema | undefined;
        if (!schema) problems.push(`${where} ${status}: response has no schema (@ApiDataResponse)`);
        else if (isPlaceholderObject(schema)) problems.push(`${where} ${status}: response schema is an untyped object`);
      }
    }
  }

  for (const [name, schema] of Object.entries(schemas)) {
    if (isPlaceholderObject(schema)) {
      problems.push(`schema ${name}: has no properties (is it defined outside a *.dto.ts file?)`);
    }
  }

  const refs = new Set<string>();
  collectRefs(doc, refs);
  for (const ref of refs) {
    const name = ref.replace('#/components/schemas/', '');
    if (ref.startsWith('#/components/schemas/') && !schemas[name]) problems.push(`dangling $ref ${ref}`);
  }

  return problems;
}
