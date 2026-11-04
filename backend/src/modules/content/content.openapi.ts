import type { ApiPropertyOptions, SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import { SECTION_TYPES, type SectionType } from '../../common/types/api.types';
import { SECTION_CONTENT_SCHEMAS } from './section-content.schemas';
import { SETTING_KEYS, SETTINGS_SCHEMAS, type SettingKey } from './settings.schemas';

/**
 * OpenAPI component schemas generated from the zod schemas that validate settings values and CMS section
 * content, so the docs can never drift from the runtime validation.
 */

const pascal = (key: string) =>
  key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** `app` holds app metadata (contract `AppMeta`); "AppSetting" would read like any setting. */
const SETTING_NAME_OVERRIDES: Partial<Record<SettingKey, string>> = { app: 'AppMetaSetting' };

export const settingSchemaName = (key: SettingKey) => SETTING_NAME_OVERRIDES[key] ?? `${pascal(key)}Setting`;
export const sectionContentSchemaName = (type: SectionType) => `${pascal(type)}SectionContent`;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

function toOpenApi(schema: z.ZodType, description: string): SchemaObject {
  // `io: 'input'` documents what clients send; refinements that JSON Schema cannot express are left out.
  const json: Record<string, unknown> = {
    ...z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' }),
  };
  delete json.$schema;
  return { ...json, description };
}

/** Component schemas to merge into the OpenAPI document. */
export function contentOpenApiSchemas(): Record<string, SchemaObject> {
  const out: Record<string, SchemaObject> = {};
  for (const key of SETTING_KEYS) {
    out[settingSchemaName(key)] = toOpenApi(SETTINGS_SCHEMAS[key], `Value of the \`${key}\` app setting.`);
  }
  for (const type of SECTION_TYPES) {
    out[sectionContentSchemaName(type)] = toOpenApi(
      SECTION_CONTENT_SCHEMAS[type],
      `\`content\` of a \`${type}\` section.`,
    );
  }
  return out;
}

/** `value` of any setting; which one applies is chosen by the `key`. */
export const settingValueSchema = (): ApiPropertyOptions => ({
  description: 'Full setting value. The shape depends on the setting key (one of the `*Setting` schemas).',
  oneOf: SETTING_KEYS.map((key) => ref(settingSchemaName(key))),
});

/** `content` of any section; which one applies is chosen by the section `type`. */
export const sectionContentSchema = (): ApiPropertyOptions => ({
  description: 'Section content. The shape depends on the section `type` (one of the `*SectionContent` schemas).',
  oneOf: SECTION_TYPES.map((type) => ref(sectionContentSchemaName(type))),
});

/** Property schema pointing at one setting's value schema. */
export const settingRef = (key: SettingKey): ApiPropertyOptions => ({ allOf: [ref(settingSchemaName(key))] });
