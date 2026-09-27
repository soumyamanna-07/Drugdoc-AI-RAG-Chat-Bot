import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, AlertTriangle, Leaf } from "lucide-react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { AppLayout } from "../layouts/AppLayout";
import { ragCapabilities } from "../data/medications";

export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [animStep, setAnimStep] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setAnimStep(isExpanded ? 12 : 1);
      return;
    }

    const interval = setInterval(() => {
      setAnimStep((prev) => {
        if (!isExpanded && prev >= 1) {
          return 1;
        }
        if (prev >= 12) {
          return 12;
        }
        return prev + 1;
      });
    }, 450);

    return () => clearInterval(interval);
  }, [isExpanded]);

  return (
    <AppLayout>
      <Header showAvatar={false} />

      {/* HERO SECTION */}
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow">AI-POWERED DRUG DOCUMENTATION</span>
          <h1>
            Smarter Answers.
            <span> Safer Choices.</span>
          </h1>
          <p>
            Your trusted AI assistant for medication information,
            drug documentation, interactions and general guidance.
          </p>

          <div className="hero-actions">
            <button
              className="button button-primary button-large"
              onClick={() => navigate("/login")}
            >
              Get Started <ArrowRight size={18} />
            </button>
            <button
              className="button button-outline button-large"
              onClick={() => setIsExpanded(true)}
            >
              Learn More
            </button>
          </div>

          <div className="hero-micro-text">
            <span>ACCURATE INFORMATION</span>
            <span className="dot">•</span>
            <span>CLEAR EXPLANATIONS</span>
            <span className="dot">•</span>
            <span>SAFER DECISIONS</span>
          </div>
        </div>

        {/* HERO RIGHT: PRESCRIPTION DOCUMENT & PHARMACEUTICAL ELEMENTS */}
        <div className="hero-art-container" aria-label="DrugDoc AI RAG Capabilities Prescription Sheet">
          <div className="floating-badge-card">
            <span className="badge-line1">TRUSTED</span>
            <span className="badge-line2">SOURCES</span>
            <span className="badge-line3">SAFER CARE</span>
          </div>

          <div className="rx-mat-dark" />
          <div className="rx-mat-light" />
          <div className="rx-mat-paper" />

          <div className="rx-leaf rx-leaf-top-left" />
          <div className="rx-leaf rx-leaf-top-right" />
          <div className="rx-leaf rx-leaf-mid-right" />
          <div className="rx-leaf rx-leaf-bottom-right" />

          <div className="rx-capsule-3d">
            <div className="capsule-half capsule-red" />
            <div className="capsule-half capsule-white" />
            <div className="capsule-shine" />
          </div>

          <div className="rx-tablet rx-tablet-1" />
          <div className="rx-tablet rx-tablet-2" />

          <div className="rx-blister-pack">
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-label">TRUSTED<br />SOURCES</div>
          </div>

          <article className={`rx-sheet ${animStep >= 0 ? "step-active" : ""}`}>
            <div className={`rx-header ${animStep >= 1 ? "anim-visible" : "anim-hidden"}`}>
              <div className="rx-symbol">Rx</div>
              <div className="rx-brand-header">
                <div className="rx-brand-logo">
                  <span className="brand-mark brand-mark-sm">
                    <span className="brand-pill brand-pill-a" />
                    <span className="brand-pill brand-pill-b" />
                    <span className="brand-pill brand-pill-c" />
                  </span>
                  <span className="rx-brand-name">DrugDoc <b>AI</b></span>
                </div>
                <span className="rx-brand-sub">AI for Safer Medication Decisions</span>
              </div>
            </div>

            <div className={`rx-divider ${animStep >= 1 ? "anim-visible" : "anim-hidden"}`} />

            <div className={`rx-meta ${animStep >= 1 ? "anim-visible" : "anim-hidden"}`}>
              <span>Date: <span className="rx-meta-fill">______________</span></span>
              <span>Ref: <strong>DD-AI-001</strong></span>
            </div>

            <div className={`rx-divider ${animStep >= 1 ? "anim-visible" : "anim-hidden"}`} />

            <h2 className={`rx-title ${animStep >= 2 ? "anim-visible" : "anim-hidden"}`}>
              RAG CAPABILITIES
            </h2>

            <ul className="rx-capabilities-list">
              {ragCapabilities.map((cap, idx) => {
                const isItemVisible = animStep >= 3 + idx;
                return (
                  <li
                    key={cap}
                    className={`rx-cap-item ${isItemVisible ? "anim-visible" : "anim-hidden"}`}
                  >
                    <span className="rx-checkbox">
                      <Check size={11} strokeWidth={3.5} />
                    </span>
                    <span className="rx-cap-text">{cap}</span>
                  </li>
                );
              })}
            </ul>

            <div className={`rx-sheet-footer ${animStep >= 11 ? "anim-visible" : "anim-hidden"}`}>
              <div className="rx-script-note font-script">
                Information for a<br />
                <em>Healthier Tomorrow.</em>
              </div>
              <div className="rx-signature-block">
                <div className="rx-signature font-script">DrugDoc AI</div>
                <div className="rx-sig-divider" />
                <div className="rx-sig-sub">KNOWLEDGE  ·  SAFETY  ·  TRUST</div>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* MEDICAL DISCLAIMER SECTION (F01 ONLY) */}
      <section className="disclaimer-section container">
        <div className="disclaimer-card">
          <div className="disclaimer-icon-wrap">
            <AlertTriangle className="disclaimer-icon" size={24} />
          </div>
          <div className="disclaimer-content">
            <h3 className="disclaimer-title">Medical documentation assistant</h3>
            <p className="disclaimer-text">
              Not a replacement for professional medical advice. Always consult a qualified healthcare provider.
            </p>
          </div>
          <div className="disclaimer-side-badge">
            <Leaf size={16} className="disclaimer-leaf" />
            <span className="disclaimer-script font-script">
              Informed choices.<br />
              <em>Healthier tomorrows.</em>
            </span>
          </div>
        </div>
      </section>

      <Footer />
    </AppLayout>
  );
};
