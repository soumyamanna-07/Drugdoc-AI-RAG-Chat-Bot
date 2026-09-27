import {
  ArrowLeft,
  CircleHelp,
  Mail,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export function Support() {
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
              <CircleHelp size={22} />
            </div>

            <div>
              <p className="text-sm font-medium text-blue-600">
                DrugDoc AI
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                Support
              </h1>
            </div>
          </div>

          <p className="max-w-3xl text-base leading-7 text-slate-600">
            Having trouble using DrugDoc AI? This page covers some of the
            common issues you may encounter while using the prototype and
            provides a few simple ways to troubleshoot them.
          </p>

          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
            If an issue persists, note what you were doing when it occurred
            and any message displayed by the application. This information
            can make it easier to identify the problem.
          </p>
        </div>

        <section className="space-y-4">
          <SupportItem
            title="1. I cannot log in"
            text="Check that you are using the email address and password associated with your account. If the problem continues, return to the login page and try again after checking for any displayed error message."
          />

          <SupportItem
            title="2. My medication is not listed"
            text="Medication availability depends on the documents and data currently available to the application. If a medication does not appear in the selection list, it may not currently be included in the available dataset."
          />

          <SupportItem
            title="3. The AI response does not answer my question"
            text="Try asking the question more specifically or provide additional context. Responses are based on the information available to the system and may not cover every possible interpretation of a question."
          />

          <SupportItem
            title="4. A source is unavailable"
            text="Source availability may depend on the document currently indexed by the system. If a source cannot be opened or displayed, try again later or continue using the available source information shown with the response."
          />

          <SupportItem
            title="5. The information looks incorrect"
            text="AI-generated responses can contain errors or incomplete information. For medically important decisions, verify the information against the original source documents or consult a qualified healthcare professional."
          />

          <SupportItem
            title="6. My conversation context is not behaving as expected"
            text="DrugDoc AI maintains conversational context within a session. If the session reaches its available context limit, the application may provide an option to start a new session while retaining relevant visible conversation history."
          />

          <SupportItem
            title="7. A page or feature is not responding"
            text="Refresh the page and try the action again. If the issue continues, record the page you were using and the action that caused the problem so it can be investigated."
          />

          <SupportItem
            title="8. I found a technical problem"
            text="For technical issues, note the steps that reproduce the problem, the page where it occurred, and any error message displayed. Providing these details helps the development team investigate the issue more efficiently."
          />
        </section>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Mail size={19} />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Contact Support
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                For the prototype, please use the support channel provided by
                your DrugDoc AI project team. Include the issue, the page
                where it occurred, and any relevant error message.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 border-t border-slate-200 pt-6 text-sm">
          <button
            type="button"
            onClick={() => navigate("/privacy")}
            className="text-slate-500 transition hover:text-slate-900"
          >
            Privacy
          </button>

          <button
            type="button"
            onClick={() => navigate("/terms")}
            className="text-slate-500 transition hover:text-slate-900"
          >
            Terms
          </button>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-slate-500 transition hover:text-slate-900"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}

function SupportItem({
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