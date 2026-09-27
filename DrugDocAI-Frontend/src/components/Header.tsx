import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, ShieldCheck, Pill, Home } from "lucide-react";
import { UserAccountDropdown } from "./UserAccountDropdown";

interface HeaderProps {
  showAvatar?: boolean;
  showBackHome?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  showAvatar = false,
  showBackHome = false,
}) => {
  const navigate = useNavigate();

  return (
    <header className="navbar container">
      <Link className="brand" to="/">
        <span className="brand-mark" aria-hidden="true">
          <span className="brand-pill brand-pill-a" />
          <span className="brand-pill brand-pill-b" />
          <span className="brand-pill brand-pill-c" />
        </span>
        <div className="brand-text">
          <span className="brand-name">DrugDoc <b>AI</b></span>
          <span className="brand-subtitle">Better Information. Healthier Decisions.</span>
        </div>
      </Link>

      <div className="header-trust-indicators">
        <div className="trust-item">
          <div className="trust-icon trust-icon-teal">
            <Lock size={15} />
          </div>
          <div className="trust-text">
            <strong>HIPAA Compliant</strong>
            <span>Your data. Our priority.</span>
          </div>
        </div>

        <div className="trust-divider" />

        <div className="trust-item">
          <div className="trust-icon trust-icon-green">
            <ShieldCheck size={16} />
          </div>
          <div className="trust-text">
            <strong>Evidence-based</strong>
            <span>Trusted medical sources.</span>
          </div>
        </div>

        <div className="trust-divider" />

        <div className="trust-item">
          <div className="trust-icon trust-icon-clay">
            <Pill size={16} />
          </div>
          <div className="trust-text">
            <strong>Official Labels Only</strong>
            <span>FDA, EMA and other regulators.</span>
          </div>
        </div>
      </div>

      {showBackHome ? (
        <button
          className="button button-outline navbar-btn back-home-btn"
          onClick={() => navigate("/")}
        >
          <Home size={15} /> Back to Home
        </button>
      ) : showAvatar ? (
        <UserAccountDropdown />
      ) : (
        <button
          className="button button-primary navbar-btn"
          onClick={() => navigate("/login")}
        >
          Get Started <ArrowRight size={16} />
        </button>
      )}
    </header>
  );
};
