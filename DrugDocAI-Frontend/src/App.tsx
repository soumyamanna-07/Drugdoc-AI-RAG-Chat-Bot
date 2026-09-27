import React from "react";
import { Routes, Route } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { MedicationSelect } from "./pages/MedicationSelect";
import { Login } from "./pages/Login";
import { AskQuestion } from "./pages/AskQuestion";
import { SourcesEvidence } from "./pages/SourcesEvidence";
import { Documentation } from "./pages/Documentation";
import { MedicationInfo } from "./pages/MedicationInfo";
import { ProfilePlaceholder } from "./pages/ProfilePlaceholder";
import { RequireAdmin } from "./auth/RequireAdmin";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { DocumentLibrary } from "./pages/admin/DocumentLibrary";
import { UploadProcessing } from "./pages/admin/UploadProcessing";
import { AuditLogs } from "./pages/admin/AuditLogs";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { Support } from "./pages/Support";
import { HumanSupport } from "./pages/admin/HumanSupport";

function App() {
  return (
    <Routes>
      {/* ── User flow ── */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/select" element={<MedicationSelect />} />
      <Route path="/results" element={<AskQuestion />} />
      <Route path="/sources" element={<SourcesEvidence />} />
      <Route path="/medication-info" element={<MedicationInfo />} />
      <Route path="/docs" element={<Documentation />} />
      <Route path="/profile" element={<ProfilePlaceholder />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/support" element={<Support />} />

      {/* ── Admin flow — every route requires a validated admin key ── */}
      <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
      <Route path="/admin/library"   element={<RequireAdmin><DocumentLibrary /></RequireAdmin>} />
      <Route path="/admin/upload"    element={<RequireAdmin><UploadProcessing /></RequireAdmin>} />
      <Route path="/admin/audit"     element={<RequireAdmin><AuditLogs /></RequireAdmin>} />
      <Route path="/admin/support"   element={<RequireAdmin><HumanSupport /></RequireAdmin>} />

      {/* ── Fallback ── */}
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}

export default App;