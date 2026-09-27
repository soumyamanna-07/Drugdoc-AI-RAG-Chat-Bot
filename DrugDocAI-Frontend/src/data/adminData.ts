// ── Admin Dashboard Mock Data ─────────────────────────────────────────────────
// All values here can be replaced by real API responses without touching UI code.

// ── Document Library ──────────────────────────────────────────────────────────
export type DocStatus = "Processed" | "Processing" | "Error";
export type FileType = "PDF" | "XLSX" | "DOCX" | "XML";

export interface DocumentRecord {
  id: string;
  fileName: string;
  drug: string;
  source: string;
  fileType: FileType;
  version: string;
  uploadedOn: string;
  status: DocStatus;
  fileUrl?: string;
  fileBlob?: Blob;
}

export const DOCUMENTS: DocumentRecord[] = [
  { id: "d01",  fileName: "amoxicillin_label.pdf",              drug: "Amoxicillin",       source: "FDA",      fileType: "PDF",  version: "v2.1", uploadedOn: "Sep 19, 2026 08:12 AM", status: "Processed"  },
  { id: "d02",  fileName: "metformin_pi.pdf",                   drug: "Metformin",          source: "EMA",      fileType: "PDF",  version: "v1.3", uploadedOn: "Sep 19, 2026 07:46 AM", status: "Processed"  },
  { id: "d03",  fileName: "atorvastatin_guidelines.pdf",        drug: "Atorvastatin",       source: "NIH",      fileType: "PDF",  version: "v3.0", uploadedOn: "Sep 19, 2026 07:30 AM", status: "Processing" },
  { id: "d04",  fileName: "omeprazole_label.pdf",               drug: "Omeprazole",         source: "FDA",      fileType: "PDF",  version: "v1.5", uploadedOn: "Sep 18, 2026 11:22 PM", status: "Processed"  },
  { id: "d05",  fileName: "amlodipine_pi.pdf",                  drug: "Amlodipine",         source: "EMA",      fileType: "PDF",  version: "v1.2", uploadedOn: "Sep 18, 2026 09:14 PM", status: "Error"      },
  { id: "d06",  fileName: "clinical_guidelines_hypertension.pdf",drug: "Hypertension",      source: "WHO",      fileType: "PDF",  version: "v2.0", uploadedOn: "Sep 17, 2026 06:15 PM", status: "Processed"  },
  { id: "d07",  fileName: "ibuprofen_label.pdf",                drug: "Ibuprofen",          source: "FDA",      fileType: "PDF",  version: "v1.8", uploadedOn: "Sep 17, 2026 04:22 PM", status: "Processed"  },
  { id: "d08",  fileName: "paracetamol_pi.pdf",                 drug: "Paracetamol",        source: "MHRA",     fileType: "PDF",  version: "v2.3", uploadedOn: "Sep 16, 2026 02:10 PM", status: "Processed"  },
  { id: "d09",  fileName: "drug_interactions_reference.xlsx",   drug: "Multiple",           source: "Internal", fileType: "XLSX", version: "v1.0", uploadedOn: "Sep 16, 2026 11:05 AM", status: "Processed"  },
  { id: "d10",  fileName: "pediatric_dosing_guidelines.pdf",    drug: "Pediatric Dosing",   source: "AAP",      fileType: "PDF",  version: "v1.1", uploadedOn: "Sep 15, 2026 10:18 AM", status: "Processing" },
  { id: "d11",  fileName: "cetirizine_label.pdf",               drug: "Cetirizine",         source: "FDA",      fileType: "PDF",  version: "v1.0", uploadedOn: "Sep 15, 2026 09:00 AM", status: "Processed"  },
  { id: "d12",  fileName: "metformin_interactions.pdf",         drug: "Metformin",          source: "NIH",      fileType: "PDF",  version: "v2.1", uploadedOn: "Sep 14, 2026 05:30 PM", status: "Processed"  },
  { id: "d13",  fileName: "lisinopril_label.pdf",               drug: "Lisinopril",         source: "EMA",      fileType: "PDF",  version: "v1.7", uploadedOn: "Sep 14, 2026 03:10 PM", status: "Error"      },
  { id: "d14",  fileName: "drug_safety_bulletin_q3.docx",       drug: "Multiple",           source: "Internal", fileType: "DOCX", version: "v1.0", uploadedOn: "Sep 13, 2026 01:00 PM", status: "Processed"  },
  { id: "d15",  fileName: "warfarin_dosing_guide.pdf",          drug: "Warfarin",           source: "MHRA",     fileType: "PDF",  version: "v3.2", uploadedOn: "Sep 12, 2026 10:45 AM", status: "Processed"  },
  { id: "d16",  fileName: "insulin_glargine_pi.pdf",            drug: "Insulin Glargine",   source: "FDA",      fileType: "PDF",  version: "v2.0", uploadedOn: "Sep 11, 2026 08:22 AM", status: "Processing" },
  { id: "d17",  fileName: "omeprazole_interactions.pdf",        drug: "Omeprazole",         source: "EMA",      fileType: "PDF",  version: "v1.1", uploadedOn: "Sep 10, 2026 06:50 PM", status: "Processed"  },
  { id: "d18",  fileName: "salbutamol_inhaler_label.pdf",       drug: "Salbutamol",         source: "MHRA",     fileType: "PDF",  version: "v1.4", uploadedOn: "Sep 9, 2026 04:30 PM",  status: "Processed"  },
  { id: "d19",  fileName: "antifungal_reference_guide.xlsx",    drug: "Ketoconazole",       source: "WHO",      fileType: "XLSX", version: "v1.0", uploadedOn: "Sep 8, 2026 11:00 AM",  status: "Processed"  },
  { id: "d20",  fileName: "clavulanic_acid_label.pdf",          drug: "Amoxicillin",        source: "FDA",      fileType: "PDF",  version: "v1.9", uploadedOn: "Sep 7, 2026 09:15 AM",  status: "Error"      },
  { id: "d21",  fileName: "atorvastatin_interactions.pdf",      drug: "Atorvastatin",       source: "NIH",      fileType: "PDF",  version: "v2.2", uploadedOn: "Sep 6, 2026 07:40 AM",  status: "Processed"  },
  { id: "d22",  fileName: "hypertension_treatment_protocol.pdf",drug: "Hypertension",       source: "WHO",      fileType: "PDF",  version: "v1.5", uploadedOn: "Sep 5, 2026 03:00 PM",  status: "Processed"  },
  { id: "d23",  fileName: "amlodipine_interactions.docx",       drug: "Amlodipine",         source: "Internal", fileType: "DOCX", version: "v1.0", uploadedOn: "Sep 4, 2026 01:30 PM",  status: "Processed"  },
  { id: "d24",  fileName: "ibuprofen_contraindications.pdf",    drug: "Ibuprofen",          source: "MHRA",     fileType: "PDF",  version: "v1.3", uploadedOn: "Sep 3, 2026 10:00 AM",  status: "Processed"  },
  { id: "d25",  fileName: "diabetes_management_guide.pdf",      drug: "Metformin",          source: "AAP",      fileType: "PDF",  version: "v2.4", uploadedOn: "Sep 2, 2026 08:30 AM",  status: "Processing" },
  { id: "d26",  fileName: "paracetamol_overdose_protocol.pdf",  drug: "Paracetamol",        source: "FDA",      fileType: "PDF",  version: "v1.1", uploadedOn: "Sep 1, 2026 07:15 AM",  status: "Processed"  },
];

// Derived unique filter values from DOCUMENTS
export const DOC_SOURCES  = [...new Set(DOCUMENTS.map(d => d.source))].sort();
export const DOC_DRUGS    = [...new Set(DOCUMENTS.map(d => d.drug))].sort();
export const DOC_FILETYPES: FileType[] = ["PDF", "XLSX", "DOCX", "XML"];
export const DOC_STATUSES: DocStatus[] = ["Processed", "Processing", "Error"];


export interface KpiData {
  totalDocuments: number;
  totalDelta: string;
  processedDocuments: number;
  processedDelta: string;
  processingCount: number;
  processingDelta: string;
  processingErrors: number;
  errorsDelta: string;
}

export interface ActivityDay {
  label: string; // e.g. "Aug 20"
  uploaded: number;
  processed: number;
}

export interface SourceSegment {
  name: string;
  count: number;
  color: string;
}

export interface RecentUpload {
  id: string;
  fileName: string;
  source: string;
  status: "Processed" | "Processing" | "Error";
  uploadedOn: string; // formatted date string
}

export interface ActivityLog {
  id: string;
  time: string;
  user: string;
  action: string;
  details: string;
  dotColor: "teal" | "green" | "orange" | "red" | "gray";
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
export const kpiData: KpiData = {
  totalDocuments: 128,
  totalDelta: "+12 this month",
  processedDocuments: 112,
  processedDelta: "+10 this month",
  processingCount: 6,
  processingDelta: "-4 since yesterday",
  processingErrors: 2,
  errorsDelta: "-3 since yesterday",
};

// ── 30-Day Processing Activity ─────────────────────────────────────────────────
export const processingActivity: ActivityDay[] = [
  { label: "Aug 20", uploaded: 2, processed: 1 },
  { label: "Aug 21", uploaded: 4, processed: 2 },
  { label: "Aug 22", uploaded: 3, processed: 3 },
  { label: "Aug 23", uploaded: 5, processed: 3 },
  { label: "Aug 24", uploaded: 4, processed: 4 },
  { label: "Aug 25", uploaded: 6, processed: 4 },
  { label: "Aug 26", uploaded: 5, processed: 5 },
  { label: "Aug 27", uploaded: 7, processed: 5 },
  { label: "Aug 28", uploaded: 6, processed: 6 },
  { label: "Aug 29", uploaded: 8, processed: 6 },
  { label: "Aug 30", uploaded: 9, processed: 7 },
  { label: "Sep 1",  uploaded: 7, processed: 7 },
  { label: "Sep 2",  uploaded: 10, processed: 8 },
  { label: "Sep 3",  uploaded: 8, processed: 8 },
  { label: "Sep 4",  uploaded: 11, processed: 9 },
  { label: "Sep 5",  uploaded: 9, processed: 9 },
  { label: "Sep 6",  uploaded: 12, processed: 10 },
  { label: "Sep 7",  uploaded: 10, processed: 10 },
  { label: "Sep 8",  uploaded: 13, processed: 11 },
  { label: "Sep 9",  uploaded: 14, processed: 11 },
  { label: "Sep 10", uploaded: 12, processed: 12 },
  { label: "Sep 11", uploaded: 15, processed: 12 },
  { label: "Sep 12", uploaded: 18, processed: 13 },
  { label: "Sep 13", uploaded: 20, processed: 14 },
  { label: "Sep 14", uploaded: 19, processed: 15 },
  { label: "Sep 15", uploaded: 16, processed: 14 },
  { label: "Sep 16", uploaded: 14, processed: 13 },
  { label: "Sep 17", uploaded: 13, processed: 12 },
  { label: "Sep 18", uploaded: 12, processed: 11 },
  { label: "Sep 19", uploaded: 11, processed: 10 },
];

// ── Source Distribution ────────────────────────────────────────────────────────
export const sourceDistribution: SourceSegment[] = [
  { name: "FDA Drug Labels",        count: 52, color: "#003d41" },
  { name: "EMA Product Information", count: 29, color: "#12888b" },
  { name: "NIH / MedlinePlus",       count: 18, color: "#7ec8cb" },
  { name: "Clinical Guidelines",     count: 16, color: "#f5c27a" },
  { name: "Other Regulatory Sources",count: 13, color: "#d9a97b" },
];

// ── Recent Uploads ─────────────────────────────────────────────────────────────
export const recentUploads: RecentUpload[] = [
  { id: "u1", fileName: "amoxicillin_label.pdf",        source: "FDA", status: "Processed",  uploadedOn: "Sep 19, 2026\n08:12 AM" },
  { id: "u2", fileName: "metformin_pi.pdf",             source: "EMA", status: "Processed",  uploadedOn: "Sep 19, 2026\n07:46 AM" },
  { id: "u3", fileName: "atorvastatin_guidelines.pdf",  source: "NIH", status: "Processing", uploadedOn: "Sep 19, 2026\n07:30 AM" },
  { id: "u4", fileName: "omeprazole_label.pdf",         source: "FDA", status: "Processed",  uploadedOn: "Sep 18, 2026\n11:22 PM" },
  { id: "u5", fileName: "amlodipine_pi.pdf",            source: "EMA", status: "Error",      uploadedOn: "Sep 18, 2026\n09:14 PM" },
];

// ── Recent Activity Logs ───────────────────────────────────────────────────────
export const recentActivity: ActivityLog[] = [
  { id: "a1", time: "08:53 AM",       user: "admin",  action: "Viewed dashboard",    details: "—",                        dotColor: "gray"   },
  { id: "a2", time: "08:12 AM",       user: "admin",  action: "Uploaded document",   details: "amoxicillin_label.pdf",    dotColor: "teal"   },
  { id: "a3", time: "07:46 AM",       user: "admin",  action: "Uploaded document",   details: "metformin_pi.pdf",         dotColor: "teal"   },
  { id: "a4", time: "07:30 AM",       user: "system", action: "Started processing",  details: "atorvastatin_guidelines.pdf", dotColor: "orange" },
  { id: "a5", time: "06:22 AM",       user: "admin",  action: "Verified document",   details: "clavulanic_acid_label.pdf",dotColor: "green"  },
  { id: "a6", time: "Sep 18, 11:14 PM", user: "system", action: "Processing failed", details: "amlodipine_pi.pdf",       dotColor: "red"    },
  { id: "a7", time: "Sep 18, 10:03 PM", user: "admin",  action: "Added new source",  details: "EMA Product Information",  dotColor: "teal"   },
];

// ── Audit Logs ─────────────────────────────────────────────────────────────────
export type AuditStatus = "Success" | "Warning" | "Error";
export type ActionType =
  | "Login"
  | "File Uploaded"
  | "Document Processed"
  | "Document Indexed"
  | "Processing Failed"
  | "Document Deleted"
  | "Integrity Check"
  | "User Role Updated"
  | "Verification Failed";

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  user: string;
  action: ActionType;
  resource: string;
  details: string;
  status: AuditStatus;
  ipAddress: string;
}

export const AUDIT_LOGS: AuditLogRecord[] = [
  { id: "al-01", timestamp: "Sep 19, 2026 08:14:24 AM", user: "Admin",  action: "Document Processed",  resource: "amoxicillin_label.pdf",              details: "Processing completed successfully", status: "Success", ipAddress: "192.168.1.24" },
  { id: "al-02", timestamp: "Sep 19, 2026 08:12:17 AM", user: "Admin",  action: "File Uploaded",       resource: "amoxicillin_label.pdf",              details: "File uploaded (2.4 MB)",            status: "Success", ipAddress: "192.168.1.24" },
  { id: "al-03", timestamp: "Sep 19, 2026 07:45:11 AM", user: "system", action: "Document Indexed",     resource: "metformin_pi.pdf",                   details: "Document added to vector store",     status: "Success", ipAddress: "127.0.0.1"    },
  { id: "al-04", timestamp: "Sep 19, 2026 07:30:56 AM", user: "Admin",  action: "Login",                resource: "—",                                  details: "Admin logged in",                    status: "Success", ipAddress: "192.168.1.24" },
  { id: "al-05", timestamp: "Sep 18, 2026 11:22:10 PM", user: "Admin",  action: "Processing Failed",   resource: "amlodipine_pi.pdf",                  details: "OCR failed (low image quality)",    status: "Error",   ipAddress: "192.168.1.24" },
  { id: "al-06", timestamp: "Sep 18, 2026 10:54:03 PM", user: "Admin",  action: "File Uploaded",       resource: "amlodipine_pi.pdf",                  details: "File uploaded (1.1 MB)",            status: "Success", ipAddress: "192.168.1.24" },
  { id: "al-07", timestamp: "Sep 18, 2026 09:16:45 PM", user: "Admin",  action: "Document Deleted",    resource: "old_version.pdf",                    details: "Deleted from library",               status: "Warning", ipAddress: "192.168.1.24" },
  { id: "al-08", timestamp: "Sep 17, 2026 06:33:21 PM", user: "system", action: "Integrity Check",     resource: "atorvastatin_guidelines.pdf",        details: "Checksum verified",                  status: "Success", ipAddress: "127.0.0.1"    },
  { id: "al-09", timestamp: "Sep 17, 2026 04:18:09 PM", user: "Admin",  action: "User Role Updated",   resource: "user_23",                            details: "Changed role to Editor",             status: "Success", ipAddress: "192.168.1.24" },
  { id: "al-10", timestamp: "Sep 16, 2026 02:10:37 PM", user: "Admin",  action: "Verification Failed", resource: "paracetamol_pi.pdf",                 details: "Hash mismatch detected",             status: "Error",   ipAddress: "192.168.1.24" },

  // Additional mock records to reach 142 events for pagination demo
  { id: "al-11", timestamp: "Sep 16, 2026 11:05:12 AM", user: "system", action: "Document Processed",  resource: "drug_interactions_reference.xlsx",   details: "Parsed 450 interaction rules",       status: "Success", ipAddress: "127.0.0.1"    },
  { id: "al-12", timestamp: "Sep 15, 2026 04:45:00 PM", user: "Admin",  action: "Login",                resource: "—",                                  details: "Admin logged in",                    status: "Success", ipAddress: "192.168.1.24" },
  { id: "al-13", timestamp: "Sep 15, 2026 03:20:18 PM", user: "system", action: "Integrity Check",     resource: "pediatric_dosing_guidelines.pdf",    details: "Checksum verified",                  status: "Success", ipAddress: "127.0.0.1"    },
  { id: "al-14", timestamp: "Sep 15, 2026 01:12:40 PM", user: "Admin",  action: "Processing Failed",   resource: "corrupted_guidelines.pdf",           details: "Invalid PDF header structure",       status: "Error",   ipAddress: "192.168.1.24" },
  { id: "al-15", timestamp: "Sep 14, 2026 09:10:05 AM", user: "Admin",  action: "Document Deleted",    resource: "deprecated_dosing_v1.pdf",           details: "Replaced with v2.0",                 status: "Warning", ipAddress: "192.168.1.24" },
  { id: "al-16", timestamp: "Sep 14, 2026 08:30:00 AM", user: "Admin",  action: "Login",                resource: "—",                                  details: "Admin logged in",                    status: "Success", ipAddress: "192.168.1.24" },
  { id: "al-17", timestamp: "Sep 13, 2026 05:40:22 PM", user: "system", action: "Document Indexed",     resource: "drug_safety_bulletin_q3.docx",       details: "Document added to vector store",     status: "Success", ipAddress: "127.0.0.1"    },
  { id: "al-18", timestamp: "Sep 13, 2026 02:15:10 PM", user: "Admin",  action: "Verification Failed", resource: "unverified_spec_doc.pdf",             details: "Digital signature missing",          status: "Error",   ipAddress: "192.168.1.24" },
  { id: "al-19", timestamp: "Sep 12, 2026 11:11:00 AM", user: "Admin",  action: "User Role Updated",   resource: "user_42",                            details: "Changed role to Reviewer",           status: "Success", ipAddress: "192.168.1.24" },
  { id: "al-20", timestamp: "Sep 12, 2026 09:05:33 AM", user: "Admin",  action: "File Uploaded",       resource: "warfarin_dosing_guide.pdf",          details: "File uploaded (3.8 MB)",            status: "Success", ipAddress: "192.168.1.24" },
  { id: "al-21", timestamp: "Sep 11, 2026 04:30:19 PM", user: "system", action: "Document Processed",  resource: "insulin_glargine_pi.pdf",            details: "Processing completed successfully", status: "Success", ipAddress: "127.0.0.1"    },
  { id: "al-22", timestamp: "Sep 11, 2026 02:22:04 PM", user: "Admin",  action: "Document Deleted",    resource: "temp_draft_label.pdf",               details: "Draft deleted by user",              status: "Warning", ipAddress: "192.168.1.24" },
  { id: "al-23", timestamp: "Sep 10, 2026 06:14:55 PM", user: "system", action: "Integrity Check",     resource: "omeprazole_interactions.pdf",        details: "Checksum verified",                  status: "Success", ipAddress: "127.0.0.1"    },
  { id: "al-24", timestamp: "Sep 10, 2026 03:00:11 PM", user: "Admin",  action: "Login",                resource: "—",                                  details: "Admin logged in",                    status: "Success", ipAddress: "192.168.1.24" },
  { id: "al-25", timestamp: "Sep 09, 2026 01:45:30 PM", user: "Admin",  action: "Processing Failed",   resource: "salbutamol_scan_bad.png",            details: "Unreadable text in sample image",    status: "Error",   ipAddress: "192.168.1.24" },
];

