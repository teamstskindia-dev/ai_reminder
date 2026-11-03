'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, LogIn, TimerReset } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { ErrorReference } from '@/components/common/error-reference';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { authApi } from '@/lib/api/auth';
import { formatRetryAfter, getErrorMessage, getErrorReference, isApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/query-keys';
import { useZodForm } from '@/lib/forms';
import { logger } from '@/lib/logger';
import { email } from '@/lib/schemas/common';
import { safeNextPath } from '@/lib/security/safe-url';

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(256, 'Password is too long'),
});

/** Same message for unknown email, wrong password, disabled account… so accounts cannot be enumerated. */
const INVALID_CREDENTIALS = 'Invalid email or password.';

type FormError = { message: string; reference: string | null };

/** Epoch ms when a rate-limit lockout ends (kept outside render: Date.now is impure). */
function lockoutEndsAt(seconds: number): number {
  return Date.now() + seconds * 1000;
}

/** Seconds left until `until` (epoch ms), ticking once per second. */
function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const secondsLeft = useCountdown(lockedUntil);
  const locked = secondsLeft > 0;
  const form = useZodForm(loginSchema, { defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (locked) return;
    setFormError(null);
    try {
      const { admin } = await authApi.login(values);
      // A fresh session must never show data cached for a previous admin.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.auth.me(), admin);
      logger.info('admin signed in', { role: admin.role });
      router.replace(safeNextPath(searchParams.get('next')));
    } catch (error) {
      form.resetField('password');
      if (isApiError(error) && error.code === 'RATE_LIMITED') {
        const wait = error.retryAfterSeconds ?? 60;
        setLockedUntil(lockoutEndsAt(wait));
        setFormError(null);
        logger.warn('admin sign-in rate limited', { retryAfterSeconds: wait });
        return;
      }
      const unexpected = !isApiError(error) || error.status >= 500 || error.code === 'NETWORK_ERROR';
      logger.info('admin sign-in failed', {
        code: isApiError(error) ? error.code : 'UNKNOWN',
        status: isApiError(error) ? error.status : null,
      });
      setFormError({
        message: unexpected ? getErrorMessage(error) : INVALID_CREDENTIALS,
        reference: getErrorReference(error),
      });
    }
  });

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
          <FieldGroup>
            {locked ? (
              <Alert variant="destructive" role="alert">
                <TimerReset />
                <AlertTitle>Too many sign-in attempts</AlertTitle>
                <AlertDescription>
                  For your security, sign-in is paused. Try again in {formatRetryAfter(secondsLeft)}.
                </AlertDescription>
              </Alert>
            ) : formError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription className="space-y-1">
                  <p>{formError.message}</p>
                  {formError.reference ? <ErrorReference reference={formError.reference} /> : null}
                </AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
                autoFocus
                placeholder="you@company.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...form.register('email')}
              />
              <FieldError id="email-error" errors={[errors.email]} />
            </Field>
            <Field data-invalid={Boolean(errors.password)}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...form.register('password')}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldError id="password-error" errors={[errors.password]} />
            </Field>
            <Button type="submit" size="lg" disabled={isSubmitting || locked} className="w-full">
              {isSubmitting ? <Spinner /> : <LogIn />}
              {isSubmitting ? 'Signing in…' : locked ? `Try again in ${secondsLeft}s` : 'Sign in'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
