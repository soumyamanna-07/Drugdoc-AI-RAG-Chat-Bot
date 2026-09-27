import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  FileText,
  Users,
  User,
  Stethoscope,
  Lightbulb,
  Info,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { AppLayout } from "../layouts/AppLayout";
import { exampleDrugs } from "../data/medications";
import { API_BASE, authenticatedFetch } from "../data/api";
import { createChatSession } from "../data/ragService";


export const MedicationSelect: React.FC = () => {
  const navigate = useNavigate();
  const [selectedDrug, setSelectedDrug] = useState("");
  const [selectedMode, setSelectedMode] = useState<"patient" | "professional">("patient");
  const [showWarning, setShowWarning] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [availableDrugs, setAvailableDrugs] = useState<string[]>([]);
  const [drugLoadError, setDrugLoadError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    authenticatedFetch(`${API_BASE}/drugs`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data: { drugs?: string[] }) => {
        if (Array.isArray(data.drugs) && data.drugs.length > 0) {
          setAvailableDrugs(data.drugs);
        }
      })
      .catch(() => setDrugLoadError("Live medication list unavailable. Only indexed medications can be selected."));
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (value: string) => {
    setSelectedDrug(value);
    setShowWarning(false);

    if (value.trim().length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const filtered = availableDrugs.filter((drug) =>
      drug.toLowerCase().includes(value.trim().toLowerCase())
    );
    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  };

  const handleSuggestionClick = (drug: string) => {
    setSelectedDrug(drug);
    setSuggestions([]);
    setShowSuggestions(false);
    setShowWarning(false);
    inputRef.current?.focus();
  };

  const handleChipClick = (drugName: string) => {
    setSelectedDrug(drugName);
    setSuggestions([]);
    setShowSuggestions(false);
    setShowWarning(false);
  };

  const handleClear = () => {
    setSelectedDrug("");
    setSuggestions([]);
    setShowSuggestions(false);
    setShowWarning(false);
    inputRef.current?.focus();
  };

  const handleContinue = async () => {
    if (!selectedDrug.trim()) {
      setShowWarning(true);
      inputRef.current?.focus();
      return;
    }

    if (isCreatingSession) return;

    setShowWarning(false);
    setSessionError(null);
    setIsCreatingSession(true);

    try {
      const session = await createChatSession(selectedDrug.trim());
      navigate(
        `/results?session=${encodeURIComponent(session.session_id)}&drug=${encodeURIComponent(selectedDrug.trim())}&mode=${selectedMode}`
      );
    } catch (error) {
      setSessionError(
        error instanceof Error
          ? error.message
          : "Could not start a new conversation. Please try again."
      );
    } finally {
      setIsCreatingSession(false);
    }
  };

  return (
    <AppLayout className="f02-page">
      <Header showAvatar={true} />

      <section className="f02-container container">
        {/* LEFT COLUMN: INTRO & BENEFITS */}
        <div className="f02-left-col">
          <div className="f02-step-indicator">
            <span className="step-label">STEP 1 OF 2</span>
            <div className="step-bar">
              <span className="step-segment step-active" />
              <span className="step-segment" />
            </div>
          </div>

          <h1 className="f02-heading">
            Let's find the<br />right information.
          </h1>

          <p className="f02-subtext">
            Select a medication and choose your mode to get accurate, evidence-based answers tailored to your needs.
          </p>

          <div className="f02-benefits-list">
            <div className="f02-benefit-item">
              <div className="benefit-icon-badge">
                <Search size={17} />
              </div>
              <div>
                <strong>Search any medication</strong>
                <span>Find brand or generic drugs quickly.</span>
              </div>
            </div>

            <div className="f02-benefit-item">
              <div className="benefit-icon-badge">
                <FileText size={17} />
              </div>
              <div>
                <strong>Evidence-based results</strong>
                <span>Powered by trusted medical sources.</span>
              </div>
            </div>

            <div className="f02-benefit-item">
              <div className="benefit-icon-badge">
                <Users size={17} />
              </div>
              <div>
                <strong>Tailored for you</strong>
                <span>Choose your mode for relevant guidance.</span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: MAIN INTERACTION CARD */}
        <div className="f02-center-col">
          <div className="main-interaction-card">
            <h2 className="card-heading">Select a Medication</h2>
            <p className="card-subtext">Search for a drug by name (brand or generic)</p>

            {/* SEARCH INPUT WITH AUTOCOMPLETE */}
            <div className="drug-search-input-wrap" style={{ flexDirection: "column", alignItems: "stretch", position: "relative", marginBottom: showWarning ? 6 : 22 }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
                <Search size={18} className="search-icon" />
                <input
                  ref={inputRef}
                  type="text"
                  className={`drug-search-input${showWarning ? " drug-search-input--error" : ""}`}
                  placeholder="Type a medication name..."
                  value={selectedDrug}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  autoComplete="off"
                />
                {selectedDrug && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={handleClear}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* AUTOCOMPLETE DROPDOWN */}
              {showSuggestions && (
                <div ref={dropdownRef} className="autocomplete-dropdown">
                  {suggestions.map((drug) => (
                    <button
                      key={drug}
                      type="button"
                      className="autocomplete-option"
                      onMouseDown={(e) => e.preventDefault()} // prevent input blur before click
                      onClick={() => handleSuggestionClick(drug)}
                    >
                      <Search size={13} className="autocomplete-option-icon" />
                      {drug}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* INLINE WARNING */}
            {showWarning && (
              <div className="medication-warning" role="alert">
                <AlertCircle size={14} />
                <span>Please enter or select a medication to continue.</span>
              </div>
            )}

            {/* POPULAR SEARCH CHIPS */}
            <div className="popular-searches-section">
              <h3 className="section-label">Popular Searches</h3>
              <div className="chips-container">
                {availableDrugs.slice(0, 12).map((drug) => (
                  <button
                    key={drug}
                    type="button"
                    className={`drug-chip ${selectedDrug.toLowerCase() === drug.toLowerCase() ? "chip-selected" : ""}`}
                    onClick={() => handleChipClick(drug)}
                  >
                    {drug}
                  </button>
                ))}
              </div>
              {drugLoadError && <p className="form-hint" role="status">{drugLoadError}</p>}
            </div>

            <div className="card-divider" />

            {/* CHOOSE YOUR MODE */}
            <div className="mode-selection-section">
              <h2 className="card-heading">Choose Your Mode</h2>
              <p className="card-subtext">Get information tailored to your role</p>

              <div className="mode-cards-grid">
                {/* PATIENT CARD */}
                <div
                  className={`mode-card ${selectedMode === "patient" ? "mode-selected" : ""}`}
                  onClick={() => setSelectedMode("patient")}
                  role="radio"
                  aria-checked={selectedMode === "patient"}
                  tabIndex={0}
                >
                  <div className="mode-card-header">
                    <div className="mode-icon-circle mode-icon-blush">
                      <User size={20} />
                    </div>
                    <span className={`radio-indicator ${selectedMode === "patient" ? "radio-checked" : ""}`} />
                  </div>
                  <h4 className="mode-title">Patient / Caregiver</h4>
                  <p className="mode-desc">Simple, easy-to-understand information.</p>
                </div>

                {/* HEALTHCARE PROFESSIONAL CARD */}
                <div
                  className={`mode-card ${selectedMode === "professional" ? "mode-selected" : ""}`}
                  onClick={() => setSelectedMode("professional")}
                  role="radio"
                  aria-checked={selectedMode === "professional"}
                  tabIndex={0}
                >
                  <div className="mode-card-header">
                    <div className="mode-icon-circle mode-icon-green">
                      <Stethoscope size={20} />
                    </div>
                    <span className={`radio-indicator ${selectedMode === "professional" ? "radio-checked" : ""}`} />
                  </div>
                  <h4 className="mode-title">Healthcare Professional</h4>
                  <p className="mode-desc">Detailed, technical information with clinical context.</p>
                </div>
              </div>
            </div>

            {sessionError && (
              <div className="medication-warning" role="alert">
                <AlertCircle size={14} />
                <span>{sessionError}</span>
              </div>
            )}

            <button
              className="button button-primary button-large f02-continue-btn"
              onClick={handleContinue}
              disabled={isCreatingSession}
            >
              {isCreatingSession ? "Starting..." : "Continue"} <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: GUIDANCE PANEL */}
        <div className="f02-right-col">
          <div className="guidance-panel">
            <div className="guidance-block">
              <div className="guidance-block-header">
                <div className="guidance-icon-badge">
                  <Lightbulb size={16} />
                </div>
                <h4>Not sure what to search?</h4>
              </div>
              <p>
                <strong>You can enter</strong> a brand name or generic name of the medication.
              </p>
            </div>

            <div className="guidance-divider" />

            <div className="guidance-block">
              <div className="guidance-block-header">
                <div className="guidance-icon-badge">
                  <FileText size={16} />
                </div>
                <h4>Examples</h4>
              </div>
              {/* font-script removed — uses Kalam doctor-note style */}
              <ul className="guidance-examples-list guidance-examples-list-medical">
                {exampleDrugs.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="guidance-divider" />

            <div className="guidance-block">
              <div className="guidance-block-header">
                <div className="guidance-icon-badge guidance-icon-info">
                  <Info size={16} />
                </div>
                <h4>Your data is safe</h4>
              </div>
              <p>We do not store your personal health information.</p>
              <span className="guidance-link">Indexed medications are limited to the verified RAG store.</span>
            </div>
          </div>
        </div>

        {/* DECORATIVE PHARMACEUTICAL ACCENTS AT LOWER RIGHT */}
        <div className="f02-corner-accents" aria-hidden="true">
          <div className="f02-leaf f02-leaf-1" />
          <div className="f02-leaf f02-leaf-2" />
          <div className="f02-blister-pack">
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
          </div>
          <div className="f02-capsule-3d">
            <div className="capsule-half capsule-red" />
            <div className="capsule-half capsule-white" />
            <div className="capsule-shine" />
          </div>
        </div>
      </section>

      <Footer />
    </AppLayout>
  );
};
