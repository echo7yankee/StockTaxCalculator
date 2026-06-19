import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

interface PageMetaProps {
  titleKey: string;
  descriptionKey: string;
  ns?: string;
  descriptionVars?: Record<string, unknown>;
  /**
   * Optional robots directive (e.g. "noindex, follow"). Set on SPA-only app
   * pages that carry no rankable content (the upload funnel, the user
   * dashboard, the session-specific results, the gated filing guide) so
   * crawlers don't index a thin or user-specific shell. Public/content pages
   * omit this and stay indexable; their canonical is injected by the
   * prerenderer (prerender.tsx), which these client-only routes never reach.
   */
  robots?: string;
}

export default function PageMeta({
  titleKey,
  descriptionKey,
  ns = 'meta',
  descriptionVars,
  robots,
}: PageMetaProps) {
  const { t } = useTranslation(ns);
  const title = t(titleKey);
  const description = t(descriptionKey, descriptionVars);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {robots ? <meta name="robots" content={robots} /> : null}
    </Helmet>
  );
}
