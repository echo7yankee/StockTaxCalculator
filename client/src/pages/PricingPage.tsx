import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, X, Zap, Shield, ChevronDown, ChevronUp, BellRing, FileSearch, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { analytics } from '../lib/analytics';
import PageMeta from '../components/common/PageMeta';
import { Skeleton } from '../components/common/Skeleton';

interface PromoStatus {
  count: number;
  limit: number;
  remaining: number;
}

const LAUNCH_PRICE = '€12';
const REGULAR_PRICE = '€19';

const FREE_FEATURES = [
  'quickCalc',
  'totalTax',
  'cassCalc',
  'earlyFiling',
  'bilingualSupport',
] as const;

const PAID_FEATURES = [
  'pdfUpload',
  'csvUpload',
  'autoCalc',
  'bnrRates',
  'breakdown',
  'dividendCalc',
  'd212Guide',
  'pdfExport',
  'savedHistory',
  'previousYears',
  'emailSupport',
] as const;

export default function PricingPage() {
  const { t } = useTranslation('pricing');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [promo, setPromo] = useState<PromoStatus | null>(null);
  const [promoLoading, setPromoLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    analytics.pricingViewed();
    fetch('/api/payment/promo-status')
      .then(res => res.json())
      .then(data => setPromo(data))
      .catch(() => {})
      .finally(() => setPromoLoading(false));
  }, []);

  const isActive = user?.plan === 'paid';
  const hasLaunchSpots = promo && promo.remaining > 0;
  const displayPrice = hasLaunchSpots ? LAUNCH_PRICE : REGULAR_PRICE;

  const handleCheckout = async () => {
    if (!user) {
      navigate('/login?redirect=/pricing');
      return;
    }

    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/payment/checkout', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.checkoutUrl) {
        analytics.checkoutStarted();
        window.location.href = data.checkoutUrl;
      } else if (res.status === 502) {
        // Payment provider tripped on something almost certainly transient — show
        // the user-translated friendly message rather than the raw English server text.
        alert(t('checkoutErrorUnavailable'));
      } else {
        // 503 (not configured) or other unexpected response — fall back to
        // server-provided message if any, otherwise generic.
        alert(data.error || t('checkoutErrorGeneric'));
      }
    } catch {
      alert(t('checkoutErrorGeneric'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const faqItems = Array.from({ length: 9 }, (_, i) => ({
    question: t(`faq.q${i + 1}`),
    answer: t(`faq.a${i + 1}`),
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageMeta titleKey="pricingTitle" descriptionKey="pricingDesc" />
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
          {t('hero')}
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          {t('heroSubtitle')}
        </p>
      </div>

      {/* Pricing cards */}
      <div className="grid md:grid-cols-2 gap-8 mb-16">
        {/* Free tier */}
        <div className="card flex flex-col">
          <h2 className="text-2xl font-bold mb-1">{t('freePlan')}</h2>
          <div className="text-3xl font-bold mb-6">€0</div>
          <ul className="space-y-3 flex-1">
            {FREE_FEATURES.map(key => (
              <li key={key} className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-gray-700 dark:text-slate-300">{t(`features.${key}`)}</span>
              </li>
            ))}
            {PAID_FEATURES.slice(0, 3).map(key => (
              <li key={key} className="flex items-start gap-3">
                <X className="w-5 h-5 text-gray-500 dark:text-slate-400 shrink-0 mt-0.5" />
                <span className="text-gray-500 dark:text-slate-400 line-through">{t(`features.${key}`)}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/calculator/"
            className="btn-secondary text-center mt-6 py-3"
          >
            {t('features.quickCalc')}
          </Link>
        </div>

        {/* Paid tier */}
        <div className="card flex flex-col border-accent border-2 relative">
          {/* Launch badge — Section 3.9 Site 3: skeleton during load (no hardcoded English),
              real badge when launch spots remain. Absolute-positioned so it never moves layout. */}
          {promoLoading && (
            <div
              className="absolute -top-3 left-1/2 -translate-x-1/2"
              aria-busy="true"
              role="status"
              data-testid="promo-badge-skeleton"
            >
              <span className="sr-only">{t('loadingPromo')}</span>
              <Skeleton w={180} h={28} rounded="full" />
            </div>
          )}
          {!promoLoading && hasLaunchSpots && (
            <div
              className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-sm font-semibold px-4 py-1 rounded-full whitespace-nowrap"
              data-testid="promo-badge"
            >
              {t('launchPrice')}: {t('launchSpotsLeft', { remaining: promo.remaining, limit: promo.limit })}
            </div>
          )}

          <h2 className="text-2xl font-bold mb-1 mt-2">{t('paidPlan')}</h2>
          <div className="flex items-baseline gap-2 mb-1 min-h-[36px]">
            {promoLoading ? (
              <Skeleton w={70} h={36} className="my-0.5" data-testid="price-skeleton" />
            ) : (
              <span className="text-3xl font-bold">{displayPrice}</span>
            )}
            <span className="text-gray-500 dark:text-slate-400">{t('perYear')}</span>
          </div>
          {/* Reserved-height slot for the regular-price strikethrough — keeps layout stable
              whether the launch promo resolves to "active" (strikethrough shown) or "sold out" (empty). */}
          <div className="h-5 mb-4">
            {!promoLoading && hasLaunchSpots && (
              <p className="text-sm text-gray-500 dark:text-slate-400 line-through">
                {t('regularPrice', { price: REGULAR_PRICE })}
              </p>
            )}
          </div>

          <ul className="space-y-3 flex-1">
            {FREE_FEATURES.map(key => (
              <li key={key} className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-gray-700 dark:text-slate-300">{t(`features.${key}`)}</span>
              </li>
            ))}
            {PAID_FEATURES.map(key => (
              <li key={key} className="flex items-start gap-3">
                <Check className="w-5 h-5 text-accent dark:text-accent-light shrink-0 mt-0.5" />
                <span className="font-medium text-gray-900 dark:text-slate-100">{t(`features.${key}`)}</span>
              </li>
            ))}
          </ul>

          {isActive ? (
            <div className="mt-6 py-3 text-center text-green-600 dark:text-green-400 font-semibold">
              {t('alreadyPaid')}
            </div>
          ) : (
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="btn-primary mt-6 py-3 text-center text-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {checkoutLoading ? (
                <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  {user ? t('buyAccess') : t('loginToBuy')}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Trust badge */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-6 py-3 bg-accent/10 text-accent-hover dark:text-accent-light rounded-full text-sm font-medium">
          <Shield className="w-4 h-4" />
          {t('trustBadge')}
        </div>
      </div>

      {/* Free file-check entry point (backlog #24B): let an unsure buyer confirm
          we can read their statement before paying. */}
      <div className="text-center mb-16 text-sm text-gray-600 dark:text-slate-400">
        {t('previewLinkText')}{' '}
        <Link to="/verifica-extras" className="text-accent dark:text-accent-light font-medium underline hover:no-underline">
          {t('previewLinkCta')}
        </Link>
      </div>

      {/* Prior-year / notificare-de-conformare offer (P3, distribution diagnosis).
          Speaks to the ANAF compliance-notice segment: a distinct buyer whose real
          alternative is an accountant billing per declaration per year. Additive block,
          no new URL. Tax claims (8% dividends 2023/2024, accountant price anchor) are
          verified via the ideation tax-fact gate before shipping. */}
      <section className="max-w-3xl mx-auto mb-16 p-6 sm:p-8 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl">
        <div className="flex items-start gap-4">
          <BellRing className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">{t('notificare.heading')}</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-3 leading-relaxed">
              {t('notificare.body')}
            </p>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-3 leading-relaxed">
              {t('notificare.anchor')}
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4 leading-relaxed">
              {t('notificare.guardrail')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/ghid/notificare-anaf-venituri-strainatate/"
                className="btn-secondary inline-flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                {t('notificare.ctaGuide')}
              </Link>
              <Link to="/verifica-extras" className="btn-secondary inline-flex items-center gap-2">
                <FileSearch className="w-4 h-4" />
                {t('notificare.ctaCheck')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8">{t('faq.title')}</h2>
        <div className="space-y-3">
          {faqItems.map((item, i) => (
            <div key={i} className="card !p-0">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full px-6 py-4 flex items-center justify-between text-left"
              >
                <span className="font-medium pr-4">{item.question}</span>
                {openFaq === i ? (
                  <ChevronUp className="w-5 h-5 shrink-0 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 shrink-0 text-gray-500" />
                )}
              </button>
              {openFaq === i && (
                <div className="px-6 pb-4 text-gray-600 dark:text-slate-400">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
