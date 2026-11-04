import type { ArgumentMetadata } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { CreateActionItemDto } from '../../modules/action-items/action-items.dto';
import { CreatePlanDto, UpdateMediaDto } from '../../modules/admin/dto/admin.dto';
import { CreateMeetingDto, ListMeetingsQueryDto } from '../../modules/meetings/dto/meetings.dto';
import { AppException } from '../errors/app.exception';
import { MAX_PAGE } from '../pagination/pagination';
import { createValidationPipe } from '../pipes/validation.pipe';
import { describeSafeUrl, IsSafeUrl } from './safe-url';
import { IsDateTime, isDateTimeString, IsNullable } from './validators';

describe('isDateTimeString', () => {
  it.each(['2026-11-03T10:00:00.000Z', '2026-11-03T10:00:00+05:30', '2026-11-03', '2028-02-29T00:00:00Z'])(
    'accepts %s',
    (v) => expect(isDateTimeString(v)).toBe(true),
  );

  it.each([
    ['impossible calendar date', '2026-02-30T10:00:00Z'],
    ['not a leap year', '2027-02-29'],
    ['ISO week date (Invalid Date in JS)', '2026-W45-1'],
    ['ISO ordinal date (Invalid Date in JS)', '2026-307'],
    ['free text', 'tomorrow'],
    ['too long', `2026-11-03T10:00:00.000Z${' '.repeat(40)}`],
  ])('rejects %s', (_label, v) => expect(isDateTimeString(v)).toBe(false));

  it('rejects non-strings', () => {
    expect(isDateTimeString(1_762_000_000_000)).toBe(false);
    expect(isDateTimeString(null)).toBe(false);
  });
});

describe('IsDateTime / IsNullable decorators', () => {
  class Dto {
    @IsDateTime()
    at: unknown;

    @IsNullable()
    @IsDateTime()
    maybe: unknown;
  }
  const errorsFor = (at: unknown, maybe: unknown) =>
    validateSync(Object.assign(new Dto(), { at, maybe })).map((e) => e.property);

  it('validates timestamps and explains the expected format', () => {
    const [error] = validateSync(Object.assign(new Dto(), { at: '2026-W45-1', maybe: null }));
    expect(error.property).toBe('at');
    expect(Object.values(error.constraints ?? {})[0]).toContain('ISO-8601');
  });

  it('IsNullable allows null but not a missing key', () => {
    expect(errorsFor('2026-11-03T10:00:00Z', null)).toEqual([]);
    expect(errorsFor('2026-11-03T10:00:00Z', undefined)).toEqual(['maybe']);
  });
});

describe('IsSafeUrl messages', () => {
  it('describes only the URL forms the field accepts', () => {
    expect(describeSafeUrl({ relative: false, mailto: false, appScheme: false })).toBe('an https:// URL');
    expect(describeSafeUrl()).toBe('an https:// URL, a relative /path, a mailto: link or a remi:// link');
  });

  it('does not suggest relative paths for https-only fields', () => {
    class Dto {
      @IsSafeUrl({ relative: false, mailto: false, appScheme: false })
      imageUrl: unknown;
    }
    const [error] = validateSync(Object.assign(new Dto(), { imageUrl: '/logo.png' }));
    expect(Object.values(error.constraints ?? {})[0]).toBe('imageUrl must be an https:// URL');
  });
});

/** Runs a payload through the app's real global ValidationPipe. */
async function validate(
  metatype: ArgumentMetadata['metatype'],
  value: unknown,
  type: ArgumentMetadata['type'] = 'body',
) {
  try {
    return { value: (await createValidationPipe().transform(value, { type, metatype })) as unknown, fields: [] };
  } catch (err) {
    if (!(err instanceof AppException)) throw err;
    expect(err.code).toBe('VALIDATION_ERROR');
    return { value: undefined, fields: (err.details ?? []).map((d) => d.field) };
  }
}

describe('request DTOs through the global ValidationPipe', () => {
  const meeting = { title: 'Weekly sync', meetingUrl: 'https://meet.google.com/abc-defg-hij' };

  it('rejects dates that would become an Invalid Date in the service', async () => {
    expect((await validate(CreateMeetingDto, { ...meeting, startAt: '2026-W45-1' })).fields).toEqual(['startAt']);
    expect((await validate(CreateActionItemDto, { title: 'Ship it', dueAt: '2026-307' })).fields).toEqual(['dueAt']);
    expect((await validate(CreateMeetingDto, { ...meeting, startAt: '2026-11-03T10:00:00.000Z' })).fields).toEqual([]);
  });

  it('rejects unknown fields', async () => {
    const { fields } = await validate(CreateMeetingDto, { ...meeting, startAt: '2026-11-03T10:00:00Z', admin: true });
    expect(fields).toEqual(['admin']);
  });

  it('bounds the page number and validates meeting status filters', async () => {
    expect((await validate(ListMeetingsQueryDto, { page: String(MAX_PAGE + 1) }, 'query')).fields).toEqual(['page']);
    expect((await validate(ListMeetingsQueryDto, { status: 'completed,bogus' }, 'query')).fields).toEqual(['status']);
    const { value } = await validate(ListMeetingsQueryDto, { page: '2', status: 'scheduled,in_progress' }, 'query');
    expect(value).toMatchObject({ page: 2, limit: 20, status: 'scheduled,in_progress' });
  });

  it('requires every plan limit (null = unlimited)', async () => {
    const plan = {
      slug: 'pro',
      name: 'Pro',
      priceMonthly: 10,
      priceYearly: 100,
      currency: 'USD',
      features: [],
    };
    const partial = await validate(CreatePlanDto, { ...plan, limits: { meetingsPerMonth: 10 } });
    expect(partial.fields).toEqual(['limits.aiQueriesPerDay', 'limits.uploadMinutesPerMonth']);
    const full = await validate(CreatePlanDto, {
      ...plan,
      limits: { meetingsPerMonth: 10, aiQueriesPerDay: null, uploadMinutesPerMonth: null },
    });
    expect(full.fields).toEqual([]);
  });

  it('requires media alt to be sent (null clears it)', async () => {
    expect((await validate(UpdateMediaDto, {})).fields).toEqual(['alt']);
    expect((await validate(UpdateMediaDto, { alt: null })).fields).toEqual([]);
  });
});
