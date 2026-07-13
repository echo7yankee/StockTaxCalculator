// Single source of truth for the per-country dividend withholding data rendered on
// /ghid/dividende-broker-strain (the table + the per-country detail section).
//
// Why this file exists: the country data drives both the summary table and the
// per-country deep-linkable detail blocks, so the two can never drift. Adding a
// country is a single entry here.
//
// TAX-FACT BOUNDARY: every rate below is a public RO tax claim. Changes must pass
// the tax-fact gate (>=2 reputable RO / treaty sources per claim) before shipping
// (see investax-docs 09-backlog-and-discipline.md item #22). The existing eight
// countries were verified in PR #88 / #89; expansion countries were verified by
// the ideation tax-fact gate in this PR.
//
// Scope: tax year 2025 (10% RO dividend tax, BNR annual-average conversion, foreign
// credit capped at the RO tax). Rates are display strings on purpose so each carries
// its own verified nuance (relief-at-source vs reclaim, ETF domicile effect).
//
// #13 PR C carry-forward: the "stillOwesRo" column + the 10% framing assume the 2025
// RO dividend tax. When the engine flips to the 2026 16% rate, this dataset is part of
// the year-coupled-copy sweep (treaty rates below 16% would then leave a residual RO
// liability that currently shows "0"). Update alongside the other ghid year copy.

export interface DividendCountry {
  /** Anchor slug for deep-linking, e.g. 'sua' -> id="dividende-sua". */
  id: string;
  /** Romanian country name as shown in the table + heading. */
  name: string;
  /** Standard non-resident dividend withholding rate (display string). */
  standardRate: string;
  /** Reduced rate via the RO treaty or a broker relief form (display string). */
  treatyRate: string;
  /** What the investor still owes in RO after the 10% credit cap (display string). */
  stillOwesRo: string;
  /** Concise RO practical note for the per-country detail block. */
  detail: string;
}

export const DIVIDEND_COUNTRIES: DividendCountry[] = [
  {
    id: 'sua',
    name: 'SUA',
    standardRate: '30%',
    treatyRate: '10% (cu W-8BEN)',
    stillOwesRo: '0 (credit complet)',
    detail:
      'Cea mai frecventă sursă de dividende pentru investitorii români. Cu formularul W-8BEN completat (Trading212 și Revolut îl gestionează automat la deschiderea contului), reținerea la sursă scade de la 30% la 10% conform tratatului dintre România și SUA. La 10% reținut, creditul fiscal acoperă integral impozitul român, deci nu mai ai nimic de plătit în RO, dar tot declari dividendul și treci creditul. Fără W-8BEN se reține 30%, iar creditul rămâne limitat la 10% din brut; diferența de 20% se pierde și nu se recuperează în România.',
  },
  {
    id: 'marea-britanie',
    name: 'Marea Britanie',
    standardRate: '0%',
    treatyRate: '0%',
    stillOwesRo: '10% pe brut',
    detail:
      'Marea Britanie nu reține impozit pe dividendele plătite către investitori non-rezidenți (0%). Pentru că nu ai nicio reținere străină de creditat, plătești integral cei 10% în România pe brutul dividendului.',
  },
  {
    id: 'irlanda',
    name: 'Irlanda (ETF-uri UCITS)',
    standardRate: '0% pentru non-rezidenți',
    treatyRate: '0%',
    stillOwesRo: '10% pe brut',
    detail:
      'Irlanda este domiciliul majorității ETF-urilor UCITS tranzacționate de investitorii europeni. Pentru dividendele distribuite către investitori non-irlandezi nu se reține impozit (0%), așa că plătești 10% în România pe distribuțiile primite. Atenție: ETF-urile de acumulare nu distribuie dividende, deci nu ai nimic de declarat la rubrica dividende pentru ele.',
  },
  {
    id: 'germania',
    name: 'Germania',
    standardRate: '26,375%',
    treatyRate: '15% (tratat)',
    stillOwesRo: '0 (credit complet)',
    detail:
      'Reținerea standard germană este 26,375% (Kapitalertragsteuer plus suprataxa de solidaritate). Prin tratatul cu România rata se reduce la 15%. În ambele cazuri reținerea depășește 10%, deci creditul fiscal acoperă integral impozitul român și nu mai plătești nimic în RO. Diferența reținută peste 10% nu se recuperează în România (eventual prin cerere de restituire la fiscul german).',
  },
  {
    id: 'olanda',
    name: 'Olanda',
    standardRate: '15%',
    treatyRate: '15%',
    stillOwesRo: '0 (credit complet)',
    detail:
      'Olanda reține 15% (dividendbelasting) pe dividendele plătite către non-rezidenți, exact cât prevede și tratatul cu România. Fiind peste 10%, creditul fiscal acoperă integral impozitul român, deci nu mai datorezi nimic în RO. Diferența de peste 10% nu se recuperează aici.',
  },
  {
    id: 'franta',
    name: 'Franța',
    standardRate: '25%',
    treatyRate: '10% (tratat)',
    stillOwesRo: '0 (credit complet)',
    detail:
      'Reținerea standard franceză este 25%, iar prin tratatul cu România se reduce la 10%. Dacă brokerul a aplicat rata de tratat (10%), creditul acoperă exact impozitul român și nu mai plătești nimic în RO. Dacă a reținut rata standard de 25%, creditul rămâne limitat la 10% din brut: nu datorezi nimic în RO, dar pierzi diferența dacă nu ceri recuperarea la fiscul francez.',
  },
  {
    id: 'spania',
    name: 'Spania',
    standardRate: '19%',
    treatyRate: '5% (tratat)',
    stillOwesRo: '0 la rata standard de 19%; 5% la rata de tratat',
    detail:
      'Brokerii aplică de regulă rata domestică spaniolă de 19% la sursă. Rata redusă de 5% din tratatul cu România se obține doar printr-o cerere de recuperare conform procedurii Hacienda. Cu 19% reținut, creditul fiscal este limitat la 10% din brut, deci nu mai plătești nimic în RO (dar pierzi diferența peste 10% dacă nu faci recuperarea). Dacă obții rata de tratat de 5%, vei datora diferența de 5% în România.',
  },
  {
    id: 'elvetia',
    name: 'Elveția',
    standardRate: '35%',
    treatyRate: '15% (tratat, cu cerere de recuperare a diferenței)',
    stillOwesRo: '0 (credit pe partea de 10%)',
    detail:
      'Elveția reține 35% la sursă, una dintre cele mai mari rate. Prin tratatul cu România rata se reduce la 15%, dar diferența până la 35% se obține doar printr-o cerere de recuperare la fiscul elvețian. Cu 35% reținut, creditul fiscal român este limitat la 10% din brut, deci nu mai plătești nimic în RO, însă pierzi o sumă importantă dacă nu recuperezi diferența până la rata de tratat.',
  },
  {
    id: 'danemarca',
    name: 'Danemarca',
    standardRate: '27%',
    treatyRate: '15% (tratat)',
    stillOwesRo: '0 (credit complet)',
    detail:
      'Danemarca reține 27% la sursă pe dividendele plătite persoanelor fizice non-rezidente (relevant mai ales pentru Novo Nordisk, foarte populară la investitorii români). Prin tratatul cu România rata este 15%. Brokerul reține de obicei 27%, deci creditul fiscal român este limitat la 10% din brut și nu mai plătești nimic în RO. Diferența peste 15% se poate recupera printr-o cerere la fiscul danez, dar procedura este lentă și de regulă nu merită pentru sume mici.',
  },
  {
    id: 'canada',
    name: 'Canada',
    standardRate: '25%',
    treatyRate: '15% (tratat)',
    stillOwesRo: '0 (credit complet)',
    detail:
      'Canada reține 25% standard pe dividendele către non-rezidenți, redus la 15% prin tratatul cu România. În ambele cazuri reținerea depășește 10%, deci creditul fiscal acoperă integral impozitul român și nu mai datorezi nimic în RO.',
  },
  {
    id: 'italia',
    name: 'Italia',
    standardRate: '26%',
    treatyRate: '5% (tratat)',
    stillOwesRo: '0 la rata standard de 26%; 5% la rata de tratat',
    detail:
      'Italia reține 26% la sursă. Rata din tratatul cu România este doar 5%, dar se obține printr-o cerere de recuperare; brokerul aplică de obicei cei 26%. Cu 26% reținut, creditul fiscal este limitat la 10% din brut, deci nu mai plătești nimic în RO. Atenție: dacă obții rata de tratat de 5%, vei datora diferența de 5% în România.',
  },
  {
    id: 'belgia',
    name: 'Belgia',
    standardRate: '30%',
    treatyRate: '15% (tratat)',
    stillOwesRo: '0 (credit complet)',
    detail:
      'Belgia reține 30% la sursă, redus la 15% prin tratatul cu România. Cu reținerea peste 10%, creditul fiscal acoperă integral impozitul român și nu mai plătești nimic în RO. Diferența peste 15% se recuperează separat, printr-o cerere la fiscul belgian.',
  },
  {
    id: 'norvegia',
    name: 'Norvegia',
    standardRate: '25%',
    treatyRate: '10% (tratat)',
    stillOwesRo: '0 (credit complet)',
    detail:
      'Norvegia reține 25% standard, redus la 10% prin tratatul cu România (5% pentru pachete mari de acțiuni, 10% pentru investitorul obișnuit). Oricare ar fi rata reținută, creditul fiscal acoperă impozitul român și nu mai datorezi nimic în RO.',
  },
  {
    id: 'japonia',
    name: 'Japonia',
    standardRate: '15,315% (acțiuni listate)',
    treatyRate: '10% (tratat)',
    stillOwesRo: '0 (credit complet)',
    detail:
      'Japonia reține 15,315% pe dividendele din acțiuni listate plătite persoanelor fizice non-rezidente (15% plus o suprataxă), redus la 10% prin tratatul cu România. Reținerea depășește 10%, deci creditul fiscal acoperă integral impozitul român și nu mai plătești nimic în RO.',
  },
  {
    id: 'finlanda',
    name: 'Finlanda',
    standardRate: '30%',
    treatyRate: '5% (tratat)',
    stillOwesRo: '0 la rata standard de 30%; 5% la rata de tratat',
    detail:
      'Finlanda reține 30% pe dividendele plătite persoanelor fizice non-rezidente. Rata din tratatul cu România este 5%, dar se obține prin cerere de recuperare; brokerul aplică de obicei cota mare. Cu 30% reținut, creditul fiscal este limitat la 10% din brut, deci nu mai plătești nimic în RO. Dacă obții rata de tratat de 5%, vei datora diferența de 5% în România.',
  },
  {
    id: 'austria',
    name: 'Austria',
    standardRate: '27,5%',
    treatyRate: '5% (tratat)',
    stillOwesRo: '0 la rata standard de 27,5%; 5% la rata de tratat',
    detail:
      'Austria reține 27,5% pe dividendele plătite persoanelor fizice. Rata din tratatul cu România este 5%, obținută prin cerere de recuperare; brokerul aplică de obicei cei 27,5%. Cu reținerea peste 10%, creditul fiscal este limitat la 10% din brut și nu mai plătești nimic în RO. Dacă obții rata de tratat de 5%, vei datora diferența de 5% în România.',
  },
];
