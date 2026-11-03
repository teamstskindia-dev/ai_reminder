import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { isApiError } from "@/lib/api/errors";

/**
 * Maps a VALIDATION_ERROR's `details` (`{ field: "dot.path", messages[] }[]`) onto react-hook-form fields.
 * Matches the full path, its last segment, or an explicit alias. Returns true when at least one field
 * error was applied, so the caller can skip a generic toast.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  aliases: Partial<Record<string, Path<T>>> = {},
): boolean {
  if (!isApiError(error) || error.code !== "VALIDATION_ERROR") return false;
  let applied = false;
  for (const issue of error.fieldErrors) {
    const last = issue.field.split(".").pop() ?? issue.field;
    const target =
      aliases[issue.field] ??
      aliases[last] ??
      (fields as readonly string[]).find((f) => f === issue.field || f === last);
    if (target && issue.messages[0]) {
      setError(target as Path<T>, { type: "server", message: issue.messages[0] });
      applied = true;
    }
  }
  return applied;
}
