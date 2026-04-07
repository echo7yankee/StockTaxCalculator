import { Link } from 'react-router-dom';
import { Upload, Calculator, FileText, ArrowRight, Shield, Scale, Lock, Zap, MessageSquareQuote, User } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

export default function Landing() {
  const { t } = useTranslation('landing');

  const steps = [
    { icon: Upload, title: t('stepUploadTitle'), description: t('stepUploadDesc') },
    { icon: Calculator, title: t('stepCalculateTitle'), description: t('stepCalculateDesc') },
    { icon: FileText, title: t('stepFileTitle'), description: t('stepFileDesc') },
  ];

  const trustPoints = [
    { icon: Shield, title: t('trustAccurateTitle'), description: t('trustAccurateDesc') },
    { icon: Scale, title: t('trustTaxLawTitle'), description: t('trustTaxLawDesc') },
    { icon: Lock, title: t('trustPrivacyTitle'), description: t('trustPrivacyDesc') },
    { icon: Zap, title: t('trustFastTitle'), description: t('trustFastDesc') },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="py-20 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
          <Trans i18nKey="landing:heroTitle" components={{ accent: <span className="text-accent"> </span> }} />
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          {t('heroSubtitle')}
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/calculator" className="btn-primary text-lg px-8 py-3 flex items-center gap-2">
            {t('tryCalculator')} <ArrowRight className="w-5 h-5" />
          </Link>
          <Link to="/upload" className="btn-secondary text-lg px-8 py-3 flex items-center gap-2">
            <FileText className="w-5 h-5" /> {t('uploadPdf')}
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <h2 className="text-2xl font-bold text-center mb-12">{t('howItWorks')}</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="card text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-accent/10 text-accent mb-4">
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
              <div className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent/10 text-accent">
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

      {/* Testimonials placeholder */}
      <section className="py-16">
        <h2 className="text-2xl font-bold text-center mb-8">{t('testimonialsTitle')}</h2>
        <div className="card text-center py-12">
          <MessageSquareQuote className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-slate-500">{t('testimonialsPlaceholder')}</p>
        </div>
      </section>

      {/* Founder bio */}
      <section className="py-16">
        <div className="card flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="shrink-0 inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent">
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
          <span className="px-6 py-3 card opacity-60">Revolut ({t('comingSoon')})</span>
          <span className="px-6 py-3 card opacity-60">IBKR ({t('comingSoon')})</span>
        </div>
      </section>
    </div>
  );
}
