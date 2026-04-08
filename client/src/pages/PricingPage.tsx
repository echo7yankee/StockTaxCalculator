import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, X, Zap, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { analytics } from '../lib/analytics';

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
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    analytics.pricingViewed();
    fetch('/api/payment/promo-status')
      .then(res => res.json())
      .then(data => setPromo(data))
      .catch(() => {});
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
      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        analytics.checkoutStarted();
        window.location.href = data.checkoutUrl;
      } else {
        // Payment system not configured yet — show friendly message
        alert(data.error || 'Payment system is being set up. Please try again soon.');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const faqItems = Array.from({ length: 7 }, (_, i) => ({
    question: t(`faq.q${i + 1}`),
    answer: t(`faq.a${i + 1}`),
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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
              <li key={key} className="flex items-start gap-3 opacity-40">
                <X className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                <span className="text-gray-500 dark:text-slate-500">{t(`features.${key}`)}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/calculator"
            className="btn-secondary text-center mt-6 py-3"
          >
            {t('features.quickCalc')}
          </Link>
        </div>

        {/* Paid tier */}
        <div className="card flex flex-col border-accent border-2 relative">
          {/* Launch badge */}
          {hasLaunchSpots && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-sm font-semibold px-4 py-1 rounded-full whitespace-nowrap">
              {t('launchPrice')} — {t('launchSpotsLeft', { remaining: promo.remaining, limit: promo.limit })}
            </div>
          )}

          <h2 className="text-2xl font-bold mb-1 mt-2">{t('paidPlan')}</h2>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold">{displayPrice}</span>
            <span className="text-gray-500 dark:text-slate-400">{t('perYear')}</span>
          </div>
          {hasLaunchSpots && (
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4 line-through">
              {t('regularPrice', { price: REGULAR_PRICE })}
            </p>
          )}
          {!hasLaunchSpots && <div className="mb-4" />}

          <ul className="space-y-3 flex-1">
            {FREE_FEATURES.map(key => (
              <li key={key} className="flex items-start gap-3">
                <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-gray-700 dark:text-slate-300">{t(`features.${key}`)}</span>
              </li>
            ))}
            {PAID_FEATURES.map(key => (
              <li key={key} className="flex items-start gap-3">
                <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
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
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 px-6 py-3 bg-accent/10 text-accent rounded-full text-sm font-medium">
          <Shield className="w-4 h-4" />
          {t('trustBadge')}
        </div>
      </div>

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
                  <ChevronUp className="w-5 h-5 shrink-0 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 shrink-0 text-gray-400" />
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
