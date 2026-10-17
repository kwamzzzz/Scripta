import type { ReactNode } from "react";
/* Canonical sample data from Wireframes (4). Used only in unmapped reference states. */
const RAW = {
  ...{
    open_a_1c: true,
    chev_a_1c: "▾",
    label_a_1c: "Hide detailed analysis",
    detail_a_1c:
      "Art. 314 CO leaves the rate to the parties for a commercial loan. The consumer-credit ceilings often quoted apply only where the borrower is a consumer, and relief under Art. 21 CO requires an exploited weakness, not merely a high rate. At 11% the clause remains materially below the 15–18% range where challenges have succeeded.",
    open_a_1e: false,
    chev_a_1e: "▸",
    label_a_1e: "Show detailed analysis",
    detail_a_1e:
      "Conversion discounts of 20% and interest step-ups of 2–4% are both common in Swiss convertible rounds. Where they stack, check that the effective return does not read as punitive if the round never closes.",
    open_a_3c: false,
    chev_a_3c: "▸",
    label_a_3c: "Show detailed analysis",
    detail_a_3c:
      "R-12 requires an ownership test and a lender election between repayment and conversion. Clause 4 currently provides neither, and clause 2.1 has no definition to bind the trigger to — so the missing definition is the upstream cause of both flags.",
    open_a_4b: false,
    chev_a_4b: "▸",
    label_a_4b: "Show detailed analysis",
    detail_a_4b:
      "The Federal Supreme Court declined to read the consumer ceiling across to commercial lending at consideration 2. Your borrower raises venture debt through a company, so the reasoning applies without further distinction.",
    open_a_4c: false,
    chev_a_4c: "▸",
    label_a_4c: "Show detailed analysis",
    detail_a_4c:
      "Footnote 2 currently cites consideration 3, which deals with the consumer test. The freedom-of-rate passage you pinned sits at consideration 2 — correcting the pinpoint keeps the proposition and the authority aligned.",
    open_a_4f: false,
    chev_a_4f: "▸",
    label_a_4f: "Show detailed analysis",
    /** Empty on purpose, and it must stay empty.
     *
     *  Nothing overrides this field, so whatever sits here is shown inside a
     *  real research matter as though the reader had written it. It used to
     *  hold a worked conclusion about Act 651, a contract clause and a fact
     *  reference — invented for a drawing, indistinguishable on screen from
     *  the reader's own analysis. In a legal tool that is not a placeholder,
     *  it is a fabricated legal opinion attributed to the user. */
    detail_a_4f: "",
    open_a_2b: false,
    chev_a_2b: "▸",
    label_a_2b: "Show detailed analysis",
    detail_a_2b:
      "The conversion price is raised at 06:40 and left unresolved. Both the fixed CHF 10.00 and the qualifying-round price remain live, so the item is logged as an open question rather than a distilled term.",
    open_a_4a: false,
    chev_a_4a: "▸",
    label_a_4a: "Show detailed analysis",
    detail_a_4a:
      "The drafted clause tracks what this research supports: simple interest, a 365-day year and no compounding — the three features that keep an 11% rate defensible on a commercial loan.",
    delivRows: [
      {
        key: "title",
        name: "Title page",
        note: "client, reference, version, confidentiality notice",
        on: true,
        off: false,
      },
      {
        key: "exec",
        name: "Executive summary",
        note: "objective, findings, risks, recommended action",
        on: true,
        off: false,
      },
      {
        key: "toc",
        name: "Table of contents",
        note: "generated from headings",
        on: true,
        off: false,
      },
      {
        key: "cases",
        name: "Table of cases",
        note: "cited decisions with pinpoints",
        on: true,
        off: false,
      },
      {
        key: "legis",
        name: "Table of legislation",
        note: "statutes and regulations cited",
        on: false,
        off: true,
      },
      {
        key: "instr",
        name: "Instructions & scope",
        note: "reliance, law-as-at date, matters out of scope",
        on: true,
        off: false,
      },
      {
        key: "issues",
        name: "Questions presented",
        note: "one issue card per question",
        on: true,
        off: false,
      },
      {
        key: "answers",
        name: "Short answers",
        note: "position, risk rating, key authority",
        on: true,
        off: false,
      },
      {
        key: "facts",
        name: "Material facts & assumptions",
        note: "fact matrix + assumptions register",
        on: true,
        off: false,
      },
      {
        key: "method",
        name: "Research methodology",
        note: "databases, search trail, limitations",
        on: false,
        off: true,
      },
      {
        key: "framework",
        name: "Applicable legal framework",
        note: "authorities by jurisdiction and level",
        on: true,
        off: false,
      },
      {
        key: "analysis",
        name: "Analysis by issue",
        note: "IRAC · evidence chain",
        on: true,
        off: false,
      },
      {
        key: "risk",
        name: "Risk assessment",
        note: "risk matrix and mitigation owners",
        on: true,
        off: false,
      },
      {
        key: "recs",
        name: "Conclusions & recommendations",
        note: "client action plan",
        on: true,
        off: false,
      },
      {
        key: "biblio",
        name: "Authorities & bibliography",
        note: "OSCOLA · grouped by source type",
        on: true,
        off: false,
      },
      {
        key: "appx",
        name: "Appendices",
        note: "chronology, research log, extracts",
        on: false,
        off: true,
      },
    ],
    delivOn: 13,
    delivOff: 3,
    delivSummary: "13 of 16 sections in the download",
    delivExcluded: "Table of legislation · Research methodology · Appendices",
    navGroups: [
      {
        label: "WORKSPACE",
        items: ["Dashboard", "Matters", "Transcript distiller", "Research"],
      },
      {
        label: "KNOWLEDGE",
        items: ["Playbooks", "Precedents", "Tasks"],
      },
      {
        label: "FIRM",
        items: ["Templates", "Client workspace", "Settings"],
      },
    ],
    precedents: [
      {
        name: "Convertible Loan Agreement — Helvetia / Laine",
        type: "Convertible loan",
        side: "Lender",
        juris: "Switzerland",
        date: "Executed 4 Apr 2026",
        tags: "11% interest · change of control · QFR conversion",
        state: "Firm approved",
        uses: "used 7×",
      },
      {
        name: "Employment Agreement — probation variant",
        type: "Employment",
        side: "Employer",
        juris: "Ghana",
        date: "Executed 12 Jan 2026",
        tags: "6-month probation · one week notice",
        state: "Firm approved",
        uses: "used 12×",
      },
      {
        name: "Gold Supply & Offtake Agreement",
        type: "Supply / offtake",
        side: "Seller",
        juris: "Ghana · UAE",
        date: "Executed 22 Nov 2025",
        tags: "refinery accreditation · UBO warranties",
        state: "Needs review",
        uses: "used 3×",
      },
      {
        name: "Shareholders' Agreement — Baumann Holding",
        type: "Shareholders'",
        side: "Minority",
        juris: "Switzerland",
        date: "Executed 8 Aug 2025",
        tags: "tag-along · reserved matters",
        state: "Firm approved",
        uses: "used 5×",
      },
      {
        name: "Mutual NDA — Lumen Labs",
        type: "NDA",
        side: "Mutual",
        juris: "England & Wales",
        date: "Executed 2 Feb 2026",
        tags: "3-year term · no residuals",
        state: "Superseded",
        uses: "used 1×",
      },
    ],
    precClauses: [
      {
        name: "Interest — step-up on slipped round",
        from: "Helvetia / Laine, cl. 3.5",
        note: "11% p.a., simple, 365-day year",
        flag: "Preferred",
      },
      {
        name: "Change of control — repayment or conversion",
        from: "Helvetia / Laine, cl. 4.4",
        note: "50% ownership test; lender elects",
        flag: "Preferred",
      },
      {
        name: "Conversion price — lower-of test",
        from: "Baumann SHA, cl. 7.2 (adapted)",
        note: "fixed price vs 80% of QFR price",
        flag: "Fallback",
      },
      {
        name: "Probation — notice and payments",
        from: "Employment (GH), cl. 4",
        note: "one week notice; accrued leave payable",
        flag: "Preferred",
      },
      {
        name: "UBO warranty — counterparty",
        from: "Gold offtake, cl. 12.1",
        note: "verification before first shipment",
        flag: "Needs review",
      },
    ],
    precFilters: [
      "Type: Convertible loan",
      "Jurisdiction: Switzerland",
      "Side: Lender",
      "Status: Firm approved",
    ],
    rmCards: [
      {
        label: "ACTIVE MATTERS",
        value: "7",
        note: "3 comprehensive, 4 simple",
      },
      {
        label: "DRAFT REPORTS",
        value: "4",
        note: "2 due this week",
      },
      {
        label: "AWAITING REVIEW",
        value: "2",
        note: "with K. Mensah",
      },
      {
        label: "CLIENT INFORMATION DUE",
        value: "3",
        note: "documents requested",
      },
      {
        label: "LIMITATION / FILING DATES",
        value: "2",
        note: "next: 19 Sept",
      },
    ],
    rmMatters: [
      {
        name: "Probation termination — notice and payments",
        client: "Adinkra Foods Ltd",
        juris: "Ghana",
        type: "Simple",
        status: "Drafting",
        edited: "today, 11:20",
        who: "J. Frei / rev. K. Mensah",
      },
      {
        name: "Gold export licensing and AML obligations",
        client: "Sankofa Metals",
        juris: "Ghana · UAE",
        type: "Comprehensive",
        status: "Researching",
        edited: "yesterday",
        who: "A. Osei / rev. J. Frei",
      },
      {
        name: "Free-zone entity — corporate compliance review",
        client: "Harmattan Holdings",
        juris: "UAE",
        type: "Comprehensive",
        status: "Review",
        edited: "4 Sept",
        who: "J. Frei / rev. K. Mensah",
      },
      {
        name: "Redundancy consultation obligations",
        client: "Adinkra Foods Ltd",
        juris: "Ghana",
        type: "Simple",
        status: "Finalised",
        edited: "1 Sept",
        who: "A. Osei",
      },
    ],
    rmPriority: [
      {
        act: "Confirm 3 missing facts",
        ctx: "Probation termination · Adinkra Foods",
        cta: "Send request",
      },
      {
        act: "Review 2 citations without pinpoints",
        ctx: "Gold export licensing · Sankofa Metals",
        cta: "Open citations",
      },
      {
        act: "Complete risk assessment",
        ctx: "Free-zone compliance · Harmattan",
        cta: "Open matrix",
      },
      {
        act: "Approve final report",
        ctx: "Redundancy consultation · Adinkra Foods",
        cta: "Review & approve",
      },
    ],
    rmActivity: [
      {
        t: "11:20",
        text: "Labour Act 2003 (Act 651), s. 27 added to Probation termination",
      },
      {
        t: "10:04",
        text: "Research question closed — “Is written notice required in probation?”",
      },
      {
        t: "09:41",
        text: "Client uploaded employment contract (Adinkra Foods)",
      },
      {
        t: "Yest.",
        text: "Minerals and Mining Act 2006 flagged — amended 2019, verify",
      },
    ],
    quickStart: [
      {
        name: "Simple research note",
        note: "1–5 pages · focused question",
      },
      {
        name: "Comprehensive report",
        note: "full evidence trail",
      },
      {
        name: "Use a template",
        note: "14 firm templates",
      },
      {
        name: "Import a document",
        note: "DOCX · PDF",
      },
    ],
    issueCards: [
      {
        no: "ISSUE 1",
        short: "Termination during probation without notice",
        q: "May the employer terminate during probation without notice?",
        juris: "Ghana",
        pri: "High",
        state: "Analysis drafted",
        answer:
          "Likely — subject to the contract's probation clause and any fair-procedure requirement.",
        pos: "Likely",
        risk: "Medium",
        auth: "Labour Act 2003 (Act 651), s. 27",
      },
      {
        no: "ISSUE 2",
        short: "Payments due on termination",
        q: "What payments fall due on termination in probation?",
        juris: "Ghana",
        pri: "High",
        state: "Researching",
        answer: "Accrued salary and untaken leave; no statutory severance in probation.",
        pos: "Clear",
        risk: "Low",
        auth: "Act 651, ss. 20, 57",
      },
      {
        no: "ISSUE 3",
        short: "Free-zone licence and direct gold export",
        q: "Does the free-zone licence permit direct gold export to the UAE?",
        juris: "Ghana · UAE",
        pri: "Critical",
        state: "Awaiting facts",
        answer:
          "Depends on further facts — licence class and refinery accreditation not yet supplied.",
        pos: "Depends on further facts",
        risk: "High",
        auth: "Minerals and Mining Act 2006 (Act 703)",
      },
    ],
    factRows: [
      {
        id: "F-01",
        fact: "Employee engaged on 6-month probation from 1 March 2026",
        src: "Employment contract cl. 4",
        cls: "Verified",
        issue: "1, 2",
        conf: "High",
      },
      {
        id: "F-02",
        fact: "Written warning issued 12 June 2026",
        src: "HR file",
        cls: "Client-provided",
        issue: "1",
        conf: "Medium",
      },
      {
        id: "F-03",
        fact: "No probation review meeting held",
        src: "Client email 2 Sept",
        cls: "Disputed",
        issue: "1",
        conf: "Low",
      },
      {
        id: "F-04",
        fact: "Employee's role is not unionised",
        src: "—",
        cls: "Assumed",
        issue: "1",
        conf: "Medium",
      },
      {
        id: "F-05",
        fact: "Date the notice was delivered",
        src: "—",
        cls: "Missing",
        issue: "1, 2",
        conf: "—",
      },
    ],
    assumptionRows: [
      {
        a: "The contract in the HR file is the executed version",
        why: "Only an unsigned copy was supplied",
        risk: "Conclusion on notice changes if clause 4 differs",
        state: "Pending",
      },
      {
        a: "No collective agreement applies",
        why: "Client confirmed orally on 2 Sept",
        risk: "Consultation duties would attach",
        state: "Unconfirmed",
      },
    ],
    chainSteps: [
      {
        label: "FACT",
        text: "F-01 · six-month probation from 1 March 2026",
      },
      {
        label: "AUTHORITY",
        text: "Labour Act 2003 (Act 651), s. 27(1)",
      },
      {
        label: "PROPOSITION",
        text: "Probationary employment may be ended on the terms of the contract",
      },
      {
        label: "ANALYSIS",
        text: "Clause 4 permits one week's notice; no statutory minimum displaces it",
      },
      {
        label: "CONCLUSION",
        text: "Termination is available on one week's notice",
      },
      {
        label: "RECOMMENDATION",
        text: "Serve written notice and pay accrued leave before 19 Sept",
      },
    ],
    riskRows: [
      {
        title: "Unfair-procedure claim",
        issue: "Issue 1",
        like: "Possible",
        imp: "Moderate",
        rate: "Medium",
        mit: "Hold a documented probation review before notice",
        who: "HR lead",
        by: "12 Sept",
      },
      {
        title: "Unpaid leave entitlement",
        issue: "Issue 2",
        like: "Unlikely",
        imp: "Low",
        rate: "Low",
        mit: "Reconcile leave balance with payroll",
        who: "Payroll",
        by: "10 Sept",
      },
      {
        title: "Export without accredited refinery",
        issue: "Issue 3",
        like: "Likely",
        imp: "Severe",
        rate: "Critical",
        mit: "Confirm refinery accreditation before shipment",
        who: "Compliance",
        by: "Immediate",
      },
      {
        title: "AML beneficial-ownership gap",
        issue: "Issue 3",
        like: "Possible",
        imp: "Severe",
        rate: "High",
        mit: "Complete UBO verification on the UAE counterparty",
        who: "Compliance",
        by: "19 Sept",
      },
    ],
    actionRows: [
      {
        act: "Serve written notice with accrued leave payment",
        pri: "Immediate",
        who: "HR lead",
        by: "12 Sept",
        issue: "1, 2",
      },
      {
        act: "Document a probation review meeting",
        pri: "Immediate",
        who: "HR lead",
        by: "11 Sept",
        issue: "1",
      },
      {
        act: "Obtain refinery accreditation certificate",
        pri: "Short term",
        who: "Compliance",
        by: "19 Sept",
        issue: "3",
      },
      {
        act: "Complete UBO verification on the buyer",
        pri: "Short term",
        who: "Compliance",
        by: "19 Sept",
        issue: "3",
      },
    ],
    healthChecks: [
      {
        q: "Scope, jurisdiction and law-as-at date stated",
        state: "Pass",
      },
      {
        q: "Every issue has a short answer",
        state: "Pass",
      },
      {
        q: "All key facts carry a source status",
        state: "1 missing (F-05)",
      },
      {
        q: "Assumptions recorded with consequences",
        state: "Pass",
      },
      {
        q: "Authority status verified",
        state: "1 to verify (Act 703)",
      },
      {
        q: "Contrary authority considered",
        state: "Pass",
      },
      {
        q: "Every material proposition cited",
        state: "2 unsupported",
      },
      {
        q: "Risk matrix complete with owners and dates",
        state: "Pass",
      },
      {
        q: "Confidentiality notice included",
        state: "Pass",
      },
      {
        q: "Approval recorded",
        state: "Not approved",
      },
    ],
    clientRows: [
      {
        name: "Redundancy consultation obligations",
        type: "Simple note · 4 pages",
        state: "Approved for client",
        date: "1 Sept",
      },
      {
        name: "Probation termination — notice and payments",
        type: "Simple note",
        state: "Draft — internal",
        date: "—",
      },
      {
        name: "Gold export licensing and AML obligations",
        type: "Comprehensive report",
        state: "In preparation",
        date: "due 19 Sept",
      },
    ],
    clientRequests: [
      {
        item: "Executed employment contract (signed copy)",
        state: "Outstanding",
      },
      {
        item: "Payroll leave balance as at 1 Sept",
        state: "Received",
      },
      {
        item: "Refinery accreditation certificate",
        state: "Outstanding",
      },
      {
        item: "UBO declaration — UAE counterparty",
        state: "Outstanding",
      },
    ],
    templateCards: [
      {
        name: "Simple legal research note",
        len: "1–5 pages",
        who: "Internal or client",
        depth: "Focused",
      },
      {
        name: "Comprehensive research report",
        len: "20–60 pages",
        who: "Client / board",
        depth: "Full evidence trail",
      },
      {
        name: "Ghana employment-law report",
        len: "8–15 pages",
        who: "Employer client",
        depth: "Statute-led",
      },
      {
        name: "UAE corporate compliance report",
        len: "12–25 pages",
        who: "Group counsel",
        depth: "Regulatory",
      },
      {
        name: "Ghana–UAE gold-trade compliance",
        len: "25–60 pages",
        who: "Board / regulator",
        depth: "Cross-border",
      },
      {
        name: "AML/KYC and sanctions research",
        len: "15–30 pages",
        who: "Compliance",
        depth: "Regulatory",
      },
    ],
    libFilters: [
      "Jurisdiction: Ghana",
      "Type: Statute",
      "Status: In force",
      "Topic: Employment",
      "Matter: Adinkra Foods",
    ],
    libResults: [
      {
        cite: "Labour Act 2003 (Act 651)",
        kind: "STATUTE · GHANA",
        note: "s. 27 probation; s. 57 leave",
        flag: "Key",
        state: "In force",
      },
      {
        cite: "Minerals and Mining Act 2006 (Act 703)",
        kind: "STATUTE · GHANA",
        note: "export licensing regime",
        flag: "Needs verification",
        state: "Amended 2019",
      },
      {
        cite: "Anti-Money Laundering Act 2020 (Act 1044)",
        kind: "STATUTE · GHANA",
        note: "UBO and reporting duties",
        flag: "Supporting",
        state: "In force",
      },
      {
        cite: "UAE Federal Decree-Law No. 32/2021",
        kind: "STATUTE · UAE",
        note: "commercial companies",
        flag: "Supporting",
        state: "In force",
      },
      {
        cite: "Ashanti Goldfields v. Mensah",
        kind: "COURT DECISION · GHANA CA",
        note: "probation dismissal procedure",
        flag: "Contrary",
        state: "Good law",
      },
    ],
    showNotes: true,
    showChatPanel: true,
    showToc: true,
    showBadges: true,
    rail: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    tools: [1, 2, 3, 4, 5, 6, 7],
    skeleton: [1, 2, 3, 4, 5, 6],
    playbooks: [
      {
        name: "Convertible loans",
        scope: "Lender side · Switzerland",
        rules: "24 rules",
        updated: "updated 2 days ago",
      },
      {
        name: "SaaS & licensing",
        scope: "Customer side · EU/UK",
        rules: "38 rules",
        updated: "updated last month",
      },
      {
        name: "NDAs",
        scope: "Mutual",
        rules: "11 rules",
        updated: "updated in June",
      },
      {
        name: "Employment",
        scope: "Employer side · CH",
        rules: "19 rules",
        updated: "updated in May",
      },
    ],
    playbookRules: [
      {
        no: "R-07",
        clause: "Interest",
        pos: "Preferred",
        text: "8–11% per annum, 365-day year, pro rata temporis.",
        state: "In use",
      },
      {
        no: "R-08",
        clause: "Interest",
        pos: "Fallback",
        text: "Up to 13% where the round has slipped more than two quarters.",
        state: "In use",
      },
      {
        no: "R-09",
        clause: "Interest",
        pos: "Never accept",
        text: "Rates above 15% p.a., or compounding monthly.",
        state: "In use",
      },
      {
        no: "R-12",
        clause: "Change of Control",
        pos: "Preferred",
        text: "Ownership test at >50%; lender elects repayment or conversion.",
        state: "In use",
      },
      {
        no: "R-13",
        clause: "Conversion Price",
        pos: "Preferred",
        text: "Lower of the fixed price and 80% of the qualifying-round price.",
        state: "Draft",
      },
    ],
    deviations: [
      {
        clause: "3.5 Interest",
        rule: "R-07 Preferred",
        found: "11% per annum",
        verdict: "Within playbook",
        sev: "ok",
      },
      {
        clause: "4 Ordinary Repayment",
        rule: "R-12 Preferred",
        found: "No change-of-control remedy",
        verdict: "Missing position",
        sev: "warn",
      },
      {
        clause: "5.1.3 Conversion Price",
        rule: "R-13 Draft",
        found: "Fixed CHF 10.00 only",
        verdict: "Deviates — no lower-of test",
        sev: "warn",
      },
      {
        clause: "6.1 Events of Default",
        rule: "R-21 Preferred",
        found: "Standard list",
        verdict: "Within playbook",
        sev: "ok",
      },
    ],
    researchSources: [
      {
        n: "1",
        cite: "Art. 314 CO",
        kind: "STATUTE · CH",
        held: "Interest on loans; contractual rate free absent a cap.",
      },
      {
        n: "2",
        cite: "BGE 4A_172/2019",
        kind: "FEDERAL SUPREME COURT · 2019",
        held: "Rate found excessive in a consumer context; commercial lending distinguished.",
      },
      {
        n: "3",
        cite: "Cantonal rate ordinances",
        kind: "SECONDARY · ZH",
        held: "Administrative ceilings applying to consumer credit only.",
      },
      {
        n: "4",
        cite: "Art. 21 CO",
        kind: "STATUTE · CH",
        held: "Unfair advantage; relief where a party exploits distress.",
      },
    ],
    researchFindings: [
      {
        cite: "[1]",
        text: "No statutory maximum applies to a commercial, non-consumer loan.",
      },
      {
        cite: "[3]",
        text: "Consumer-credit ceilings are the usual source of the “usury” figure and do not bind here.",
      },
      {
        cite: "[2]",
        text: "Rates challenged successfully sit materially above 15% p.a., usually with compounding.",
      },
    ],
    memoOutline: [
      {
        no: "1",
        title: "Question",
      },
      {
        no: "2",
        title: "Short answer",
      },
      {
        no: "3",
        title: "Statutory framework",
      },
      {
        no: "3.1",
        title: "Art. 314 CO",
      },
      {
        no: "3.2",
        title: "Consumer credit ceilings",
      },
      {
        no: "4",
        title: "Case law",
      },
      {
        no: "5",
        title: "Application to clause 3.5",
      },
      {
        no: "6",
        title: "Recommendation",
      },
    ],
    transcriptTurns: [
      {
        t: "00:02:14",
        who: "You",
        text: "Let's start with the money. Principal is ten million, drawn in two tranches this year.",
      },
      {
        t: "00:02:51",
        who: "Client",
        text: "Yes — five million end of August, five million end of December. Both in Swiss francs.",
      },
      {
        t: "00:03:38",
        who: "You",
        text: "And interest? The last paper you sent had eight per cent.",
      },
      {
        t: "00:04:31",
        who: "Client",
        text: "We want eleven now. The round slipped, so the risk is higher than when we papered it.",
      },
      {
        t: "00:05:12",
        who: "You",
        text: "Noted. Default interest stays at five on top?",
      },
      {
        t: "00:05:29",
        who: "Client",
        text: "Stays at five. And we need something on change of control — if they get bought, we either take repayment or convert.",
      },
      {
        t: "00:06:40",
        who: "You",
        text: "We'll need to define change of control. Ownership threshold, or board majority?",
      },
      {
        t: "00:06:58",
        who: "Client",
        text: "Ownership. Anything over fifty per cent changing hands should trigger it.",
      },
    ],
    distilledItems: [
      {
        tag: "COMMERCIAL TERM",
        title: "Interest rate moves to 11%",
        body: "Client asked to raise the rate from 8% to 11% per annum, citing the slipped funding round.",
        src: "00:04:31",
        clause: "3.5 Interest",
        state: "Ready",
      },
      {
        tag: "COMMERCIAL TERM",
        title: "Default interest unchanged at 5%",
        body: "Confirmed on the call; no drafting change needed.",
        src: "00:05:12",
        clause: "3.5 Interest",
        state: "No change",
      },
      {
        tag: "NEW CLAUSE",
        title: "Change of control remedy",
        body: "On a change of control the lender may seek repayment or convert the loan and accrued interest.",
        src: "00:05:29",
        clause: "4 Ordinary Repayment",
        state: "Ready",
      },
      {
        tag: "DEFINITION",
        title: "“Change of Control” — 50% ownership test",
        body: "Trigger where more than 50% of ownership changes hands. Board-majority test expressly not used.",
        src: "00:06:58",
        clause: "2.1 Definitions",
        state: "Ready",
      },
      {
        tag: "OPEN QUESTION",
        title: "Which conversion price applies?",
        body: "Not settled on the call. Fixed CHF 10.00 per share, or the qualifying-round price?",
        src: "00:06:40",
        clause: "5.1.3 Conversion Price",
        state: "Needs answer",
      },
    ],
    distillFacts: [
      {
        label: "Duration",
        value: "41 min",
      },
      {
        label: "Speakers",
        value: "2",
      },
      {
        label: "Items found",
        value: "5",
      },
      {
        label: "Open questions",
        value: "1",
      },
    ],
    distillOptions: [
      {
        name: "Commercial terms",
        note: "amounts, rates, dates, thresholds",
      },
      {
        name: "New clauses & amendments",
        note: "anything the parties agreed to add or change",
      },
      {
        name: "Definitions",
        note: "terms that need defining before they can be relied on",
      },
      {
        name: "Open questions",
        note: "points left unresolved on the call",
      },
      {
        name: "Follow-up actions",
        note: "who owes what, and by when",
      },
    ],
    sendRows: [
      {
        title: "Interest rate moves to 11%",
        clause: "3.5 Interest",
      },
      {
        title: "Change of control remedy",
        clause: "4 Ordinary Repayment",
      },
      {
        title: "“Change of Control” — 50% ownership test",
        clause: "2.1 Definitions",
      },
    ],
    tips: [
      {
        title: "Define “Change of Control” before you rely on it",
        body: "Repayment and conversion triggers fail quietly when the event itself is undefined. State an ownership threshold or a board-majority test.",
        meta: "DRAFTING NOTE · CONVERTIBLES",
      },
      {
        title: "Interest step-ups sit alongside conversion discounts",
        body: "Both compensate early risk. Check they don't stack into a rate a court would read as punitive.",
        meta: "PRACTICE NOTE · SWISS LAW",
      },
      {
        title: "Say which conversion price wins",
        body: "Where a fixed price and a qualifying-round price both exist, name the order of precedence in the clause, not the schedule.",
        meta: "DRAFTING NOTE · CONVERTIBLES",
      },
    ],
    review: [
      {
        name: "Convertible Loan Agreement",
        party: "Helvetia Ventures",
        when: "2 open instructions",
      },
      {
        name: "SaaS Master Services Agreement",
        party: "Norvik AG",
        when: "1 issue flagged",
      },
      {
        name: "Shareholders' Agreement",
        party: "Baumann Holding",
        when: "awaiting counterparty",
      },
      {
        name: "NDA — mutual",
        party: "Lumen Labs",
        when: "ready to finalise",
      },
    ],
    drafts: [
      {
        name: "Employment Agreement — CTO",
        party: "internal",
        when: "edited 20 min ago",
      },
      {
        name: "Term Sheet — Series A",
        party: "Helvetia Ventures",
        when: "edited yesterday",
      },
      {
        name: "Licence Agreement",
        party: "Orbit GmbH",
        when: "edited 3 days ago",
      },
      {
        name: "Supply Agreement",
        party: "Kessler AG",
        when: "edited last week",
      },
    ],
    toc: [
      {
        no: "1",
        name: "Effectiveness",
      },
      {
        no: "2",
        name: "Interpretation",
      },
      {
        no: "2.1",
        name: "Definitions",
      },
      {
        no: "2.2",
        name: "Construction",
      },
      {
        no: "3",
        name: "Convertible Loan",
      },
      {
        no: "3.1",
        name: "Capitalisation",
      },
      {
        no: "3.2",
        name: "Drawdown",
      },
      {
        no: "3.4",
        name: "Purpose of the Loan",
      },
      {
        no: "3.5",
        name: "Interest",
      },
      {
        no: "4",
        name: "Ordinary Repayment",
      },
      {
        no: "5",
        name: "Conversion of Loan",
      },
      {
        no: "6",
        name: "Default",
      },
    ],
    interestItems: [
      {
        no: "(i)",
        text: "on the Maturity Date;",
      },
      {
        no: "(ii)",
        text: "on the date repayment is otherwise mandated under this Agreement;",
      },
      {
        no: "(iii)",
        text: "on the date of a Conversion; or",
      },
      {
        no: "(iv)",
        text: "on the date of an Event of Default, whichever occurs earlier.",
      },
    ],
    instructions: [
      {
        title: "Interest payment",
        summary: "Increase the rate by 3%.",
        anchor: "CLAUSE 3.5",
      },
      {
        title: "Ordinary repayment",
        summary:
          "On a change of control, the lender may seek repayment or convert at the conversion rate.",
        anchor: "CLAUSE 4",
      },
      {
        title: "Definitions",
        summary: "Define “Change of Control”.",
        anchor: "CLAUSE 2.1",
      },
    ],
    sessionInstructions: [
      "Interest — increase the rate by 3%",
      "Ordinary repayment — on a change of control, the lender may seek repayment or convert the loan and interest at the conversion rate",
    ],
    followUpsA: [
      "The current rate in the contract is 8% per annum.",
      "Are you looking to increase this to 11% per annum (8% + 3%)?",
    ],
    followUpsB: [
      "The contract doesn't define “Change of Control” — a share-ownership threshold, or a change in the board majority?",
      "If the lender converts, which rate applies: the fixed CHF 10.00 per share, or the qualifying-round price?",
    ],
    client: [
      {
        label: "Name",
        value: "Helvetia Ventures AG",
      },
      {
        label: "Email",
        value: "legal@helvetia.vc",
      },
      {
        label: "Address",
        value: "Bahnhofstrasse 14, Zurich",
      },
      {
        label: "Phone",
        value: "+41 44 000 00 00",
      },
    ],
    basics: [
      {
        label: "Applicable law",
        value: "Switzerland",
      },
      {
        label: "Contract type",
        value: "Convertible loan",
      },
      {
        label: "Language",
        value: "English",
      },
      {
        label: "Effective date",
        value: "1 April 2026",
      },
    ],
    parties: [
      {
        name: "Helvetia Ventures AG",
        role: "Lender",
        tag: "CLIENT",
      },
      {
        name: "Laine Technologies AG",
        role: "Borrower",
        tag: "COUNTERPARTY",
      },
    ],
    terms: [
      {
        label: "Principal",
        value: "CHF 10,000,000",
      },
      {
        label: "Annual interest",
        value: "8%",
      },
      {
        label: "Default interest",
        value: "5%",
      },
    ],
  },
  toggle_a_1c: () => {},
  toggle_a_1e: () => {},
  toggle_a_3c: () => {},
  toggle_a_4b: () => {},
  toggle_a_4c: () => {},
  toggle_a_4f: () => {},
  toggle_a_2b: () => {},
  toggle_a_4a: () => {},
};

/** Deliverable rows carry a toggle in the wireframe's state class; screens supply real ones. */
type Handler = (arg?: unknown) => void;
type Handlers = {
  resume?: Handler;
  startNew?: Handler;
  viewAll?: Handler;
  openMatter?: Handler;
  selectPlaybook?: Handler;
  addRule?: Handler;
  newPlaybook?: Handler;
  editRule?: Handler;
  openPrecedent?: Handler;
  addPrecedent?: Handler;
  chooseFile?: Handler;
  pickType?: Handler;
  toggleUpgrade?: Handler;
  continueResearch?: Handler;
  backResearch?: Handler;
  saveExit?: Handler;
  addIssue?: Handler;
  draftIssues?: Handler;
  openAnalysis?: Handler;
  addFact?: Handler;
  addAssumption?: Handler;
  editFact?: Handler;
  editAssumption?: Handler;
  cycleFactClass?: Handler;
  cycleAssumptionState?: Handler;
  insertDraft?: Handler;
  rejectDraft?: Handler;
  followUp?: Handler;
  selectIssue?: Handler;
  cycleFormat?: Handler;
  openAuthority?: Handler;
  insertReport?: Handler;
  assignIssue?: Handler;
  completeIssue?: Handler;
  addRisk?: Handler;
  editRisk?: Handler;
  cycleLike?: Handler;
  cycleImpact?: Handler;
  cycleRating?: Handler;
  cycleStatus?: Handler;
  openExport?: Handler;
  closeExport?: Handler;
  trackChanges?: Handler;
  acceptReportDraft?: Handler;
  rejectReportDraft?: Handler;
  openCheck?: Handler;
  checkPropositions?: Handler;
  sendApproval?: Handler;
  toggleApproveLock?: Handler;
  togglePublish?: Handler;
  approveExport?: Handler;
  openClientReport?: Handler;
  openClientRow?: Handler;
  toggleRequest?: Handler;
  setLibQuery?: Handler;
  toggleFilter?: Handler;
  saveResult?: Handler;
  extractQuote?: Handler;
  summarise?: Handler;
  createTemplate?: Handler;
  pasteTranscript?: Handler;
  distil?: Handler;
};

export const WF = {
  ...RAW,
  delivRows: RAW.delivRows.map((r) => ({ ...r, toggle: () => {} })),
  review: RAW.review.map((r) => ({ ...r, id: "" })),
  drafts: RAW.drafts.map((r) => ({ ...r, id: "" })),
  playbooks: RAW.playbooks.map((p) => ({ ...p, id: "", selected: false })),
  precedents: RAW.precedents.map((p) => ({ ...p, id: "" })),
  /* 4i · 4j working records: the drawing's rows plus the fields the controls change. */
  issueCards: RAW.issueCards.map((c, i) => ({
    ...c,
    assignee: i === 0 ? "A. Osei" : "Unassigned",
    inReport: false,
    done: false,
  })),
  chainSteps: RAW.chainSteps.map((c) => ({ ...c, gap: false })),
  riskRows: RAW.riskRows.map((r) => ({
    ...r,
    override: null as string | null,
    action: r.mit,
    pri: "Short term",
    status: "Open",
  })),
  actionRows: RAW.actionRows.map((a, i) => ({ ...a, status: "Open", key: i })),
  /* 4k–4n: the drawn rows plus what their controls change. */
  healthChecks: RAW.healthChecks.map((h) => ({ ...h, tab: "" })),
  libFilters: RAW.libFilters.map((label) => ({ label, on: true })),
  libResults: RAW.libResults.map((r) => ({ ...r, saved: false })),
  /* Header copy that the drawing hardcodes; screens overwrite these from real data. */
  /** The research matter's own name. Empty until a screen supplies it — never a stand-in. */
  matterTitle: "",
  /** The assistant's current draft for the open note or report. Empty until one exists; nothing stands in for it. */
  draftText: "",
  greeting: "Good afternoon, Jean",
  dateLabel: "Thursday, 6 September",
  resume: {
    name: "Convertible Loan Agreement",
    line: "Clause 3.5 Interest — 2 instructions waiting to be redrafted",
    id: "",
  },
  playbookHead: {
    name: "Convertible loans",
    meta: "Lender side · Switzerland · 24 rules",
    shown: "5 OF 24 SHOWN",
  },
  transcriptHead: { title: "Kickoff call — Helvetia Ventures", meta: "4 September, 41 min" },
  precedentHead: { shown: "5 OF 84 SHOWN", bank: "312 in bank" },
  check: { against: "Convertible loans · 24 rules", within: "21", attention: "3" },
  precedent: {
    name: "Convertible Loan Agreement — Helvetia / Laine",
    meta: "Lender side · Switzerland · executed 4 Apr 2026 · used in 7 drafts",
    state: "Firm approved",
    clauseLabel: "CLAUSE 3.5 · AS EXECUTED",
    clauseTitle: "Interest",
    paragraphs: [
      "Interest shall accrue on the outstanding principal amount of each Drawdown at a rate of 11% per annum, calculated on the basis of the actual number of days elapsed and a 365-day year (pro rata temporis).",
      "Interest accrued becomes due on the Maturity Date, on the date of a Conversion, or on the date of an Event of Default, whichever occurs earlier.",
    ],
    note: "Opened at 8%, settled at 11% after the round slipped two quarters. Borrower resisted compounding; simple interest agreed.",
  },
  summaryIssues: "2 issues found",
  summaryNote:
    "Loan funds are to be used exclusively for the go-to-market strategy of the Borrower's legal technology product. Drawdowns of CHF 5,000,000 fall due on 31 August and 31 December 2026.",
  /* React nodes a screen can drop into the drawing where a real control is needed. */
  slots: {} as {
    chooseFile?: ReactNode;
    paste?: ReactNode;
    mandate?: ReactNode;
    recent?: ReactNode;
  },
  researchType: "simple" as "simple" | "comprehensive",
  allowUpgrade: true,
  draftRejected: false,
  /* 4i analysis of the selected issue; the drawing's Issue 1 by default. */
  selectedIssue: 0,
  analysisFormat: "IRAC",
  analysisTitle: "Issue 1 — termination during probation",
  analysisMeta: "Ghana · Labour Act 2003 (Act 651) · assigned A. Osei",
  analysisPos: "Likely position",
  analysisRisk: "Risk: Medium",
  analysisParts: [
    {
      label: "ISSUE",
      text: "Whether the employer may terminate during probation without notice, and on what terms.",
    },
    {
      label: "RULE",
      text: "Section 27 of Act 651 leaves probationary terms to the contract, subject to the general duty to act fairly.",
      fn: " 1",
    },
    {
      label: "APPLICATION",
      text: "Clause 4 provides one week's notice. F-03 (disputed) records that no review meeting was held, which supports a fair-procedure argument for the employee.",
    },
    {
      label: "CONCLUSION",
      text: "Termination is available on one week's written notice; procedural exposure remains until a review is documented.",
    },
  ] as { label: string; text: string; fn?: string }[],
  counterText:
    "Ashanti Goldfields v. Mensah is cited for a procedural expectation even in probation — treated as contrary authority and addressed in the analysis.",
  gapText:
    "F-05 (notice delivery date) is missing. If notice was delivered after the probation end date, the analysis changes entirely.",
  impactText:
    "No cross-border element on this issue. Operationally, a documented review delays the exit by two days.",
  insertLabel: "Insert into report",
  completeLabel: "Mark complete",
  /* 4k report builder · 4l export · 4n library */
  reportVersion: "v0.4",
  reportLocked: false,
  trackOn: false,
  reportDraftState: "pending" as "pending" | "accepted" | "rejected",
  healthPct: 74,
  openItems: 3,
  openItemsText:
    "2 propositions without authority · 1 authority to verify (Act 703, 2019 amendment) · fact F-05 missing",
  approveLock: false,
  publishClient: false,
  approvalLabel: "Mark as approved",
  libQuery: "probation termination notice Ghana",
  /* Click handlers for elements the drawing shows as static boxes. */
  on: {} as Handlers,
};
