/**
 * What Scripta knows about each corporate instrument it drafts.
 *
 * The questions are the ones a lawyer would be asked by a colleague who knew
 * the area: what is being approved, by which company, under what law, and who
 * signs. Nothing is asked that the document does not need, and later questions
 * appear only when earlier answers call for them.
 *
 * The guidance on each section is drafting guidance, not a description of the
 * section. It says what makes the wording right and what commonly goes wrong.
 */
import type { Blueprint, SectionSpec, SetupStep } from "./blueprint";
import { answer, answerList } from "./blueprint";
import { houseLongDate, houseOpening, housePunctuation } from "./house";
import { HOUSE_LETTER } from "@/lib/house-style";

const DATE_HELP = "The date the document takes effect. Leave blank to fill in on execution.";

/** Every corporate instrument is made by a company under some law. */
const companyStep = (noun: string): SetupStep => ({
  id: "company",
  title: "The company",
  intro: `Who is ${noun}, and under what law.`,
  fields: [
    {
      key: "companyName",
      label: "Company name",
      kind: "text",
      required: true,
      placeholder: "Goldenmark Ghana Limited",
      help: "Exactly as registered, including the suffix. It is used in the heading and throughout.",
    },
    {
      key: "registeredOffice",
      label: "Registered office",
      kind: "textarea",
      placeholder: "12 Independence Avenue, Accra, Ghana",
      help: "Where the company is registered, not where the meeting was held.",
    },
    {
      key: "companyNumber",
      label: "Company number",
      kind: "text",
      placeholder: "CS123456789",
      help: "Optional, but it removes any doubt about which company resolved.",
    },
    {
      key: "jurisdiction",
      label: "Jurisdiction",
      kind: "text",
      required: true,
      placeholder: "Ghana",
      help: "The law the company is incorporated under. It governs what the directors may do and how.",
    },
  ],
});

const matterStep = (
  question: string,
  help: string,
  placeholder = "Opening a US dollar account with Stanbic Bank and appointing its signatories",
): SetupStep => ({
  id: "matter",
  title: "What is being decided",
  fields: [
    {
      key: "subject",
      label: question,
      kind: "textarea",
      required: true,
      help,
      placeholder,
    },
    {
      key: "background",
      label: "Background the document should recite",
      kind: "list",
      help: "One fact per line. Recitals explain why the decision is being taken; they do not decide anything.",
      placeholder:
        "The company has agreed to supply gold to Kessler AG\nA dollar account is needed to receive payment",
    },
  ],
});

const authorityStep: SetupStep = {
  id: "authority",
  title: "Authority to act",
  fields: [
    {
      key: "grantsAuthority",
      label: "Does anyone need authority to act on this?",
      kind: "choice",
      required: true,
      options: [
        { value: "yes", label: "Yes, someone is authorised to sign or act" },
        { value: "no", label: "No, the decision stands on its own" },
      ],
      help: "An authority clause is what lets a named person bind the company afterwards.",
    },
    {
      key: "authorisedPerson",
      label: "Who is authorised",
      kind: "text",
      required: true,
      when: (a) => answer(a, "grantsAuthority") === "yes",
      placeholder: "Any one director",
      help: "Name the person or the office. 'Any director' and 'the Managing Director' are different powers.",
    },
    {
      key: "authorityScope",
      label: "What they may do",
      kind: "textarea",
      required: true,
      when: (a) => answer(a, "grantsAuthority") === "yes",
      placeholder:
        "Execute the account opening documentation and any ancillary documents, and do everything necessary to give effect to these resolutions",
      help: "Scope is the whole point. Authority to 'do all things necessary' with no subject matter is not authority.",
    },
  ],
};

const signatureStep = (label: string, help: string): SetupStep => ({
  id: "execution",
  title: "Execution",
  fields: [
    {
      key: "signatories",
      label,
      kind: "list",
      required: true,
      help,
      placeholder: "Dominik Kleemann\nAkosua Mensah",
    },
    { key: "date", label: "Date", kind: "date", help: DATE_HELP },
  ],
});

const recitalSections = (a: Answers) =>
  answerList(a, "background").map((fact, index) => ({
    group: "recital" as const,
    title: `Background ${index + 1}`,
    guide:
      "A recital states a fact the decision rests on. Keep it to one fact, in the present or past tense, and never put an operative provision here.",
    placeholder: "One fact the decision rests on.",
    seed: fact,
  }));

type Answers = Record<string, string | string[]>;

const companySection = (a: Answers, organ: "directors" | "members" | "meeting") => ({
  group: "company" as const,
  title: "The company",
  guide:
    "The operative sentence that opens the document: the company in capitals, its registered office, and that its board has adopted what follows. Everything after this is about this company and no other.",
  placeholder: "The company, its registered office, and what its board has adopted.",
  seed:
    organ === "meeting"
      ? [
          answer(a, "companyName").toUpperCase() || "[company name]",
          answer(a, "registeredOffice")
            ? `having its registered office at ${answer(a, "registeredOffice")}`
            : "",
        ]
          .filter(Boolean)
          .join(", ")
          .concat(". A meeting of the directors was held as recorded below.")
      : houseOpening({
          companyName: answer(a, "companyName"),
          registeredOffice: answer(a, "registeredOffice"),
          organ,
        }),
});

/** A sentence without the mark it ended on, so the house mark can go on instead. */
const unpunctuated = (text: string) => text.trim().replace(/(;\s*and|[;.,:])\s*$/i, "");

/**
 * An office runs on in lower case inside the sentence — "any director be
 * authorised" — where a person's name keeps its capital.
 */
const inSentence = (who: string) =>
  /^(any|the|each|all|every|a|an)\b/i.test(who) ? who.charAt(0).toLowerCase() + who.slice(1) : who;

/**
 * The authority as the signed resolution words it: "any director or the
 * company secretary be authorised to do …", closed with a full stop because
 * it is the last resolution in the run.
 */
const authoritySections = (a: Answers) =>
  answer(a, "grantsAuthority") === "yes"
    ? [
        {
          group: "authority" as const,
          title: "Authority",
          guide:
            "Name the person or office authorised and say exactly what they may do. If they may execute documents, say which documents. Authority that does not name its subject matter authorises nothing.",
          placeholder: "Who is authorised, and precisely what they may do.",
          seed: [
            answer(a, "authorisedPerson") ? inSentence(answer(a, "authorisedPerson")) : "",
            "be authorised to",
            unpunctuated(answer(a, "authorityScope")),
          ]
            .filter(Boolean)
            .join(" ")
            .concat(housePunctuation(1, 2)),
        },
      ]
    : [];

/**
 * The first resolution of a written board resolution, in the standard's own
 * form: "the Company be authorised to engage …", ending "; and" when an
 * authority follows it and a full stop when it is the last. A lawyer who
 * already wrote it as a resolution — "the Company …", "that …" — keeps their
 * words; only the closing mark is set.
 */
const boardResolutionSeed = (a: Answers) => {
  const subject = unpunctuated(answer(a, "subject"));
  if (!subject) return "";
  const worded = /^(the|that)\b/i.test(subject)
    ? subject.charAt(0).toLowerCase() + subject.slice(1)
    : `the Company be authorised to ${subject.charAt(0).toLowerCase()}${subject.slice(1)}`;
  const total = answer(a, "grantsAuthority") === "yes" ? 2 : 1;
  return worded + housePunctuation(0, total);
};

/* ---------------------------------------------- written board resolution */

export const boardWrittenResolution: Blueprint = {
  kind: "board_written_resolution",
  title: (a) =>
    `Written board resolution — ${answer(a, "subject").split("\n")[0]?.slice(0, 60) || "untitled"}`,
  steps: [
    companyStep("resolving"),
    matterStep(
      "What are the directors approving?",
      "Say what is being approved, not why, as the words that follow “the Company be authorised to”. This becomes the first resolution.",
      "open a US dollar account with Stanbic Bank and appoint its signatories",
    ),
    authorityStep,
    signatureStep(
      "Which directors are signing?",
      "A written resolution is signed by the directors entitled to vote. One name per line.",
    ),
  ],
  particulars: (a) => ({
    companyName: answer(a, "companyName"),
    registeredOffice: answer(a, "registeredOffice"),
    companyNumber: answer(a, "companyNumber"),
    jurisdiction: answer(a, "jurisdiction"),
    date: answer(a, "date"),
  }),
  signatories: (a) => answerList(a, "signatories"),
  sections: (a) => [
    companySection(a, "directors"),
    ...recitalSections(a),
    {
      group: "resolution",
      title: "Resolution",
      guide:
        "State precisely what the board is approving, as a resolution: 'IT IS RESOLVED THAT…'. One decision per resolution. If a figure, a counterparty or a document is being approved, name it here rather than referring to it loosely.",
      placeholder: "What is resolved.",
      seed: boardResolutionSeed(a),
    },
    ...authoritySections(a),
    {
      group: "execution",
      title: "Execution",
      guide:
        "A written resolution takes effect when signed by the required majority. Say so, and leave a signature block for each director.",
      placeholder: "How and when the resolution takes effect.",
      seed: "These resolutions may be signed in counterparts, and take effect on the date the last director signs.",
    },
  ],
};

/* -------------------------------------------------- board meeting minutes */

export const boardMinutes: Blueprint = {
  kind: "board_minutes",
  title: (a) => `Board minutes — ${answer(a, "meetingDate") || "undated"}`,
  steps: [
    companyStep("meeting"),
    {
      id: "meeting",
      title: "The meeting",
      fields: [
        { key: "meetingDate", label: "Date of the meeting", kind: "date", required: true },
        {
          key: "meetingPlace",
          label: "Where it was held",
          kind: "text",
          placeholder: "The registered office, or by video conference",
          help: "Minutes record a meeting that happened. Say where, or how it was held remotely.",
        },
        {
          key: "chair",
          label: "Who chaired",
          kind: "text",
          required: true,
          help: "The chair is who the minutes are signed by, unless the board decides otherwise.",
        },
        {
          key: "present",
          label: "Present",
          kind: "list",
          required: true,
          help: "One name per line. Quorum is judged on this list, so it must be accurate.",
        },
        {
          key: "apologies",
          label: "Apologies",
          kind: "list",
          help: "Directors who did not attend. Optional, but it shows the board was properly convened.",
        },
        {
          key: "quorum",
          label: "Was a quorum present?",
          kind: "choice",
          required: true,
          options: [
            { value: "yes", label: "Yes, a quorum was present" },
            { value: "no", label: "No — the meeting could not transact business" },
          ],
          help: "Without a quorum nothing resolved at the meeting is valid.",
        },
      ],
    },
    matterStep(
      "What did the board consider?",
      "What was on the table. The minutes record the consideration as well as the decision.",
    ),
    authorityStep,
  ],
  particulars: (a) => ({
    companyName: answer(a, "companyName"),
    registeredOffice: answer(a, "registeredOffice"),
    companyNumber: answer(a, "companyNumber"),
    jurisdiction: answer(a, "jurisdiction"),
    date: answer(a, "meetingDate"),
    meetingPlace: answer(a, "meetingPlace"),
    chair: answer(a, "chair"),
  }),
  signatories: (a) => (answer(a, "chair") ? [answer(a, "chair")] : []),
  sections: (a) => [
    companySection(a, "meeting"),
    {
      group: "attendance",
      title: "Present and apologies",
      guide:
        "Record who attended, who sent apologies, and who chaired. Quorum is judged on this list, so it has to be right.",
      placeholder: "Who attended, who chaired, who sent apologies.",
      seed: [
        answerList(a, "present").length ? `Present: ${answerList(a, "present").join(", ")}.` : "",
        answer(a, "chair") ? `${answer(a, "chair")} took the chair.` : "",
        answerList(a, "apologies").length
          ? `Apologies were received from ${answerList(a, "apologies").join(", ")}.`
          : "",
        answer(a, "quorum") === "yes"
          ? "A quorum being present, the chair declared the meeting open."
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    ...recitalSections(a),
    {
      group: "consideration",
      title: "Consideration",
      guide:
        "What the board actually discussed, and the reasoning it relied on. This is what distinguishes minutes from a resolution: it shows the directors applied their minds.",
      placeholder: "What was discussed, and on what material.",
      seed: answer(a, "subject"),
    },
    {
      group: "resolution",
      title: "Resolution",
      guide:
        "What was resolved, in the words the board resolved it. One decision per resolution, and carried unanimously or by majority — say which.",
      placeholder: "What was resolved.",
    },
    ...authoritySections(a),
    {
      group: "execution",
      title: "Closure and signature",
      guide:
        "Close the meeting and leave the chair's signature block. Minutes are evidence once signed.",
      placeholder: "How the meeting closed and who signs the minutes.",
      seed: "There being no further business, the chair closed the meeting.",
    },
  ],
};

/* ---------------------------------------- written shareholders' resolution */

export const shareholderWrittenResolution: Blueprint = {
  kind: "shareholder_written_resolution",
  title: (a) =>
    `Written shareholders' resolution — ${answer(a, "subject").split("\n")[0]?.slice(0, 60) || "untitled"}`,
  steps: [
    companyStep("resolving"),
    {
      id: "resolutionType",
      title: "The resolution",
      fields: [
        {
          key: "resolutionType",
          label: "Ordinary or special resolution?",
          kind: "choice",
          required: true,
          options: [
            {
              value: "ordinary",
              label: "Ordinary resolution",
              help: "A simple majority. The default unless the constitution or the statute says otherwise.",
            },
            {
              value: "special",
              label: "Special resolution",
              help: "A supermajority, commonly 75%. Required for constitutional changes and similar matters.",
            },
          ],
          help: "The threshold decides how the resolution must be described and passed. Getting it wrong can invalidate it.",
        },
      ],
    },
    matterStep(
      "What are the members approving?",
      "Say what is being approved. For a special resolution the wording matters: it must be the wording put to the members.",
    ),
    authorityStep,
    signatureStep(
      "Which members are signing?",
      "One name per line, as registered. A written resolution binds only if signed by the required majority of those entitled to vote.",
    ),
  ],
  particulars: (a) => ({
    companyName: answer(a, "companyName"),
    registeredOffice: answer(a, "registeredOffice"),
    companyNumber: answer(a, "companyNumber"),
    jurisdiction: answer(a, "jurisdiction"),
    date: answer(a, "date"),
    resolutionType: answer(a, "resolutionType"),
  }),
  signatories: (a) => answerList(a, "signatories"),
  sections: (a) => [
    companySection(a, "members"),
    ...recitalSections(a),
    {
      group: "resolution",
      title:
        answer(a, "resolutionType") === "special" ? "Special resolution" : "Ordinary resolution",
      guide:
        answer(a, "resolutionType") === "special"
          ? "A special resolution must be passed in the exact terms put to the members, and described as a special resolution. Do not paraphrase it afterwards."
          : "State what is resolved, in operative terms. One decision per resolution.",
      placeholder: "What is resolved.",
      seed: answer(a, "subject"),
    },
    ...authoritySections(a),
    {
      group: "execution",
      title: "Execution",
      guide:
        "Say when the resolution takes effect and leave a signature block for each member. Where a member is a company, the block needs an authorised signatory.",
      placeholder: "How and when the resolution takes effect.",
      seed: "This resolution may be signed in counterparts, and takes effect on the date the last member signs.",
    },
  ],
};

/* ---------------------------------------------------------------- letter */

/**
 * Which letter this is. Two of the letters the firm writes most are the same
 * letter every time with different facts, so setup asks for the facts and
 * writes the paragraphs, as the firm's own salary and address confirmations
 * are written. Anything else is a general letter. The choice is a particular,
 * not a new kind of document: it changes what is asked, not what is stored.
 */
const letterType = (a: Answers) => answer(a, "letterType") || "general";
const isGeneral = (a: Answers) => letterType(a) === "general";
const isEmployment = (a: Answers) => letterType(a) === "employment";
const isAddress = (a: Answers) => letterType(a) === "address";

/** An answer, or a named blank while it has not been given. */
const or = (a: Answers, key: string, missing: string) => answer(a, key) || `[${missing}]`;

/** "a" or "an", for the position an employee holds. */
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

const employmentStep: SetupStep = {
  id: "employment",
  title: "The employment",
  intro: "The facts the confirmation states, as the firm's salary letters state them.",
  fields: [
    {
      key: "employer",
      label: "Employer",
      kind: "text",
      required: true,
      when: isEmployment,
      placeholder: "Nexis Africa MEA FZCO",
    },
    {
      key: "employeeName",
      label: "Employee",
      kind: "text",
      required: true,
      when: isEmployment,
      placeholder: "Mr. Mawusi Adusu",
      help: "As the employee is to be named throughout, with the title if the letter should use one.",
    },
    {
      key: "idNumber",
      label: "Passport or ID number",
      kind: "text",
      required: true,
      when: isEmployment,
      placeholder: "Passport Number G412686",
      help: "Written after “holder of”, so say which document it is.",
    },
    {
      key: "position",
      label: "Position",
      kind: "text",
      required: true,
      when: isEmployment,
      placeholder: "Project Analyst",
    },
    { key: "startDate", label: "Start date", kind: "date", required: true, when: isEmployment },
    {
      key: "employmentBasis",
      label: "Basis",
      kind: "choice",
      required: true,
      when: isEmployment,
      options: [
        { value: "full-time", label: "Full-time" },
        { value: "part-time", label: "Part-time" },
      ],
    },
    {
      key: "salary",
      label: "Monthly salary and currency",
      kind: "text",
      required: true,
      when: isEmployment,
      placeholder: "AED 12,500",
    },
    {
      key: "paymentMethod",
      label: "How the salary is paid",
      kind: "text",
      when: isEmployment,
      placeholder: "bank transfer",
    },
    {
      key: "goodStanding",
      label: "Is the employee in good standing?",
      kind: "choice",
      required: true,
      when: isEmployment,
      options: [
        { value: "yes", label: "Yes, say so" },
        { value: "no", label: "Leave it out" },
      ],
      help: "A bank reads this line. Only confirm it if it is true today.",
    },
    {
      key: "requestedFor",
      label: "What the employee needs it for",
      kind: "text",
      required: true,
      when: isEmployment,
      placeholder: "account opening purposes",
      help: "Completes the sentence “This letter is issued at the employee's request for …”.",
    },
  ],
};

const addressStep: SetupStep = {
  id: "address",
  title: "The confirmation",
  intro: "Who confirms, whose address, and on what knowledge.",
  fields: [
    {
      key: "declarantName",
      label: "Who is confirming",
      kind: "text",
      required: true,
      when: isAddress,
      placeholder: "Dominik Kleemann",
    },
    {
      key: "declarantCapacity",
      label: "In what capacity",
      kind: "textarea",
      required: true,
      when: isAddress,
      placeholder:
        "a lawyer qualified and admitted in Australia (Western Australia, New South Wales and High Court of Australia) and resident in Dubai, United Arab Emirates",
      help: "Written after the name: “I, [name], [capacity], hereby confirm…”.",
    },
    {
      key: "subjectName",
      label: "Whose address",
      kind: "text",
      required: true,
      when: isAddress,
      placeholder: "Mr. Abdulmohsin A H A Almishar",
    },
    {
      key: "subjectAddress",
      label: "The address",
      kind: "textarea",
      when: isAddress,
      help: "Leave blank to confirm the address already on the recipient's records, as the firm's letter does.",
    },
    {
      key: "knowledgeBasis",
      label: "On what knowledge",
      kind: "textarea",
      required: true,
      when: isAddress,
      placeholder:
        "my personal and professional knowledge of his residence status, including express confirmation obtained from him",
      help: "Completes the sentence “This confirmation is made based on …”.",
    },
    {
      key: "requestedFor",
      label: "What it is for",
      kind: "text",
      when: isAddress,
      placeholder: "the bank's know-your-customer records",
      help: "Optional. The firm's own address letter does not say.",
    },
  ],
};

/** The subject a preset letter is headed with, unless the lawyer wrote one. */
const letterSubject = (a: Answers) =>
  answer(a, "subject") ||
  (isEmployment(a)
    ? `Employment and salary confirmation – ${or(a, "employeeName", "employee")}`
    : isAddress(a)
      ? "Confirmation of residential address"
      : "");

const letterSections = (a: Answers): SectionSpec[] => {
  const body = (title: string, seed: string): SectionSpec => ({
    group: "body",
    title,
    guide:
      "One point, in the words the firm uses for it. Change a fact here only if it has changed since setup.",
    placeholder: "The letter, one point per paragraph.",
    seed,
  });
  if (isEmployment(a)) {
    const name = or(a, "employeeName", "employee");
    const employer = or(a, "employer", "employer");
    const position = or(a, "position", "position");
    return [
      body(
        "Employment",
        `This is to confirm that ${name}, holder of ${or(a, "idNumber", "passport or ID number")}, is currently employed with ${employer} as ${article(position)} ${position}.`,
      ),
      body(
        "Start and basis",
        `${name} was employed on ${answer(a, "startDate") ? houseLongDate(answer(a, "startDate")) : "[start date]"} and is engaged on a ${or(a, "employmentBasis", "full-time")} basis.`,
      ),
      body(
        "Salary",
        `${name}'s salary is paid via ${answer(a, "paymentMethod") || "bank transfer"}, and the total monthly compensation is ${or(a, "salary", "salary")}.`,
      ),
      ...(answer(a, "goodStanding") === "yes"
        ? [
            body(
              "Standing",
              `${name} is in good standing with ${employer} and continues to be employed as at the date of this letter.`,
            ),
          ]
        : []),
      {
        group: "purpose",
        title: "Purpose",
        guide: "Why the letter was issued. A bank reading it wants to know it was asked for.",
        placeholder: "Why this letter is issued.",
        seed: `This letter is issued at the employee's request for ${or(a, "requestedFor", "purpose")}.`,
      },
    ];
  }
  if (isAddress(a)) {
    const address = answerList(a, "subjectAddress").join(", ");
    return [
      body(
        "Confirmation",
        `I, ${or(a, "declarantName", "name")}, ${or(a, "declarantCapacity", "capacity")}, hereby confirm that ${or(a, "subjectName", "name")} ${
          address
            ? `resides at ${address}`
            : "continues to reside at the address referred to in the previous proof of address held in your records"
        }.`,
      ),
      body(
        "Basis",
        `This confirmation is made based on ${or(a, "knowledgeBasis", "basis of knowledge")}.`,
      ),
      body(
        "Further information",
        "Should any further information be required in relation to this matter, I remain available to provide the same.",
      ),
      ...(answer(a, "requestedFor")
        ? [
            {
              group: "purpose" as const,
              title: "Purpose",
              guide: "Why the letter was issued.",
              placeholder: "Why this letter is issued.",
              seed: `This letter is issued for ${answer(a, "requestedFor")}.`,
            },
          ]
        : []),
    ];
  }
  return [
    {
      group: "purpose",
      title: "Purpose",
      guide:
        "One or two sentences saying what this letter does. A reader should know from the opening whether it confirms, requests, instructs or gives notice.",
      placeholder: "Why this letter is issued.",
      seed: answer(a, "purpose"),
    },
    {
      group: "body",
      title: "Body",
      guide:
        "The letter itself, one point per paragraph. Keep the register consistent and define any term you will use again.",
      placeholder: "The letter, one point per paragraph.",
    },
  ];
};

export const corporateLetter: Blueprint = {
  kind: "letter",
  title: (a) =>
    isEmployment(a)
      ? `Salary confirmation — ${answer(a, "employeeName") || "untitled"}`
      : isAddress(a)
        ? `Confirmation of address — ${answer(a, "subjectName") || "untitled"}`
        : `Letter — ${answer(a, "subject") || "untitled"}`,
  steps: [
    {
      id: "letterType",
      title: "What the letter is",
      fields: [
        {
          key: "letterType",
          label: "Which letter?",
          kind: "choice",
          required: true,
          options: [
            {
              value: "general",
              label: "A general letter",
              help: "You write the body; Scripta lays out the paper.",
            },
            {
              value: "employment",
              label: "Employment and salary confirmation",
              help: "For a bank or an embassy: position, start date, salary, standing.",
            },
            {
              value: "address",
              label: "Confirmation of address",
              help: "A declarant confirms where someone lives, and on what knowledge.",
            },
          ],
        },
      ],
    },
    employmentStep,
    addressStep,
    {
      id: "parties",
      title: "Who it is from and to",
      fields: [
        {
          key: "reference",
          label: "Our reference",
          kind: "text",
          placeholder: "GMG/GB/EXP/01/2026",
          help: "Optional. Printed as “Our Ref:” at the head of the letter.",
        },
        {
          key: "sender",
          label: "From",
          kind: "textarea",
          help: "Optional. Leave it blank when the letterhead already carries the office address.",
        },
        {
          key: "addressee",
          label: "To",
          kind: "textarea",
          required: true,
          when: isGeneral,
          placeholder: "The Chief Executive Officer\nGhana Gold Board\n1 Thorpe Road\nAccra, Ghana",
        },
        {
          key: "salutation",
          label: "Greeting",
          kind: "choice",
          options: HOUSE_LETTER.salutations.map((value) => ({ value, label: value })),
          help: "“To Whom It May Concern” where the letter has no named addressee. Change the wording in the editor if neither fits.",
        },
        {
          key: "subject",
          label: "Subject",
          kind: "text",
          required: true,
          when: isGeneral,
          help: "What the letter is about, in one line. It becomes the subject line on the paper.",
        },
        { key: "date", label: "Date", kind: "date", help: DATE_HELP },
      ],
    },
    {
      id: "purpose",
      title: "What the letter does",
      fields: [
        {
          key: "purpose",
          label: "Why is the letter being issued?",
          kind: "textarea",
          required: true,
          when: isGeneral,
          help: "A corporate letter usually does something: confirms, requests, instructs or gives notice. Say which.",
        },
      ],
    },
    {
      id: "signature",
      title: "Signature",
      fields: [
        { key: "signatoryName", label: "Signed by", kind: "text", required: true },
        { key: "signatoryTitle", label: "Title", kind: "text", placeholder: "Managing Partner" },
        {
          key: "signatoryEntity",
          label: "Signing for",
          kind: "text",
          placeholder: "For and on behalf of Goldenmark Ghana Ltd",
          help: "Optional. The line beneath the title, as it should read.",
        },
        {
          key: "closing",
          label: "Closing",
          kind: "choice",
          options: HOUSE_LETTER.closings.map((value) => ({ value, label: value })),
          help: "“Yours faithfully,” to Sir or Madam; “Yours sincerely,” to a named person.",
        },
      ],
    },
  ],
  particulars: (a) => ({
    letterType: letterType(a),
    reference: answer(a, "reference"),
    date: answer(a, "date"),
    sender: answer(a, "sender"),
    addressee: isGeneral(a) ? answer(a, "addressee") : "",
    // A confirmation goes to whoever it is shown to, as the firm's do.
    salutation:
      answer(a, "salutation") ||
      (isGeneral(a) ? HOUSE_LETTER.salutations[0] : HOUSE_LETTER.salutations[1]),
    subject: letterSubject(a),
    signatoryName: answer(a, "signatoryName"),
    signatoryTitle: answer(a, "signatoryTitle"),
    signatoryEntity: answer(a, "signatoryEntity"),
    closing:
      answer(a, "closing") || (isAddress(a) ? HOUSE_LETTER.closings[2] : HOUSE_LETTER.closings[0]),
  }),
  signatories: (a) => (answer(a, "signatoryName") ? [answer(a, "signatoryName")] : []),
  sections: letterSections,
};

export const BLUEPRINTS = {
  board_written_resolution: boardWrittenResolution,
  board_minutes: boardMinutes,
  shareholder_written_resolution: shareholderWrittenResolution,
  letter: corporateLetter,
} as const;

export const blueprintFor = (kind: keyof typeof BLUEPRINTS) => BLUEPRINTS[kind];
