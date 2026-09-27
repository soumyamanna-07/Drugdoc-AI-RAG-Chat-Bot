import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ShieldCheck, Stethoscope } from "lucide-react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { AppLayout } from "../layouts/AppLayout";

export const Documentation: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const drug = params.get("drug");
  const mode = params.get("mode") || "patient";

  return (
    <AppLayout>
      <Header showAvatar={true} />
      <main className="container" style={{ maxWidth: "860px", padding: "40px 20px 64px" }}>
        <button type="button" className="f06-back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Back
        </button>
        <section className="mi-card" style={{ marginTop: "18px" }}>
          <div className="mi-card-header"><BookOpen size={18} className="mi-card-icon" /><h1 className="mi-card-title">DrugDoc AI Documentation</h1></div>
          <p className="mi-card-body">DrugDoc AI answers medication questions from the indexed drug documents and cites the evidence used for each approved answer.</p>
        </section>
        <div className="mi-grid-2col" style={{ marginTop: "16px" }}>
          <article className="mi-card"><div className="mi-card-header"><ShieldCheck size={18} className="mi-card-icon" /><h2 className="mi-card-title">Evidence and safety</h2></div><p className="mi-card-body">Answers are grounded in uploaded sources, screened for prompt injection, and escalated when reliable evidence is insufficient.</p></article>
          <article className="mi-card"><div className="mi-card-header"><Stethoscope size={18} className="mi-card-icon" /><h2 className="mi-card-title">Modes</h2></div><p className="mi-card-body">Patient mode uses plain language. Healthcare Professional mode keeps clinical terminology and detail.</p></article>
        </div>
        {drug && <button type="button" className="button button-primary" style={{ marginTop: "18px" }} onClick={() => navigate(`/medication-info?drug=${encodeURIComponent(drug)}&mode=${encodeURIComponent(mode)}`)}>View {drug} information</button>}
      </main>
      <Footer />
    </AppLayout>
  );
};
