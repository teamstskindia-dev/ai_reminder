'use client';

import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { useState } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';

import { CopyButton } from '@/components/common/copy-button';
import { FormField, type BaseFieldProps } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_';

/** Cryptographically random password (default 16 characters). */
export function generatePassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Password input with show/hide, "Generate" and copy. */
export function PasswordField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  autoComplete = 'new-password',
  generate = true,
  ...props
}: BaseFieldProps<T, N, TT> & { autoComplete?: string; generate?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => {
        const value = (field.value as string | undefined) ?? '';
        return (
          <div className="flex items-center gap-2">
            <InputGroup>
              <InputGroupInput
                id={id}
                type={visible ? 'text' : 'password'}
                autoComplete={autoComplete}
                className="font-mono"
                {...aria}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                disabled={field.disabled}
                value={value}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {generate ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  field.onChange(generatePassword());
                  setVisible(true);
                }}
              >
                <Wand2 /> Generate
              </Button>
            ) : null}
            {value ? <CopyButton value={value} label="Copy password" /> : null}
          </div>
        );
      }}
    />
  );
}
