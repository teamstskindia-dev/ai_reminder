import { Transform } from 'class-transformer';
import { ValidateIf, ValidationOptions, registerDecorator } from 'class-validator';

/** Optional, but when present it must not be null (for non-nullable columns). */
export const IsOptionalNonNull = () => ValidateIf((_obj: object, value: unknown) => value !== undefined);

/** Optional and nullable: skips validation for undefined and null. */
export const IsOptionalNullable = () =>
  ValidateIf((_obj: object, value: unknown) => value !== undefined && value !== null);

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
