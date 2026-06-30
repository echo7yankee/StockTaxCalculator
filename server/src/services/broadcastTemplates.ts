import type { SubscribeTopic } from '../lib/subscribeTopics.js';
import { renderSubscribeShellHtml } from './email.js';

type Language = 'ro' | 'en';

export interface RenderedBroadcast {
  html: string;
  text: string;
}

// A broadcast is a committed, reviewed artifact: adding one means a PR, which
// is the audit trail and the review gate for its copy. Any template that makes
// a Romanian tax claim (a rate, a deadline, a bracket) must clear the backlog
// #22 tax-fact verification gate before it ships. Content must stay relevant
// to the topics it declares; the broadcast CLI refuses topic/template
// mismatches, so `topics` is the consent boundary.
export interface BroadcastTemplate {
  name: string;
  description: string;
  topics: readonly SubscribeTopic[];
  subject: Record<Language, string>;
  render: (language: Language, unsubscribeUrl: string) => RenderedBroadcast;
}

const SITE = 'https://investax.app';
const GUIDE_NOTIFICARE = `${SITE}/ghid/notificare-anaf-venituri-strainatate/`;
const GUIDE_IBKR = `${SITE}/ghid/declaratie-unica-ibkr/`;
const GUIDE_REVOLUT = `${SITE}/ghid/declaratie-unica-revolut/`;
const CONTACT = `${SITE}/contact`;
const CHECKER = `${SITE}/verifica-extras`;

function unsubFooterHtml(language: Language, unsubscribeUrl: string): string {
  const why =
    language === 'ro'
      ? 'Primești acest email pentru că te-ai abonat pe investax.app.'
      : 'You are receiving this email because you subscribed at investax.app.';
  const unsub = language === 'ro' ? 'Te poți dezabona oricând:' : 'You can unsubscribe at any time:';
  return `
      <p style="margin:24px 0 8px;font-size:13px;color:#6b7280;">${why} ${unsub}</p>
      <p style="margin:0;font-size:13px;word-break:break-all;color:#374151;"><a href="${unsubscribeUrl}" style="color:#2563eb;">${unsubscribeUrl}</a></p>`;
}

function unsubFooterText(language: Language, unsubscribeUrl: string): string {
  return language === 'ro'
    ? `Primești acest email pentru că te-ai abonat pe investax.app. Te poți dezabona oricând: ${unsubscribeUrl}`
    : `You are receiving this email because you subscribed at investax.app. You can unsubscribe at any time: ${unsubscribeUrl}`;
}

const productUpdate202606: BroadcastTemplate = {
  name: 'product-update-2026-06',
  description:
    'June 2026 product update: IBKR + Revolut beta imports and the anonymized-sample ask, the new notificare ANAF guide, prior years (2023/2024) now computing automatically. No tax rates or deadlines stated.',
  topics: ['filing_reminder', 'broker_revolut', 'broker_ibkr', 'prior_years'],
  subject: {
    ro: 'Noutăți InvesTax: import IBKR și Revolut în beta, plus un ghid nou',
    en: 'InvesTax news: IBKR and Revolut imports in beta, plus a new guide',
  },
  render(language, unsubscribeUrl) {
    if (language === 'ro') {
      const heading = 'Pe scurt, ce e nou în InvesTax';
      const bodyHtml = `
      <p style="margin:0 0 16px;line-height:1.5;"><strong>Import IBKR și Revolut (beta).</strong> Pe lângă Trading 212, poți încărca acum un Activity Statement CSV de la <a href="${GUIDE_IBKR}" style="color:#2563eb;">Interactive Brokers</a> sau un Account Statement (.xlsx) de la <a href="${GUIDE_REVOLUT}" style="color:#2563eb;">Revolut</a>. Fiind în beta, rezultatele vin cu avertismente clare dacă extrasul conține ceva ce nu recunoaștem. Ca să scoatem parserele din beta avem nevoie de extrase reale anonimizate: dacă ne trimiți unul prin <a href="${CONTACT}" style="color:#2563eb;">pagina de contact</a>, primești acces complet gratuit.</p>
      <p style="margin:0 0 16px;line-height:1.5;"><strong>Ghid nou: notificările ANAF pentru venituri din străinătate.</strong> Ce înseamnă o notificare de conformare, ce termen ai la dispoziție și cum se regularizează anii trecuți. <a href="${GUIDE_NOTIFICARE}" style="color:#2563eb;">Citește ghidul</a>.</p>
      <p style="margin:0 0 16px;line-height:1.5;"><strong>Anii fiscali 2023 și 2024 se calculează acum automat.</strong> Regulile pentru anii trecuți erau deja codificate în aplicație, iar acum calculul automat este activ: încarci extrasul pentru 2023 sau 2024 și primești numerele, la fel ca pentru 2025. Îți poți <a href="${CHECKER}" style="color:#2563eb;">verifica extrasul gratuit</a> înainte să plătești.</p>${unsubFooterHtml('ro', unsubscribeUrl)}`;
      const text = `Pe scurt, ce e nou în InvesTax

Import IBKR și Revolut (beta). Pe lângă Trading 212, poți încărca acum un Activity Statement CSV de la Interactive Brokers sau un Account Statement (.xlsx) de la Revolut. Fiind în beta, rezultatele vin cu avertismente clare dacă extrasul conține ceva ce nu recunoaștem. Ca să scoatem parserele din beta avem nevoie de extrase reale anonimizate: dacă ne trimiți unul prin pagina de contact (${CONTACT}), primești acces complet gratuit.
Ghid IBKR: ${GUIDE_IBKR}
Ghid Revolut: ${GUIDE_REVOLUT}

Ghid nou: notificările ANAF pentru venituri din străinătate. Ce înseamnă o notificare de conformare, ce termen ai la dispoziție și cum se regularizează anii trecuți: ${GUIDE_NOTIFICARE}

Anii fiscali 2023 și 2024 se calculează acum automat. Regulile pentru anii trecuți erau deja codificate în aplicație, iar acum calculul automat este activ: încarci extrasul pentru 2023 sau 2024 și primești numerele, la fel ca pentru 2025. Îți poți verifica extrasul gratuit înainte să plătești: ${CHECKER}

${unsubFooterText('ro', unsubscribeUrl)}

InvesTax · investax.app`;
      return { html: renderSubscribeShellHtml('ro', heading, bodyHtml), text };
    }

    const heading = "What's new at InvesTax, in short";
    const bodyHtml = `
      <p style="margin:0 0 16px;line-height:1.5;"><strong>IBKR and Revolut imports (beta).</strong> Besides Trading 212, you can now upload an Activity Statement CSV from <a href="${GUIDE_IBKR}" style="color:#2563eb;">Interactive Brokers</a> or an Account Statement (.xlsx) from <a href="${GUIDE_REVOLUT}" style="color:#2563eb;">Revolut</a>. While in beta, results carry clear warnings whenever a statement contains something we do not recognize. To take the parsers out of beta we need real anonymized statements: send one through the <a href="${CONTACT}" style="color:#2563eb;">contact page</a> and you get full access for free.</p>
      <p style="margin:0 0 16px;line-height:1.5;"><strong>New guide: ANAF notifications about foreign income.</strong> What a compliance notification means, how long you have to respond, and how past years get regularized. <a href="${GUIDE_NOTIFICARE}" style="color:#2563eb;">Read the guide</a> (Romanian).</p>
      <p style="margin:0 0 16px;line-height:1.5;"><strong>Tax years 2023 and 2024 now compute automatically.</strong> The rules for past years were already encoded in the app, and automatic computation is now live: upload a 2023 or 2024 statement and you get the numbers, just like 2025. You can <a href="${CHECKER}" style="color:#2563eb;">check your statement for free</a> before paying.</p>${unsubFooterHtml('en', unsubscribeUrl)}`;
    const text = `What's new at InvesTax, in short

IBKR and Revolut imports (beta). Besides Trading 212, you can now upload an Activity Statement CSV from Interactive Brokers or an Account Statement (.xlsx) from Revolut. While in beta, results carry clear warnings whenever a statement contains something we do not recognize. To take the parsers out of beta we need real anonymized statements: send one through the contact page (${CONTACT}) and you get full access for free.
IBKR guide: ${GUIDE_IBKR}
Revolut guide: ${GUIDE_REVOLUT}

New guide: ANAF notifications about foreign income (Romanian). What a compliance notification means, how long you have to respond, and how past years get regularized: ${GUIDE_NOTIFICARE}

Tax years 2023 and 2024 now compute automatically. The rules for past years were already encoded in the app, and automatic computation is now live: upload a 2023 or 2024 statement and you get the numbers, just like 2025. You can check your statement for free before paying: ${CHECKER}

${unsubFooterText('en', unsubscribeUrl)}

InvesTax · investax.app`;
    return { html: renderSubscribeShellHtml('en', heading, bodyHtml), text };
  },
};

export const BROADCAST_TEMPLATES: readonly BroadcastTemplate[] = [productUpdate202606];

export function getBroadcastTemplate(name: string): BroadcastTemplate | undefined {
  return BROADCAST_TEMPLATES.find((t) => t.name === name);
}
