import React from "react";
import { Leaf } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface FooterProps {
  isMinimal?: boolean;
}

export const Footer: React.FC<FooterProps> = () => {
  const navigate = useNavigate();

  return (
    <footer className="landing-footer">
      <div className="container footer-content">
        <div className="footer-left">
          <span>© 2026 DrugDoc AI</span>

          <span className="footer-sep">|</span>

          <span className="footer-links">
            <button
              type="button"
              onClick={() => navigate("/privacy")}
              className="footer-link-button"
            >
              Privacy
            </button>

            <span className="dot">•</span>

            <button
              type="button"
              onClick={() => navigate("/terms")}
              className="footer-link-button"
            >
              Terms
            </button>

            <span className="dot">•</span>

            <button
              type="button"
              onClick={() => navigate("/support")}
              className="footer-link-button"
            >
              Support
            </button>
          </span>
        </div>

        <div className="footer-right">
          <Leaf size={14} className="footer-leaf-icon" />
          <span className="footer-tagline">
            Built for a healthier, more informed world.
          </span>
        </div>
      </div>
    </footer>
  );
};