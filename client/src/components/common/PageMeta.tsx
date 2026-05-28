import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

interface PageMetaProps {
  titleKey: string;
  descriptionKey: string;
  ns?: string;
  descriptionVars?: Record<string, unknown>;
}

export default function PageMeta({ titleKey, descriptionKey, ns = 'meta', descriptionVars }: PageMetaProps) {
  const { t } = useTranslation(ns);
  const title = t(titleKey);
  const description = t(descriptionKey, descriptionVars);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
    </Helmet>
  );
}
