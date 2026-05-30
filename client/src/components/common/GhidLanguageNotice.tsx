import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';

/**
 * Self-contained notice for the Romanian-only /ghid guide pages.
 *
 * The guide pages are intentionally Romanian-only SEO content (they target
 * Romanian "Declarația Unică" search queries and use ANAF's official
 * terminology). When a user has switched the app shell to English, the guide
 * bodies still render in Romanian, which can look like a bug. This shows a
 * small English-language heads-up on guide routes only, and only when the UI
 * language is English.
 *
 * Renders null everywhere else, so Layout can include it unconditionally
 * without knowing anything about the guides. It is never part of the
 * prerendered HTML (Layout is not used by `prerender.tsx`), so the Romanian
 * static content stays clean for crawlers.
 */
export default function GhidLanguageNotice() {
  const { i18n } = useTranslation();
  const { pathname } = useLocation();

  const isGhidRoute = pathname === '/ghid' || pathname.startsWith('/ghid/');
  const isEnglish = (i18n.language || '').toLowerCase().startsWith('en');

  if (!isGhidRoute || !isEnglish) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6">
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-800/50 px-4 py-2.5 text-sm text-gray-600 dark:text-slate-300">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent dark:text-accent-light" aria-hidden="true" />
        <span>
          These guides are written in Romanian. The Declarația Unică is filed in Romanian on ANAF's portal, so they use
          the official terminology. The rest of InvesTax follows your language setting.
        </span>
      </div>
    </div>
  );
}
