import { Link } from 'react-router-dom';
import { Upload, Calculator, FileText, ArrowRight, Shield, Scale, Lock, Zap, MessageSquareQuote, User } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import PageMeta from '../components/common/PageMeta';
import { taxYearInterpVars } from '../utils/taxYearVars';
import { GHID_LIST } from '../lib/ghidIndexSchemas';

export default function Landing() {
  const { t, i18n } = useTranslation('landing');
  const { user } = useAuth();
  const isPaid = user?.plan === 'paid';
  // Pre-pay parse gate (backlog #24B Phase 2, PR-3): the primary "get started" CTA
  // routes a non-paid visitor through the FREE checker (/verifica-extras) instead of
  // straight to the paywall, so they confirm we can read their file before any charge.
  // A paid user still goes straight to /upload. Secondary links (free calculator,
  // guides) are unchanged. The label reads as a free pre-check, not a hurdle.
  const primaryCtaLink = isPaid ? '/upload' : '/verifica-extras';
  const primaryCtaLabel = isPaid ? t('uploadPdf') : t('checkStatementCta');
  const yearVars = taxYearInterpVars(i18n.language);

  const steps = [
    { icon: Upload, title: t('stepUploadTitle'), description: t('stepUploadDesc') },
    { icon: Calculator, title: t('stepCalculateTitle'), description: t('stepCalculateDesc') },
    { icon: FileText, title: t('stepFileTitle'), description: t('stepFileDesc') },
  ];

  const trustPoints = [
    { icon: Shield, title: t('trustAccurateTitle'), description: t('trustAccurateDesc') },
    { icon: Scale, title: t('trustTaxLawTitle'), description: t('trustTaxLawDesc', yearVars) },
    { icon: Lock, title: t('trustPrivacyTitle'), description: t('trustPrivacyDesc') },
    { icon: Zap, title: t('trustFastTitle'), description: t('trustFastDesc') },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <PageMeta titleKey="landingTitle" descriptionKey="landingDesc" descriptionVars={yearVars} />
      {/* Hero */}
      <section className="py-20 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
          <Trans i18nKey="landing:heroTitle" components={{ accent: <span className="text-accent dark:text-accent-light"> </span> }} />
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          {t('heroSubtitle', yearVars)}
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/calculator/" className="btn-primary text-lg px-8 py-3 flex items-center gap-2">
            {t('tryCalculator')} <ArrowRight className="w-5 h-5" />
          </Link>
          <Link to={primaryCtaLink} className="btn-secondary text-lg px-8 py-3 flex items-center gap-2">
            <FileText className="w-5 h-5" /> {primaryCtaLabel}
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <h2 className="text-2xl font-bold text-center mb-12">{t('howItWorks')}</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="card text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-accent/10 text-accent dark:text-accent-light mb-4">
                <step.icon className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-gray-600 dark:text-slate-400">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why InvesTax */}
      <section className="py-16">
        <h2 className="text-2xl font-bold text-center mb-12">{t('whyInvestax')}</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {trustPoints.map((point, i) => (
            <div key={i} className="card flex items-start gap-4">
              <div className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent/10 text-accent dark:text-accent-light">
                <point.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">{point.title}</h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">{point.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Guides: internal links into the /ghid content cluster (SEO + discovery) */}
      <section className="py-16">
        <h2 className="text-2xl font-bold text-center mb-3">{t('guidesTitle')}</h2>
        <p className="text-center text-gray-600 dark:text-slate-400 max-w-2xl mx-auto mb-10">
          {t('guidesSubtitle')}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GHID_LIST.map((g) => (
            <Link
              key={g.path}
              to={g.path}
              className="group flex items-start gap-3 p-4 border border-gray-200 dark:border-navy-700 rounded-xl hover:border-accent dark:hover:border-accent-light hover:bg-accent/5 dark:hover:bg-accent/10 transition-colors"
            >
              <FileText className="w-5 h-5 text-accent dark:text-accent-light shrink-0 mt-0.5" />
              <span className="text-sm font-medium group-hover:text-accent dark:group-hover:text-accent-light transition-colors">
                {g.title}
              </span>
            </Link>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link
            to="/ghid/"
            className="inline-flex items-center gap-1 text-accent dark:text-accent-light font-medium hover:underline"
          >
            {t('guidesSeeAll')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Testimonials placeholder */}
      <section className="py-16">
        <h2 className="text-2xl font-bold text-center mb-8">{t('testimonialsTitle')}</h2>
        <div className="card text-center py-12">
          <MessageSquareQuote className="w-10 h-10 text-gray-300 dark:text-slate-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-slate-400">{t('testimonialsPlaceholder')}</p>
        </div>
      </section>

      {/* Founder bio */}
      <section className="py-16">
        <div className="card flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="shrink-0 inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent dark:text-accent-light">
            <User className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">{t('founderTitle')}</h3>
            <p className="text-gray-600 dark:text-slate-400">{t('founderBio')}</p>
          </div>
        </div>
      </section>

      {/* Supported brokers */}
      <section className="py-16 text-center">
        <h2 className="text-2xl font-bold mb-8">{t('supportedBrokers')}</h2>
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-lg font-medium text-gray-500 dark:text-slate-400">
          <span className="px-6 py-3 card">Trading212</span>
          <span className="px-6 py-3 card inline-flex items-center gap-2">
            IBKR
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide">{t('beta')}</span>
          </span>
          <span className="px-6 py-3 card inline-flex items-center gap-2">
            Revolut
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide">{t('beta')}</span>
          </span>
        </div>
        <p className="mt-8 text-sm text-gray-600 dark:text-slate-400">
          {t('brokerCheckText')}{' '}
          <Link to="/verifica-extras" className="text-accent dark:text-accent-light font-medium underline hover:no-underline">
            {t('brokerCheckCta')}
          </Link>
        </p>
      </section>
    </div>
  );
}
