import { ApiError } from '@/services/api-client';

export interface FieldIssue {
  /** Dotted path as the API reported it, e.g. "contact.phone" or "items.0.name". */
  path: string;
  /** The path rewritten for a reader, e.g. "Contact → Phone" or "Items #1 → Name". */
  label: string;
  message: string;
}

export interface ReadableApiError {
  /** Headline sentence. Never the bare "Request validation failed". */
  message: string;
  /** One entry per field the API rejected; empty when the failure was not field level. */
  issues: FieldIssue[];
}

/** "contactId" / "contact_id" / "0" -> "Contact" / "Contact" / "#1". */
const humanizeSegment = (segment: string): string => {
  if (/^\d+$/.test(segment)) return `#${Number(segment) + 1}`;
  const words = segment
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  const tidied = words.replace(/\bid\b/g, 'ID').replace(/\burl\b/g, 'URL');
  return tidied.charAt(0).toUpperCase() + tidied.slice(1);
};

/**
 * The wire path may be prefixed with the request part it came from ("body.phone").
 * That is an implementation detail of the validator, not something to show a user.
 */
const humanizePath = (path: string): string =>
  path
    .split('.')
    .filter((segment, index) => !(index === 0 && ['body', 'query', 'params'].includes(segment)))
    .filter(Boolean)
    .map(humanizeSegment)
    .join(' → ');

/**
 * Zod's built-in messages are written for a developer reading a stack trace
 * ("Invalid uuid", "String must contain at least 8 character(s)"). A custom
 * message from a schema is already written for a person, so it passes through.
 */
const friendlyMessage = (message: string): string => {
  const rules: [RegExp, string | ((match: RegExpMatchArray) => string)][] = [
    [/^required$/i, 'This field is required.'],
    [/^invalid uuid$/i, 'Must be a valid ID.'],
    [/^invalid email$/i, 'Enter a valid email address.'],
    [/^invalid url$/i, 'Enter a valid URL.'],
    [/^invalid date$/i, 'Enter a valid date.'],
    [/^invalid$/i, 'This value is not valid.'],
    [/^invalid enum value\. expected (.+?), received .*$/i, (m) => `Choose one of: ${m[1]}.`],
    [/^expected (\w+), received (?:undefined|null)$/i, 'This field is required.'],
    [/^expected (\w+), received \w+$/i, (m) => `Must be a ${m[1]}.`],
    [
      /^string must contain at least (\d+) character\(s\)$/i,
      (m) => `Must be at least ${m[1]} character${m[1] === '1' ? '' : 's'} long.`,
    ],
    [
      /^string must contain at most (\d+) character\(s\)$/i,
      (m) => `Must be at most ${m[1]} character${m[1] === '1' ? '' : 's'} long.`,
    ],
    [/^number must be greater than or equal to (.+)$/i, (m) => `Must be ${m[1]} or more.`],
    [/^number must be less than or equal to (.+)$/i, (m) => `Must be ${m[1]} or less.`],
    [/^array must contain at least 1 element\(s\)$/i, 'Add at least one entry.'],
  ];

  for (const [pattern, replacement] of rules) {
    const match = message.trim().match(pattern);
    if (match) return typeof replacement === 'string' ? replacement : replacement(match);
  }
  return message.charAt(0).toUpperCase() + message.slice(1);
};

const toIssue = (path: string, message: string): FieldIssue => {
  const label = humanizePath(path);
  return { path, label, message: friendlyMessage(message) };
};

/**
 * Zod issues arrive as `[{ path, message }]`, but a hand-thrown `badRequest` may
 * pass details as a `{ field: message }` map or a plain list of strings, so all
 * three shapes are accepted rather than silently dropped.
 */
const extractIssues = (details: unknown): FieldIssue[] => {
  if (Array.isArray(details)) {
    return details.flatMap((entry) => {
      if (typeof entry === 'string') return [toIssue('', entry)];
      if (entry && typeof entry === 'object') {
        const { path, message } = entry as { path?: unknown; message?: unknown };
        if (typeof message !== 'string') return [];
        const flatPath = Array.isArray(path) ? path.join('.') : typeof path === 'string' ? path : '';
        return [toIssue(flatPath, message)];
      }
      return [];
    });
  }

  if (details && typeof details === 'object') {
    return Object.entries(details as Record<string, unknown>).flatMap(([key, value]) => {
      if (typeof value === 'string') return [toIssue(key, value)];
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return (value as string[]).map((item) => toIssue(key, item));
      }
      return [];
    });
  }

  return [];
};

/**
 * Turns anything a mutation or query can reject with into something worth showing.
 * The API already says which field failed and why in `error.details`; before this
 * every screen printed only the envelope message, so the user saw "Request
 * validation failed" with no way to know which input to fix.
 */
export const readApiError = (error: unknown, fallback: string): ReadableApiError => {
  if (error instanceof ApiError) {
    const issues = extractIssues(error.details);
    const generic = /^request validation failed\.?$/i.test(error.message);
    return {
      message:
        generic && issues.length > 0
          ? issues.length === 1
            ? 'Please correct the highlighted field.'
            : `Please correct the ${issues.length} highlighted fields.`
          : error.message || fallback,
      issues,
    };
  }

  if (error instanceof Error && error.message) return { message: error.message, issues: [] };
  return { message: fallback, issues: [] };
};

/** Single-line form, for places that can only render a string (toasts, titles). */
export const formatApiError = (error: unknown, fallback: string): string => {
  const { message, issues } = readApiError(error, fallback);
  if (issues.length === 0) return message;
  return `${message} ${issues
    .map((issue) => (issue.label ? `${issue.label}: ${issue.message}` : issue.message))
    .join(' ')}`;
};
