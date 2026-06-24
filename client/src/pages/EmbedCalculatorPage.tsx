import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import EmbedCalculator, { type EmbedTheme } from '../components/common/EmbedCalculator';

/**
 * Chromeless host for the embeddable calculator (route `/embed/calculator`). This
 * is the iframe target other sites load, so it renders OUTSIDE the app Layout (no
 * Header/Footer) and paints its own full-viewport background. It is `noindex`: the
 * canonical, indexable calculator is /calculator, and we never want a bare widget
 * shell competing in search. Theme comes from `?theme=light|dark` (default light).
 *
 * See /embed for the copy-paste embed snippet and the attribution-link rationale.
 */
export default function EmbedCalculatorPage() {
  const [searchParams] = useSearchParams();
  const theme: EmbedTheme = searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const pageBg = theme === 'dark' ? 'bg-navy-900' : 'bg-white';

  return (
    <div className={`min-h-screen w-full ${pageBg}`}>
      <Helmet>
        <title>Calculator impozit investiții | InvesTax</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <div className="max-w-md mx-auto p-4">
        <EmbedCalculator theme={theme} />
      </div>
    </div>
  );
}
