// ─────────────────────────────────────────────────────────────────────────────
// Evidence & Sources Data Definition (F05)
// Designed for seamless future backend integration.
// ─────────────────────────────────────────────────────────────────────────────

export interface EvidenceSource {
  documentId: string;
  name: string;
  organization: string;
  sourceType: "Official Label" | "Trusted Medical Source" | string;
  updatedAt: string;
  accessedAt: string;
  excerpt: string;
}

export const MOCK_EVIDENCE_SOURCES: Record<string, EvidenceSource[]> = {
  Amoxicillin: [
    {
      documentId: "doc_fda_amoxicillin_001",
      name: "FDA Drug Label (Amoxicillin)",
      organization: "U.S. Food & Drug Administration",
      sourceType: "Official Label",
      updatedAt: "Jan 2024",
      accessedAt: "Sep 15, 2026",
      excerpt:
        "Gastrointestinal adverse reactions, including nausea, vomiting, and diarrhoea, have been reported in clinical trials and postmarketing experience...",
    },
    {
      documentId: "doc_ema_amoxicillin_002",
      name: "EMA Product Information",
      organization: "European Medicines Agency",
      sourceType: "Official Label",
      updatedAt: "Dec 2023",
      accessedAt: "Sep 15, 2026",
      excerpt:
        "Common side effects include gastrointestinal disturbances (nausea, vomiting, diarrhoea) and skin reactions such as rash. These are usually mild and transient...",
    },
    {
      documentId: "doc_nih_amoxicillin_003",
      name: "MedlinePlus (NIH)",
      organization: "U.S. National Library of Medicine",
      sourceType: "Trusted Medical Source",
      updatedAt: "Aug 2023",
      accessedAt: "Sep 15, 2026",
      excerpt:
        "Amoxicillin may cause side effects such as nausea, vomiting, diarrhoea, headache, or rash. These effects are usually mild, but persistent or severe symptoms...",
    },
  ],
};

// Fallback sources generator if drug-specific sources are requested
export function getSourcesForDrug(drugName: string): EvidenceSource[] {
  const normalized = drugName.trim();
  if (MOCK_EVIDENCE_SOURCES[normalized]) {
    return MOCK_EVIDENCE_SOURCES[normalized];
  }

  // Generates drug-tailored mock sources for any requested drug
  return [
    {
      documentId: `doc_fda_${normalized.toLowerCase()}_001`,
      name: `FDA Drug Label (${normalized})`,
      organization: "U.S. Food & Drug Administration",
      sourceType: "Official Label",
      updatedAt: "Jan 2024",
      accessedAt: "Sep 15, 2026",
      excerpt: `Official prescribing information and safety guidelines for ${normalized}, including indication, dosage, precautions, and adverse reactions...`,
    },
    {
      documentId: `doc_ema_${normalized.toLowerCase()}_002`,
      name: "EMA Product Information",
      organization: "European Medicines Agency",
      sourceType: "Official Label",
      updatedAt: "Dec 2023",
      accessedAt: "Sep 15, 2026",
      excerpt: `Summary of Product Characteristics (SmPC) for ${normalized}. Details therapeutic indications, contraindications, and clinical trial safety data...`,
    },
    {
      documentId: `doc_nih_${normalized.toLowerCase()}_003`,
      name: "MedlinePlus (NIH)",
      organization: "U.S. National Library of Medicine",
      sourceType: "Trusted Medical Source",
      updatedAt: "Aug 2023",
      accessedAt: "Sep 15, 2026",
      excerpt: `Consumer health information for ${normalized}. Explains proper administration, potential interactions, common side effects, and storage instructions...`,
    },
  ];
}
