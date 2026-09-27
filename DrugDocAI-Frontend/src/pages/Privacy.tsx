import { ShieldCheck, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function Privacy() {
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
              <ShieldCheck size={22} />
            </div>

            <div>
              <p className="text-sm font-medium text-blue-600">
                DrugDoc AI
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                Privacy
              </h1>
            </div>
          </div>

          <p className="max-w-3xl text-base leading-7 text-slate-600">
            DrugDoc AI is designed to help users explore medication
            information and interact with document-backed AI responses.
            This page explains, in simple terms, how information may be
            handled within the prototype.
          </p>

          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
            Because DrugDoc AI is currently a prototype, this page describes
            the application's intended information-handling practices rather
            than serving as a substitute for a formal legal privacy policy.
          </p>
        </div>

        <section className="space-y-4">
          <PrivacyItem
            title="1. Account Information"
            text="When you create an account, the application may store basic account information such as your name, email address, and authentication-related information required to provide access to the service."
          />

          <PrivacyItem
            title="2. Questions & Conversations"
            text="Questions submitted to DrugDoc AI and the resulting conversation history may be stored so that the application can maintain context between related questions and display previous interactions during a session."
          />

          <PrivacyItem
            title="3. Medication & Document Data"
            text="Medication selections, uploaded documents, and information retrieved from indexed sources may be processed by the application to generate document-backed responses. The system is intended to use available source material when answering medication-related questions."
          />

          <PrivacyItem
            title="4. Session Information"
            text="The application may maintain a session identifier to connect related questions and responses. Session information helps the system preserve conversational context without requiring the user to repeat earlier questions."
          />

          <PrivacyItem
            title="5. Audit & Usage Records"
            text="Certain actions within the application may be recorded in audit or usage logs, particularly administrative actions such as document uploads, processing, access, or other management activity."
          />

          <PrivacyItem
            title="6. Data Retention"
            text="Information may remain stored for as long as it is required for the application's prototype functionality, testing, demonstration, or audit requirements. Retention and deletion policies may change as the project evolves."
          />

          <PrivacyItem
            title="7. Third-Party Services"
            text="DrugDoc AI may rely on external infrastructure or AI services to provide parts of its functionality. Information processed by such services is subject to the configuration and policies of those services."
          />

          <PrivacyItem
            title="8. Your Responsibility"
            text="Users should avoid submitting sensitive personal information that is not necessary for the application's intended use. DrugDoc AI should not be treated as a secure repository for confidential medical records or other highly sensitive information."
          />
        </section>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Questions about privacy?
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            If you encounter a privacy-related issue while using the
            prototype, please contact the DrugDoc AI support team through the
            available support channel.
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

function PrivacyItem({
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