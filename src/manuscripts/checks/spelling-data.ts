/**
 * British and American spelling pairs, grouped into families so that
 * "behaviour", "behavioural" and "behaviours" count as one choice.
 *
 * Curated, not a blind rule: -ise/-ize is limited to a known stem list
 * (advertise, comprise, size and prize are the same everywhere), and words
 * whose "American" form is also correct British in some sense (program for
 * software, license as a verb, judgment in law, meter as a device) are
 * either excluded or handled with a context test.
 */

export type Variety = "gb" | "us";

export type SpellFamily = {
  id: string;
  head: { gb: string; us: string };
  /** Aligned forms: [British, American]. */
  pairs: [string, string][];
  /** -ise/-ize families are one choice for the whole manuscript. */
  pool?: "ise";
  /** Counts towards the manuscript's overall British/American majority. */
  overall: boolean;
  /** American form only counts in this context (see spelling.ts). */
  context?: "computing" | "noun";
};

const families: SpellFamily[] = [];

function add(
  id: string,
  pairs: [string, string][],
  opts: { pool?: "ise"; overall?: boolean; context?: "computing" | "noun" } = {},
) {
  const first = pairs[0]!;
  const fam: SpellFamily = {
    id,
    head: { gb: first[0], us: first[1] },
    pairs,
    overall: opts.overall ?? true,
  };
  if (opts.pool) fam.pool = opts.pool;
  if (opts.context) fam.context = opts.context;
  families.push(fam);
}

/* -our / -or */
const OUR_SUFFIXES: [string, string][] = [
  ["our", "or"],
  ["ours", "ors"],
  ["oured", "ored"],
  ["ouring", "oring"],
  ["ourful", "orful"],
  ["ourable", "orable"],
  ["ourably", "orably"],
  ["ourite", "orite"],
  ["ourites", "orites"],
  ["ouritism", "oritism"],
  ["ourless", "orless"],
  ["ourer", "orer"],
  ["ourers", "orers"],
  ["ourhood", "orhood"],
  ["ourhoods", "orhoods"],
  ["ourly", "orly"],
  ["oural", "oral"],
  ["ourally", "orally"],
  ["oury", "ory"],
];
for (const stem of [
  "col",
  "fav",
  "hon",
  "lab",
  "behavi",
  "neighb",
  "rum",
  "hum",
  "harb",
  "endeav",
  "vap",
  "sav",
  "flav",
  "parl",
  "arm",
  "val",
  "vig",
  "rig",
  "clam",
  "splend",
  "savi",
  "od",
  "ferv",
  "cand",
  "demean",
  "tum",
]) {
  const pairs = OUR_SUFFIXES.map(([g, u]) => [stem + g, stem + u] as [string, string]).filter(
    // American forms that are other words in their own right.
    ([, u]) => !["humoral", "tumoral"].includes(u),
  );
  add(`our:${stem}`, pairs);
}

/* -re / -er */
for (const stem of [
  "cent",
  "epicent",
  "theat",
  "fib",
  "lit",
  "calib",
  "somb",
  "spect",
  "lust",
  "sab",
  "meag",
  "kilomet",
  "centimet",
  "millimet",
]) {
  const pairs: [string, string][] = [
    [`${stem}re`, `${stem}er`],
    [`${stem}res`, `${stem}ers`],
  ];
  if (stem === "cent")
    pairs.push(
      ["centred", "centered"],
      ["centring", "centering"],
    );
  add(`re:${stem}`, pairs);
}

/* -ce / -se */
add("defence", [
  ["defence", "defense"],
  ["defences", "defenses"],
  ["defenceless", "defenseless"],
]);
add("offence", [
  ["offence", "offense"],
  ["offences", "offenses"],
]);
add("pretence", [
  ["pretence", "pretense"],
  ["pretences", "pretenses"],
]);
add(
  "licence",
  [
    ["licence", "license"],
    ["licences", "licenses"],
  ],
  { context: "noun" },
);

/* -yse / -yze ("analyses" is also the plural of analysis, so not counted) */
for (const stem of ["analy", "paraly", "cataly", "breathaly", "dialy"])
  add(`yse:${stem}`, [
    [`${stem}se`, `${stem}ze`],
    [`${stem}sed`, `${stem}zed`],
    [`${stem}sing`, `${stem}zing`],
    [`${stem}ser`, `${stem}zer`],
    [`${stem}sers`, `${stem}zers`],
  ]);

/* -ise / -ize, limited to stems that take either ending */
const ISE_SUFFIXES: [string, string][] = [
  ["ise", "ize"],
  ["ises", "izes"],
  ["ised", "ized"],
  ["ising", "izing"],
  ["isation", "ization"],
  ["isations", "izations"],
  ["iser", "izer"],
  ["isers", "izers"],
  ["isable", "izable"],
];
for (const stem of (
  "organ recogn real emphas minim maxim priorit characteris summar critic apolog author capital " +
  "categor central decentral civil colon commercial criminal decriminal democrat digital econom " +
  "energ final formal general global harmon hospital ideal industrial institutional international " +
  "legal legitim liberal local marginal mobil modern monet national neutral normal operational optim " +
  "polar popular privat public rational regular sanit scrutin social special stabil standard " +
  "stigmat subsid symbol synchron systemat theor urban util visual conceptual contextual familiar " +
  "fertil hypothes jeopard memor mechan natural sensit steril terror trivial vandal victim western " +
  "item securit crystall computer patron agon antagon personal digit incentiv strateg " +
  "catalog colonial dramat emotional epitom fantas fossil galvan harmon human immun individual " +
  "intern ion lion magnet margin miniatur moral motor nominal notar ostrac pasteur penal plagiar " +
  "politic proselyt radical random reorgan revital romantic satir sensational serial sermon " +
  "solemn tantal tranquil unrecogn vocal vulgar internal external revolution sympath union bureaucrat commodit"
)
  .split(/\s+/)
  .filter((s, i, all) => s && all.indexOf(s) === i && !s.endsWith("is"))) {
  const pairs = ISE_SUFFIXES.map(([g, u]) => [stem + g, stem + u] as [string, string]);
  add(`ise:${stem}`, pairs, { pool: "ise", overall: false });
}
// "characterise" has a stem ending in -is, so it is listed on its own.
add(
  "ise:characteris",
  ISE_SUFFIXES.map(([g, u]) => [`character${g}`, `character${u}`] as [string, string]),
  { pool: "ise", overall: false },
);

/* doubled -ll- before a suffix */
for (const stem of [
  "travel",
  "model",
  "label",
  "cancel",
  "signal",
  "fuel",
  "level",
  "channel",
  "counsel",
  "total",
  "equal",
  "dial",
  "duel",
  "quarrel",
  "shovel",
  "tunnel",
  "rival",
  "pedal",
  "marshal",
  "funnel",
  "grovel",
  "revel",
  "snorkel",
  "unravel",
]) {
  const pairs: [string, string][] = [
    [`${stem}led`, `${stem}ed`],
    [`${stem}ling`, `${stem}ing`],
    [`${stem}ler`, `${stem}er`],
    [`${stem}lers`, `${stem}ers`],
  ];
  if (stem === "counsel")
    pairs.push(
      ["counsellor", "counselor"],
      ["counsellors", "counselors"],
    );
  // "equaler", "totaler" etc. are not words either way; harmless.
  add(`ll:${stem}`, pairs);
}
add("marvellous", [
  ["marvellous", "marvelous"],
  ["marvellously", "marvelously"],
]);
add("jewellery", [["jewellery", "jewelry"]]);
add("woollen", [
  ["woollen", "woolen"],
  ["woollens", "woolens"],
]);

/* single -l- where American doubles it */
add("enrol", [
  ["enrol", "enroll"],
  ["enrols", "enrolls"],
  ["enrolment", "enrollment"],
  ["enrolments", "enrollments"],
]);
add("fulfil", [
  ["fulfil", "fulfill"],
  ["fulfils", "fulfills"],
  ["fulfilment", "fulfillment"],
]);
add("instalment", [
  ["instalment", "installment"],
  ["instalments", "installments"],
]);
add("skilful", [
  ["skilful", "skillful"],
  ["skilfully", "skillfully"],
]);
add("wilful", [
  ["wilful", "willful"],
  ["wilfully", "willfully"],
]);
add("distil", [
  ["distil", "distill"],
  ["distils", "distills"],
]);
add("instil", [
  ["instil", "instill"],
  ["instils", "instills"],
]);

/* ae / oe */
for (const [g, u] of [
  ["paediatric", "pediatric"],
  ["paediatrician", "pediatrician"],
  ["anaemia", "anemia"],
  ["anaemic", "anemic"],
  ["anaesthetic", "anesthetic"],
  ["anaesthesia", "anesthesia"],
  ["haemorrhage", "hemorrhage"],
  ["haematology", "hematology"],
  ["haemoglobin", "hemoglobin"],
  ["orthopaedic", "orthopedic"],
  ["encyclopaedia", "encyclopedia"],
  ["oestrogen", "estrogen"],
  ["diarrhoea", "diarrhea"],
  ["oesophagus", "esophagus"],
  ["leukaemia", "leukemia"],
  ["foetus", "fetus"],
  ["foetal", "fetal"],
  ["gynaecology", "gynecology"],
  ["caesarean", "cesarean"],
  ["palaeontology", "paleontology"],
] as [string, string][])
  add(g, [
    [g, u],
    [`${g}s`, `${u}s`],
  ]);

/* the rest */
add("grey", [
  ["grey", "gray"],
  ["greyer", "grayer"],
  ["greying", "graying"],
]);
add("aluminium", [["aluminium", "aluminum"]]);
add("plough", [
  ["plough", "plow"],
  ["ploughs", "plows"],
  ["ploughed", "plowed"],
  ["ploughing", "plowing"],
]);
add("sceptic", [
  ["sceptical", "skeptical"],
  ["sceptic", "skeptic"],
  ["sceptics", "skeptics"],
  ["scepticism", "skepticism"],
  ["sceptically", "skeptically"],
]);
add("mould", [
  ["mould", "mold"],
  ["moulds", "molds"],
  ["moulded", "molded"],
  ["moulding", "molding"],
  ["mouldy", "moldy"],
]);
add("smoulder", [
  ["smoulder", "smolder"],
  ["smouldering", "smoldering"],
]);
add("ageing", [["ageing", "aging"]]);
add("acknowledgement", [
  ["acknowledgement", "acknowledgment"],
  ["acknowledgements", "acknowledgments"],
]);
add("catalogue", [
  ["catalogue", "catalog"],
  ["catalogues", "catalogs"],
  ["catalogued", "cataloged"],
  ["cataloguing", "cataloging"],
]);
add("cosy", [["cosy", "cozy"]]);
add("moustache", [["moustache", "mustache"]]);
add("sulphur", [
  ["sulphur", "sulfur"],
  ["sulphuric", "sulfuric"],
]);
add("doughnut", [["doughnut", "donut"]]);
add("likeable", [["likeable", "likable"]]);
add("sizeable", [["sizeable", "sizable"]]);
add("artefact", [
  ["artefact", "artifact"],
  ["artefacts", "artifacts"],
]);
add("manoeuvre", [
  ["manoeuvre", "maneuver"],
  ["manoeuvres", "maneuvers"],
  ["manoeuvred", "maneuvered"],
  ["manoeuvring", "maneuvering"],
  ["manoeuvrable", "maneuverable"],
]);
add("pyjamas", [["pyjamas", "pajamas"]]);
add("aeroplane", [
  ["aeroplane", "airplane"],
  ["aeroplanes", "airplanes"],
]);
add("practise", [
  ["practised", "practiced"],
  ["practising", "practicing"],
]);
add(
  "programme",
  [
    ["programme", "program"],
    ["programmes", "programs"],
  ],
  { overall: false, context: "computing" },
);
// Both are correct British; in law "judgment" is the court's decision. Its own choice.
add(
  "judgement",
  [
    ["judgement", "judgment"],
    ["judgements", "judgments"],
  ],
  { overall: false },
);

export const SPELL_FAMILIES: readonly SpellFamily[] = families;

export type SpellHit = { fam: SpellFamily; variety: Variety; index: number };

/** Every form of every family, lower case, to its family, variety and pair index. */
export const SPELL_LOOKUP: ReadonlyMap<string, SpellHit> = (() => {
  const m = new Map<string, SpellHit>();
  for (const fam of families)
    fam.pairs.forEach(([g, u], index) => {
      if (g === u) return;
      if (!m.has(g)) m.set(g, { fam, variety: "gb", index });
      if (!m.has(u)) m.set(u, { fam, variety: "us", index });
    });
  return m;
})();

/** The key a family is decided under: pooled families share one. */
export const familyKey = (fam: SpellFamily): string => fam.pool ?? fam.id;

/** Whether a spelling rule is one the family-aware spelling check applies. */
export function spellingRuleKind(rule: {
  preferred: string;
  variants: string[];
}): { kind: "variety"; variety: Variety } | { kind: "ise"; variety: Variety } | { kind: "family" } | null {
  const p = rule.preferred.trim().toLowerCase();
  if (/^british(\s+(english\s+)?spelling)?$/.test(p) || /^uk spelling$/.test(p))
    return { kind: "variety", variety: "gb" };
  if (/^american(\s+(english\s+)?spelling)?$/.test(p) || /^us spelling$/.test(p))
    return { kind: "variety", variety: "us" };
  if (/^-?ise( endings)?$/.test(p)) return { kind: "ise", variety: "gb" };
  if (/^-?ize( endings)?$/.test(p)) return { kind: "ise", variety: "us" };
  const forms = [rule.preferred, ...rule.variants].map((f) => f.trim().toLowerCase());
  if (forms.some((f) => SPELL_LOOKUP.has(f))) return { kind: "family" };
  return null;
}
