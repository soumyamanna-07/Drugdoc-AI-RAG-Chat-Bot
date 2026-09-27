// ─────────────────────────────────────────────────────────────────────────────
// Medication Information Data Definition (MedicationInfo / /medication-info)
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceReference {
  id: number;
  name: string;
  documentId?: string;
}

export interface MedicationInfoDetails {
  medicationId: string;
  name: string;
  description: string;
  drugClass: string;
  overview: string;
  uses: string[];
  availableForms: string[];
  formsNote?: string;
  dosageInformation: string[];
  commonSideEffects: string[];
  sideEffectsNote?: string;
  interactions: string[];
  interactionsNote?: string;
  warnings: string[];
  sources: SourceReference[];
}
