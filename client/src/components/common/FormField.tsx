import type { ReactNode } from 'react';

interface Props {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: (props: {
    id: string;
    'aria-required'?: boolean;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    className: string;
  }) => ReactNode;
}

export default function FormField({ id, label, error, required, hint, children }: Props) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1">
        {label}
      </label>
      {children({
        id,
        'aria-required': required || undefined,
        'aria-invalid': !!error || undefined,
        'aria-describedby': describedBy,
        className: `input ${error ? 'border-red-500 dark:border-red-500 focus:ring-red-500' : ''}`,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-gray-500 dark:text-slate-500 mt-1">{hint}</p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-red-500 dark:text-red-400 mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
