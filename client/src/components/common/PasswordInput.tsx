import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PasswordStrengthMeter from './PasswordStrengthMeter';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  showStrength?: boolean;
  error?: string;
  label: string;
  'aria-describedby'?: string;
}

export default function PasswordInput({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  autoComplete = 'new-password',
  required,
  minLength,
  showStrength,
  error,
  label,
  'aria-describedby': ariaDescribedby,
}: Props) {
  const { t } = useTranslation('common');
  const [showPassword, setShowPassword] = useState(false);

  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, ariaDescribedby].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          className={`input pr-10 ${error ? 'border-red-500 dark:border-red-500 focus:ring-red-500' : ''}`}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          aria-required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 dark:hover:text-slate-300"
          aria-label={showPassword ? t('hidePassword') : t('showPassword')}
          tabIndex={-1}
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {showStrength && <PasswordStrengthMeter password={value} />}
      {error && (
        <p id={errorId} className="text-sm text-red-500 dark:text-red-400 mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
