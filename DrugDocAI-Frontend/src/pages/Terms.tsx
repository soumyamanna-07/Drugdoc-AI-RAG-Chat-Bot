import { FileText, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="mb-8 flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to login
        </button>

        <div className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileText size={22} />
            </div>

            <div>
              <p className="text-sm font-medium text-blue-600">
                DrugDoc AI
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                Terms of Service
              </h1>
            </div>
          </div>

          <p className="max-w-3xl text-base leading-7 text-slate-600">
            By using DrugDoc AI, you acknowledge that you are interacting
            with a prototype application designed to explore document-backed
            medication information and AI-assisted question answering.
          </p>

          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
            These terms describe the intended use of the application and the
            responsibilities of users while interacting with the prototype.
            They are intended for this demonstration environment and may be
            updated as the project develops.
          </p>
        </div>

        <section className="space-y-4">
          <TermsItem
            title="1. Acceptable Use"
            text="You may use DrugDoc AI to explore medication information, ask questions about available sources, and interact with the application's document-backed AI features for educational and demonstration purposes."
          />

          <TermsItem
            title="2. Informational Purpose"
            text="Information provided by DrugDoc AI is intended for informational and educational purposes. The application is not intended to replace professional medical advice, diagnosis, treatment, or guidance from a qualified healthcare professional."
          />

          <TermsItem
            title="3. AI-Generated Responses"
            text="Responses are generated using artificial intelligence and available source material. AI-generated information may contain errors, omissions, or incomplete interpretations, and users should verify important information against appropriate authoritative sources."
          />

          <TermsItem
            title="4. Source Limitations"
            text="The accuracy and completeness of an answer may depend on the documents and sources available to the system. A response should not be interpreted as evidence that all relevant medical information has been considered."
          />

          <TermsItem
            title="5. Account Responsibility"
            text="Users are responsible for maintaining the confidentiality of their account credentials and for activity performed through their account. Do not share credentials or provide unnecessary sensitive information through the application."
          />

          <TermsItem
            title="6. Prohibited Use"
            text="Users should not use DrugDoc AI to conduct unlawful activities, attempt to disrupt or compromise the application, misuse uploaded documents, or intentionally submit content designed to interfere with the application's operation."
          />

          <TermsItem
            title="7. Intellectual Property"
            text="The DrugDoc AI application, its interface, original software components, branding, and associated project materials remain subject to the rights of their respective owners. Uploaded documents may remain subject to the rights of their original publishers or owners."
          />

          <TermsItem
            title="8. Availability & Changes"
            text="As a prototype, DrugDoc AI may experience interruptions, changes in functionality, or temporary limitations. Features, sources, workflows, and these terms may be modified as the project evolves."
          />
        </section>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Need help?
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            If you have questions about using DrugDoc AI or encounter a
            problem with the prototype, visit the support page for common
            questions and troubleshooting information.
          </p>

          <button
            type="button"
            onClick={() => navigate("/support")}
            className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Visit Support →
          </button>
        </div>
      </div>
    </div>
  );
}

function TermsItem({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {text}
      </p>
    </article>
  );
}