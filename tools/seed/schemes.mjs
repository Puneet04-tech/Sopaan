// Scheme seed data for the demo pack. Each rule carries a source URL and the date it was
// last checked; the pack marks them demo-reviewed, not officially approved.
// Field vocabulary: class_level, category, family_income, gender, minority, disability,
// age, education_level, marks_percent, district, tailor_l1_done.

const VERIFIED = "2026-10-10";
const NOTE = "Encoded for the hackathon demo from the public scheme page. Re-verify criteria, income ceilings and deadlines before any real use.";

export const schemes = [
  {
    id: "PMS-OBC-MH",
    name: {
      en: "Post Matric Scholarship — OBC",
      hi: "पोस्ट मैट्रिक छात्रवृत्ति — ओबीसी",
      mr: "पोस्ट मॅट्रिक शिष्यवृत्ती — ओबीसी",
    },
    cluster: "scholarship",
    level: "Class 11 and above",
    source: { url: "https://mahadbt.maharashtra.gov.in/", verified: VERIFIED, note: NOTE },
    criteria: {
      all: [
        { id: "c1", logic: { ">=": [{ var: "class_level" }, 11] }, needs: ["class_level"] },
        { id: "c2", logic: { "==": [{ var: "category" }, "OBC"] }, needs: ["category"] },
        { id: "c3", logic: { "<=": [{ var: "family_income" }, 250000] }, needs: ["family_income"] },
      ],
    },
    documents: ["income_certificate", "caste_certificate", "marksheet", "bank_passbook"],
    deadline: "2026-12-31",
    place: { en: "MahaDBT portal, online", hi: "महाडीबीटी पोर्टल, ऑनलाइन" },
    helper: { name: "Block facilitation centre", phone: "1800-000-000 (demo)" },
    family_voice: {
      clip: "fv-pms-obc",
      en: "Your daughter can apply for the OBC post-matric scholarship. Take the income certificate and caste certificate to the facilitation centre before 31 December.",
      hi: "आपकी बेटी ओबीसी पोस्ट मैट्रिक छात्रवृत्ति के लिए आवेदन कर सकती है। 31 दिसंबर से पहले आय प्रमाण पत्र और जाति प्रमाण पत्र सहायता केंद्र पर ले जाएँ।",
    },
    credits: { pool: "POOL-SKILL-2026", milestone: "TAILOR.L2", amount_inr: 1500 },
    golden: [
      { profile: { class_level: 11, category: "OBC", family_income: 180000 }, expect: "ELIGIBLE" },
      { profile: { class_level: 11, category: "SC", family_income: 180000 }, expect: "NOT:c2" },
      { profile: { class_level: 11, category: "OBC", family_income: 300000 }, expect: "NOT:c3" },
      { profile: {}, expect: "NEED:[category,class_level,family_income]" },
    ],
  },
  {
    id: "PMS-SC-MH",
    name: {
      en: "Post Matric Scholarship — Scheduled Caste",
      hi: "पोस्ट मैट्रिक छात्रवृत्ति — अनुसूचित जाति",
      mr: "पोस्ट मॅट्रिक शिष्यवृत्ती — अनुसूचित जाती",
    },
    cluster: "scholarship",
    level: "Class 11 and above",
    source: { url: "https://mahadbt.maharashtra.gov.in/", verified: VERIFIED, note: NOTE },
    criteria: {
      all: [
        { id: "c1", logic: { ">=": [{ var: "class_level" }, 11] }, needs: ["class_level"] },
        { id: "c2", logic: { "==": [{ var: "category" }, "SC"] }, needs: ["category"] },
        { id: "c3", logic: { "<=": [{ var: "family_income" }, 250000] }, needs: ["family_income"] },
      ],
    },
    documents: ["income_certificate", "caste_certificate", "marksheet", "bank_passbook"],
    deadline: "2026-12-31",
    place: { en: "MahaDBT portal, online", hi: "महाडीबीटी पोर्टल, ऑनलाइन" },
    helper: { name: "Block facilitation centre", phone: "1800-000-000 (demo)" },
    family_voice: {
      clip: "fv-pms-sc",
      en: "The SC post-matric scholarship is available. The application needs the caste certificate, income certificate and last marksheet.",
      hi: "अनुसूचित जाति पोस्ट मैट्रिक छात्रवृत्ति उपलब्ध है। आवेदन के लिए जाति प्रमाण पत्र, आय प्रमाण पत्र और पिछली मार्कशीट चाहिए।",
    },
    credits: { pool: "POOL-SKILL-2026", milestone: "TAILOR.L2", amount_inr: 1500 },
    golden: [
      { profile: { class_level: 12, category: "SC", family_income: 120000 }, expect: "ELIGIBLE" },
      { profile: { class_level: 12, category: "OBC", family_income: 120000 }, expect: "NOT:c2" },
      { profile: { class_level: 12, category: "SC" }, expect: "NEED:[family_income]" },
    ],
  },
  {
    id: "PMS-ST-MH",
    name: {
      en: "Post Matric Scholarship — Scheduled Tribe",
      hi: "पोस्ट मैट्रिक छात्रवृत्ति — अनुसूचित जनजाति",
      mr: "पोस्ट मॅट्रिक शिष्यवृत्ती — अनुसूचित जमाती",
    },
    cluster: "scholarship",
    level: "Class 11 and above",
    source: { url: "https://mahadbt.maharashtra.gov.in/", verified: VERIFIED, note: NOTE },
    criteria: {
      all: [
        { id: "c1", logic: { ">=": [{ var: "class_level" }, 11] }, needs: ["class_level"] },
        { id: "c2", logic: { "==": [{ var: "category" }, "ST"] }, needs: ["category"] },
        { id: "c3", logic: { "<=": [{ var: "family_income" }, 250000] }, needs: ["family_income"] },
      ],
    },
    documents: ["income_certificate", "caste_certificate", "marksheet", "bank_passbook"],
    deadline: "2026-12-31",
    place: { en: "MahaDBT portal, online", hi: "महाडीबीटी पोर्टल, ऑनलाइन" },
    helper: { name: "Ashram school coordinator", phone: "1800-000-000 (demo)" },
    family_voice: {
      clip: "fv-pms-st",
      en: "The ST post-matric scholarship is open. Keep the caste certificate and income certificate ready.",
      hi: "अनुसूचित जनजाति पोस्ट मैट्रिक छात्रवृत्ति खुली है। जाति प्रमाण पत्र और आय प्रमाण पत्र तैयार रखें।",
    },
    credits: { pool: "POOL-SKILL-2026", milestone: "TAILOR.L2", amount_inr: 1500 },
    golden: [
      { profile: { class_level: 11, category: "ST", family_income: 90000 }, expect: "ELIGIBLE" },
      { profile: { class_level: 11, category: "ST", family_income: 400000 }, expect: "NOT:c3" },
      { profile: { class_level: 11, category: "ST" }, expect: "NEED:[family_income]" },
    ],
  },
  {
    id: "VJNT-PMS",
    name: {
      en: "Post Matric Scholarship — VJNT",
      hi: "पोस्ट मैट्रिक छात्रवृत्ति — विमुक्त जाति / भटक्या जमाती",
      mr: "पोस्ट मॅट्रिक शिष्यवृत्ती — विमुक्त जाती / भटक्या जमाती",
    },
    cluster: "scholarship",
    level: "Class 11 and above",
    source: { url: "https://mahadbt.maharashtra.gov.in/", verified: VERIFIED, note: NOTE },
    criteria: {
      all: [
        { id: "c1", logic: { ">=": [{ var: "class_level" }, 11] }, needs: ["class_level"] },
        {
          id: "c2",
          logic: { in: [{ var: "category" }, ["VJNT", "NT"]] },
          needs: ["category"],
        },
        { id: "c3", logic: { "<=": [{ var: "family_income" }, 250000] }, needs: ["family_income"] },
      ],
    },
    documents: ["income_certificate", "caste_certificate", "marksheet", "domicile"],
    deadline: "2026-12-31",
    place: { en: "MahaDBT portal, online", hi: "महाडीबीटी पोर्टल, ऑनलाइन" },
    helper: { name: "Block facilitation centre", phone: "1800-000-000 (demo)" },
    family_voice: {
      clip: "fv-vjnt",
      en: "VJNT and NT students can apply for the post-matric scholarship. A domicile certificate is also needed.",
      hi: "विमुक्त और भटक्या जमाती के विद्यार्थी पोस्ट मैट्रिक छात्रवृत्ति के लिए आवेदन कर सकते हैं। अधिवास प्रमाण पत्र भी चाहिए।",
    },
    credits: { pool: "POOL-SKILL-2026", milestone: "TAILOR.L2", amount_inr: 1500 },
    golden: [
      { profile: { class_level: 11, category: "VJNT", family_income: 200000 }, expect: "ELIGIBLE" },
      { profile: { class_level: 11, category: "NT", family_income: 200000 }, expect: "ELIGIBLE" },
      { profile: { class_level: 11, category: "OPEN", family_income: 200000 }, expect: "NOT:c2" },
      { profile: { class_level: 11 }, expect: "NEED:[category,family_income]" },
    ],
  },
  {
    id: "EBC-GIRLS-MH",
    name: {
      en: "EBC scholarship for girls",
      hi: "आर्थिक रूप से कमजोर वर्ग की छात्राओं के लिए छात्रवृत्ति",
      mr: "आर्थिकदृष्ट्या कमकुवत घटकातील मुलींसाठी शिष्यवृत्ती",
    },
    cluster: "scholarship",
    level: "Class 11 and above",
    source: { url: "https://mahadbt.maharashtra.gov.in/", verified: VERIFIED, note: NOTE },
    criteria: {
      all: [
        { id: "c1", logic: { "==": [{ var: "gender" }, "female"] }, needs: ["gender"] },
        { id: "c2", logic: { ">=": [{ var: "class_level" }, 11] }, needs: ["class_level"] },
        { id: "c3", logic: { "<=": [{ var: "family_income" }, 100000] }, needs: ["family_income"] },
      ],
    },
    documents: ["income_certificate", "domicile", "marksheet", "bank_passbook"],
    deadline: "2026-12-15",
    place: { en: "MahaDBT portal, online", hi: "महाडीबीटी पोर्टल, ऑनलाइन" },
    helper: { name: "Girls' hostel warden", phone: "1800-000-000 (demo)" },
    family_voice: {
      clip: "fv-ebc-girls",
      en: "This scholarship is for girls in class 11 and above whose family income is under one lakh rupees.",
      hi: "यह छात्रवृत्ति कक्षा 11 और उससे ऊपर की उन छात्राओं के लिए है जिनके परिवार की आय एक लाख रुपये से कम है।",
    },
    credits: { pool: "POOL-SKILL-2026", milestone: "TAILOR.L2", amount_inr: 1200 },
    golden: [
      { profile: { gender: "female", class_level: 11, family_income: 90000 }, expect: "ELIGIBLE" },
      { profile: { gender: "male", class_level: 11, family_income: 90000 }, expect: "NOT:c1" },
      { profile: { gender: "female", class_level: 11, family_income: 150000 }, expect: "NOT:c3" },
      { profile: { class_level: 11 }, expect: "NEED:[family_income,gender]" },
    ],
  },
  {
    id: "MINORITY-PMS",
    name: {
      en: "Minority post-matric scholarship",
      hi: "अल्पसंख्यक पोस्ट मैट्रिक छात्रवृत्ति",
      mr: "अल्पसंख्याक पोस्ट मॅट्रिक शिष्यवृत्ती",
    },
    cluster: "scholarship",
    level: "Class 11 and above",
    source: { url: "https://mahadbt.maharashtra.gov.in/", verified: VERIFIED, note: NOTE },
    criteria: {
      all: [
        { id: "c1", logic: { "==": [{ var: "minority" }, true] }, needs: ["minority"] },
        { id: "c2", logic: { ">=": [{ var: "class_level" }, 11] }, needs: ["class_level"] },
        { id: "c3", logic: { "<=": [{ var: "family_income" }, 200000] }, needs: ["family_income"] },
        { id: "c4", logic: { ">=": [{ var: "marks_percent" }, 50] }, needs: ["marks_percent"] },
      ],
    },
    documents: ["income_certificate", "minority_declaration", "marksheet"],
    deadline: "2026-11-30",
    place: { en: "MahaDBT portal, online", hi: "महाडीबीटी पोर्टल, ऑनलाइन" },
    helper: { name: "Minority welfare office", phone: "1800-000-000 (demo)" },
    family_voice: {
      clip: "fv-minority",
      en: "Minority students with at least 50 percent marks can apply. The family income limit is two lakh rupees.",
      hi: "कम से कम 50 प्रतिशत अंक वाले अल्पसंख्यक विद्यार्थी आवेदन कर सकते हैं। पारिवारिक आय की सीमा दो लाख रुपये है।",
    },
    credits: { pool: "POOL-SKILL-2026", milestone: "TAILOR.L2", amount_inr: 1500 },
    golden: [
      {
        profile: { minority: true, class_level: 11, family_income: 150000, marks_percent: 72 },
        expect: "ELIGIBLE",
      },
      {
        profile: { minority: true, class_level: 11, family_income: 150000, marks_percent: 40 },
        expect: "NOT:c4",
      },
      { profile: { class_level: 11, family_income: 150000 }, expect: "NEED:[marks_percent,minority]" },
    ],
  },
  {
    id: "PWD-PMS",
    name: {
      en: "Scholarship for students with disabilities",
      hi: "दिव्यांग विद्यार्थियों के लिए छात्रवृत्ति",
      mr: "दिव्यांग विद्यार्थ्यांसाठी शिष्यवृत्ती",
    },
    cluster: "scholarship",
    level: "Class 9 and above",
    source: { url: "https://mahadbt.maharashtra.gov.in/", verified: VERIFIED, note: NOTE },
    criteria: {
      all: [
        { id: "c1", logic: { "==": [{ var: "disability" }, true] }, needs: ["disability"] },
        { id: "c2", logic: { ">=": [{ var: "class_level" }, 9] }, needs: ["class_level"] },
        { id: "c3", logic: { "<=": [{ var: "family_income" }, 250000] }, needs: ["family_income"] },
      ],
    },
    documents: ["disability_certificate", "income_certificate", "marksheet"],
    deadline: "2026-12-31",
    place: { en: "MahaDBT portal, online", hi: "महाडीबीटी पोर्टल, ऑनलाइन" },
    helper: { name: "Special education coordinator", phone: "1800-000-000 (demo)" },
    family_voice: {
      clip: "fv-pwd",
      en: "A student with a disability certificate can apply from class 9 onward. The disability certificate is the main document.",
      hi: "दिव्यांगता प्रमाण पत्र वाला विद्यार्थी कक्षा 9 से आवेदन कर सकता है। दिव्यांगता प्रमाण पत्र मुख्य दस्तावेज है।",
    },
    credits: { pool: "POOL-SKILL-2026", milestone: "TAILOR.L2", amount_inr: 1500 },
    golden: [
      { profile: { disability: true, class_level: 9, family_income: 200000 }, expect: "ELIGIBLE" },
      { profile: { disability: false, class_level: 9, family_income: 200000 }, expect: "NOT:c1" },
      { profile: { class_level: 9 }, expect: "NEED:[disability,family_income]" },
    ],
  },
  {
    id: "ITI-APPRENTICE",
    name: {
      en: "Apprenticeship (NAPS) — ITI and school leavers",
      hi: "प्रशिक्षुता (नेप्स) — आईटीआई और स्कूल पास",
      mr: "शिकाऊ उमेदवारी (नेप्स) — आयटीआय आणि शाळा उत्तीर्ण",
    },
    cluster: "training",
    level: "Age 14+, Class 8 and above",
    source: {
      url: "https://www.apprenticeshipindia.gov.in/",
      verified: VERIFIED,
      note: NOTE,
    },
    criteria: {
      all: [
        { id: "c1", logic: { ">=": [{ var: "age" }, 14] }, needs: ["age"] },
        {
          id: "c2",
          logic: { in: [{ var: "education_level" }, ["CLASS_8", "CLASS_10", "CLASS_12", "ITI"]] },
          needs: ["education_level"],
        },
      ],
    },
    documents: ["aadhaar_optional", "school_leaving_certificate", "bank_passbook"],
    deadline: "Rolling",
    place: { en: "Apprenticeship India portal; nearest ITI", hi: "अप्रेंटिसशिप इंडिया पोर्टल; नजदीकी आईटीआई" },
    helper: { name: "ITI placement officer", phone: "1800-000-000 (demo)" },
    family_voice: {
      clip: "fv-naps",
      en: "After class 10 an apprenticeship pays a stipend while learning a trade. Register on the apprenticeship portal with the school certificate.",
      hi: "कक्षा 10 के बाद प्रशिक्षुता में काम सीखते हुए वजीफा मिलता है। स्कूल प्रमाण पत्र के साथ पोर्टल पर पंजीकरण करें।",
    },
    credits: { pool: "POOL-SKILL-2026", milestone: "WELD.L1", amount_inr: 2000 },
    golden: [
      { profile: { age: 17, education_level: "CLASS_10" }, expect: "ELIGIBLE" },
      { profile: { age: 13, education_level: "CLASS_10" }, expect: "NOT:c1" },
      { profile: { age: 17 }, expect: "NEED:[education_level]" },
    ],
  },
  {
    id: "PMKVY-SHORT",
    name: {
      en: "Short-term skill training (PMKVY-style)",
      hi: "अल्पकालिक कौशल प्रशिक्षण",
      mr: "अल्पकालीन कौशल्य प्रशिक्षण",
    },
    cluster: "training",
    level: "Age 15–45",
    source: { url: "https://www.pmkvyofficial.org/", verified: VERIFIED, note: NOTE },
    criteria: {
      all: [
        {
          id: "c1",
          logic: { and: [{ ">=": [{ var: "age" }, 15] }, { "<=": [{ var: "age" }, 45] }] },
          needs: ["age"],
        },
        {
          id: "c2",
          logic: { in: [{ var: "education_level" }, ["CLASS_8", "CLASS_10", "CLASS_12"]] },
          needs: ["education_level"],
        },
      ],
    },
    documents: ["aadhaar_optional", "bank_passbook", "photo"],
    deadline: "Rolling",
    place: { en: "Nearest training centre", hi: "नजदीकी प्रशिक्षण केंद्र" },
    helper: { name: "Training centre counsellor", phone: "1800-000-000 (demo)" },
    family_voice: {
      clip: "fv-pmkvy",
      en: "Short skill courses are free for eligible students and finish in two to four months.",
      hi: "पात्र विद्यार्थियों के लिए छोटे कौशल कोर्स मुफ्त हैं और दो से चार महीने में पूरे होते हैं।",
    },
    credits: { pool: "POOL-SKILL-2026", milestone: "TAILOR.L1", amount_inr: 800 },
    golden: [
      { profile: { age: 20, education_level: "CLASS_10" }, expect: "ELIGIBLE" },
      { profile: { age: 50, education_level: "CLASS_10" }, expect: "NOT:c1" },
      { profile: { age: 20, education_level: "NONE" }, expect: "NOT:c2" },
      { profile: { education_level: "CLASS_10" }, expect: "NEED:[age]" },
    ],
  },
  {
    id: "POLY-DIPLOMA",
    name: {
      en: "Polytechnic diploma admission",
      hi: "पॉलिटेक्निक डिप्लोमा प्रवेश",
      mr: "पॉलिटेक्निक डिप्लोमा प्रवेश",
    },
    cluster: "education",
    level: "After Class 10",
    source: {
      url: "https://www.dtemaharashtra.gov.in/",
      verified: VERIFIED,
      note: NOTE,
    },
    criteria: {
      all: [
        { id: "c1", logic: { ">=": [{ var: "class_level" }, 10] }, needs: ["class_level"] },
        { id: "c2", logic: { ">=": [{ var: "marks_percent" }, 35] }, needs: ["marks_percent"] },
      ],
    },
    documents: ["class_10_marksheet", "domicile", "caste_certificate_optional"],
    deadline: "2026-11-20",
    place: { en: "DTE Maharashtra central admission process", hi: "डीटीई महाराष्ट्र केंद्रीय प्रवेश प्रक्रिया" },
    helper: { name: "Polytechnic admission helpline", phone: "1800-000-000 (demo)" },
    family_voice: {
      clip: "fv-poly",
      en: "A three-year polytechnic diploma is possible after class 10 with at least 35 percent marks. The admission form is online.",
      hi: "कक्षा 10 के बाद कम से कम 35 प्रतिशत अंकों के साथ तीन साल का पॉलिटेक्निक डिप्लोमा संभव है। आवेदन ऑनलाइन है।",
    },
    credits: { pool: "POOL-SKILL-2026", milestone: "WELD.L1", amount_inr: 2000 },
    golden: [
      { profile: { class_level: 10, marks_percent: 68 }, expect: "ELIGIBLE" },
      { profile: { class_level: 10, marks_percent: 30 }, expect: "NOT:c2" },
      { profile: { class_level: 10 }, expect: "NEED:[marks_percent]" },
    ],
  },
];
