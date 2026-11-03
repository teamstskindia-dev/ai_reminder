import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from '../errors/app.exception';

export interface FieldError {
  field: string;
  messages: string[];
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  const out: FieldError[] = [];
  for (const e of errors) {
    const field = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) out.push({ field, messages: Object.values(e.constraints) });
    if (e.children?.length) out.push(...flattenValidationErrors(e.children, field));
  }
  return out;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => AppException.validation(flattenValidationErrors(errors)),
  });
}
