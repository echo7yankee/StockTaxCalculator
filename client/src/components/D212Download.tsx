import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown, ShieldCheck, AlertTriangle, Check } from 'lucide-react';
import {
  generateD212Xml,
  D212_SUPPORTED_TAX_YEAR,
  type TaxCalculationResult,
  type SecurityBreakdown,
  type D212Identity,
} from '@shared/index';
import FormField from './common/FormField';
import { analytics } from '../lib/analytics';
import {
  checkRequiredText,
  checkCnp,
  checkIban,
  checkPhone,
  normalizeIban,
  type D212FieldError,
} from '../utils/d212Identity';

interface Props {
  result: TaxCalculationResult;
  securities: SecurityBreakdown[];
  taxYear: number;
}

/** The five validated identity fields (the middle initial is optional). */
type FieldKey = 'nume_c' | 'prenume_c' | 'cif' | 'cont_bancar' | 'telefon_c';

const EMPTY_ERRORS: Record<FieldKey, D212FieldError | null> = {
  nume_c: null,
  prenume_c: null,
  cif: null,
  cont_bancar: null,
  telefon_c: null,
};

/** Triggers a browser download of `xml` as `fileName`, then revokes the object URL. */
function downloadXml(xml: string, fileName: string): void {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Identity-collection form + "Download D212 (.xml)" action.
 *
 * The generated Declaratia Unica XML (engine output -> ANAF v11) is the deepest
 * moat artifact, so this only renders on the already paid-gated ResultsPage and
 * only when the parse is clean (the caller hides it behind the #24A warning
 * hard-stop). The CNP/IBAN/name/phone collected here are used to fill the XML
 * ENTIRELY in the browser via {@link generateD212Xml}: nothing is sent to the
 * server or persisted. The generator fails loud on a statement it cannot
 * faithfully represent (a loss year, an unsupported source country, a breakdown
 * that does not reconcile); we catch that and tell the user to file manually
 * rather than hand them a wrong declaration.
 */
export default function D212Download({ result, securities, taxYear }: Props) {
  const { t } = useTranslation(['results', 'common']);
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState({
    nume_c: '',
    initiala_c: '',
    prenume_c: '',
    cif: '',
    cont_bancar: '',
    telefon_c: '',
  });
  const [errors, setErrors] = useState<Record<FieldKey, D212FieldError | null>>(EMPTY_ERRORS);
  const [genError, setGenError] = useState(false);
  const [done, setDone] = useState(false);

  // The generator is pinned to a single income year (its period + v11 constants
  // are 2025-specific). Offer the download only for that year; other years must
  // be filed manually until the generator is extended and re-validated.
  if (taxYear !== D212_SUPPORTED_TAX_YEAR) return null;

  const set = (key: keyof typeof fields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDone(false);
    setGenError(false);
  };

  const errorText = (code: D212FieldError | null, invalidKey: string): string | undefined => {
    if (!code) return undefined;
    return code === 'required' ? t('results:d212ErrRequired') : t(invalidKey);
  };

  const handleGenerate = () => {
    const nextErrors: Record<FieldKey, D212FieldError | null> = {
      nume_c: checkRequiredText(fields.nume_c),
      prenume_c: checkRequiredText(fields.prenume_c),
      cif: checkCnp(fields.cif),
      cont_bancar: checkIban(fields.cont_bancar),
      telefon_c: checkPhone(fields.telefon_c),
    };
    setErrors(nextErrors);
    setGenError(false);
    setDone(false);
    if (Object.values(nextErrors).some((e) => e !== null)) return;

    const identity: D212Identity = {
      nume_c: fields.nume_c.trim(),
      initiala_c: fields.initiala_c.trim(),
      prenume_c: fields.prenume_c.trim(),
      cif: fields.cif.trim(),
      cont_bancar: normalizeIban(fields.cont_bancar),
      telefon_c: fields.telefon_c.trim(),
    };

    let xml: string;
    try {
      xml = generateD212Xml(result, identity, securities);
    } catch {
      // Expected fail-loud path (loss year / unsupported country / non-reconciling
      // breakdown): not a bug to report, just a "file manually" case for the user.
      setGenError(true);
      return;
    }
    downloadXml(xml, `Declaratie-Unica-212-${taxYear}.xml`);
    analytics.d212Downloaded();
    setDone(true);
  };

  return (
    <div className="card mb-8" data-testid="d212-download">
      <div className="flex items-start gap-3">
        <FileDown className="w-5 h-5 text-accent dark:text-accent-light shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold mb-1">{t('results:d212Title')}</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">{t('results:d212Body')}</p>

          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn-primary inline-flex items-center gap-2"
              data-testid="d212-open"
            >
              <FileDown className="w-4 h-4" />
              {t('results:d212OpenCta')}
            </button>
          )}

          {open && (
            <div className="mt-2 space-y-4" data-testid="d212-form">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField id="d212-nume" label={t('results:d212FieldSurname')} error={errorText(errors.nume_c, '')} required>
                  {(p) => (
                    <input {...p} type="text" autoComplete="family-name" value={fields.nume_c}
                      onChange={(e) => set('nume_c', e.target.value)} />
                  )}
                </FormField>
                <FormField id="d212-prenume" label={t('results:d212FieldGivenName')} error={errorText(errors.prenume_c, '')} required>
                  {(p) => (
                    <input {...p} type="text" autoComplete="given-name" value={fields.prenume_c}
                      onChange={(e) => set('prenume_c', e.target.value)} />
                  )}
                </FormField>
                <FormField id="d212-initiala" label={t('results:d212FieldInitial')} hint={t('results:d212FieldInitialHint')}>
                  {(p) => (
                    <input {...p} type="text" autoComplete="additional-name" maxLength={5} value={fields.initiala_c}
                      onChange={(e) => set('initiala_c', e.target.value)} />
                  )}
                </FormField>
                <FormField id="d212-telefon" label={t('results:d212FieldPhone')} error={errorText(errors.telefon_c, 'results:d212ErrPhoneInvalid')} required>
                  {(p) => (
                    <input {...p} type="tel" inputMode="tel" autoComplete="tel" value={fields.telefon_c}
                      onChange={(e) => set('telefon_c', e.target.value)} />
                  )}
                </FormField>
                <FormField id="d212-cnp" label={t('results:d212FieldCnp')} error={errorText(errors.cif, 'results:d212ErrCnpInvalid')} hint={t('results:d212FieldCnpHint')} required>
                  {(p) => (
                    <input {...p} inputMode="numeric" autoComplete="off" maxLength={13} value={fields.cif}
                      onChange={(e) => set('cif', e.target.value)} />
                  )}
                </FormField>
                <FormField id="d212-iban" label={t('results:d212FieldIban')} error={errorText(errors.cont_bancar, 'results:d212ErrIbanInvalid')} hint={t('results:d212FieldIbanHint')} required>
                  {(p) => (
                    <input {...p} type="text" autoComplete="off" spellCheck={false} value={fields.cont_bancar}
                      onChange={(e) => set('cont_bancar', e.target.value)} />
                  )}
                </FormField>
              </div>

              <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-slate-400" data-testid="d212-privacy">
                <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                {t('results:d212PrivacyNote')}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="btn-primary inline-flex items-center gap-2"
                  data-testid="d212-submit"
                >
                  <FileDown className="w-4 h-4" />
                  {t('results:d212DownloadButton')}
                </button>
                {done && (
                  <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400" data-testid="d212-success" role="status">
                    <Check className="w-4 h-4" />
                    {t('results:d212Success')}
                  </span>
                )}
              </div>

              {genError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg" role="alert" data-testid="d212-gen-error">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600 dark:text-red-400">{t('results:d212GenerateError')}</p>
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-slate-400">{t('results:d212MethodologyNote')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
