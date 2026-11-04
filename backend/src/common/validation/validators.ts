import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { isISO8601, ValidateIf, ValidationOptions, registerDecorator } from 'class-validator';

/** Optional, but when present it must not be null (for non-nullable columns). */
export const IsOptionalNonNull = () => ValidateIf((_obj: object, value: unknown) => value !== undefined);

/** Optional and nullable: skips validation for undefined and null. */
export const IsOptionalNullable = () =>
  ValidateIf((_obj: object, value: unknown) => value !== undefined && value !== null);

/** Required but nullable: the key must be present, and `null` skips the other validators. */
export const IsNullable = () => ValidateIf((_obj: object, value: unknown) => value !== null);

/**
 * ISO-8601 date or timestamp that is a real calendar date and that `new Date()` can parse.
 * Plain `@IsISO8601()` also accepts `2026-02-30` (rolls over to March) and week/ordinal forms such as
 * `2026-W45-1` or `2026-307`, which become an Invalid Date. Documented as `format: date-time`.
 */
export function isDateTimeString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 40 &&
    isISO8601(value, { strict: true }) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function IsDateTime(options?: ValidationOptions) {
  return applyDecorators(
    ApiProperty({ type: String, format: 'date-time', example: '2026-11-03T10:00:00.000Z' }),
    (object: object, propertyName: string | symbol) =>
      registerDecorator({
        name: 'isDateTime',
        target: object.constructor,
        propertyName: String(propertyName),
        options: {
          message: `${String(propertyName)} must be an ISO-8601 timestamp like 2026-11-03T10:00:00.000Z`,
          ...options,
        },
        validator: { validate: isDateTimeString },
      }),
  );
}

/** Query-string boolean: "true"/"1" → true, "false"/"0" → false. */
export const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.toLowerCase();
      if (v === 'true' || v === '1') return true;
      if (v === 'false' || v === '0') return false;
    }
    return value;
  });

/** Valid IANA time zone name. */
export function IsTimeZone(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isTimeZone',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must be a valid IANA time zone`, ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidTimeZone(value),
      },
    });
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
