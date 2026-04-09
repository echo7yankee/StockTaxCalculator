import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const COMMON_PASSWORDS = [
  'password', '12345678', '123456789', '1234567890', 'qwerty123',
  'password1', 'iloveyou', 'sunshine1', 'princess1', 'football1',
  'charlie1', 'shadow12', 'monkey123', 'letmein12', 'dragon12',
  'master12', 'mustang1', 'michael1', 'jennifer', 'trustno1',
  'jordan23', 'harley12', 'ranger12', 'buster12', 'thomas12',
  'robert12', 'batman12', 'andrew12', 'tigger12', 'abcdefgh',
  'qwertyui', 'asdfghjk', 'zxcvbnm1', 'password123', 'admin123',
  'welcome1', 'starwars', 'whatever', 'passw0rd', 'p@ssw0rd',
];

export type PasswordStrength = 'weak' | 'medium' | 'strong';

// eslint-disable-next-line react-refresh/only-export-components
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < 8) return 'weak';
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) return 'weak';

  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  // Penalize repeating chars
  if (/(.)\1{2,}/.test(password)) score--;

  if (score <= 1) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}

// eslint-disable-next-line react-refresh/only-export-components
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.includes(password.toLowerCase());
}

interface Props {
  password: string;
}

export default function PasswordStrengthMeter({ password }: Props) {
  const { t } = useTranslation('common');
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  if (!password) return null;

  const config = {
    weak: { width: 'w-1/3', color: 'bg-red-500', label: t('passwordStrength.weak') },
    medium: { width: 'w-2/3', color: 'bg-yellow-500', label: t('passwordStrength.medium') },
    strong: { width: 'w-full', color: 'bg-green-500', label: t('passwordStrength.strong') },
  };

  const { width, color, label } = config[strength];

  return (
    <div className="mt-1.5" role="status" aria-live="polite">
      <div className="h-1.5 bg-gray-200 dark:bg-navy-600 rounded-full overflow-hidden">
        <div className={`h-full ${width} ${color} rounded-full transition-all duration-300`} />
      </div>
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{label}</p>
    </div>
  );
}
