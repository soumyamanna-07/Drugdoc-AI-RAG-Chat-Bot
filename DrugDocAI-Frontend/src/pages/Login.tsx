import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User as UserIcon,
  Settings,
  ArrowRight,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Header } from "../components/Header";
import { AppLayout } from "../layouts/AppLayout";
import { mockAuth } from "../auth/mockAuth";
import { setAuthToken } from "../auth/adminApi";
import { Footer } from "../components/Footer";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Mode: "login" or "register"
  const [viewMode, setViewMode] = useState<"login" | "register">("login");

  // Login form state
  const [role, setRole] = useState<"user" | "admin">("user");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Registration form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [regError, setRegError] = useState("");
  const [isRegLoading, setIsRegLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");

  const handleGoogleSignIn = async () => {
    setGoogleError("");
    try {
      const response = await fetch(`${API_BASE}/auth/google/start`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Google sign-in is unavailable.");
      window.location.assign(data.authorization_url);
    } catch (oauthError) {
      setGoogleError(oauthError instanceof Error ? oauthError.message : "Google sign-in is unavailable.");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const oauthToken = params.get("oauth_token");
    const oauthError = params.get("oauth_error");
    if (oauthToken) {
      try {
        const payload = oauthToken.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
        const user = JSON.parse(atob(payload + "=".repeat((4 - payload.length % 4) % 4)));
        setAuthToken(oauthToken);
        localStorage.setItem("drugdoc_mock_user", JSON.stringify(user));
        navigate(user.role === "admin" ? "/admin" : "/select", { replace: true });
        return;
      } catch {
        setError("Google sign-in returned an invalid session.");
      }
    }
    if (oauthError) setError(oauthError);
    if (location.hash === "#register") {
      setViewMode("register");
      setRole("user");
    } else if (location.hash === "#admin") {
      setViewMode("login");
      setRole("admin");
    } else {
      setViewMode("login");
      setRole("user");
    }
  }, [location.hash]);

  const handleRoleSwitch = (newRole: "user" | "admin") => {
    setRole(newRole);
    setError("");
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!identifier.trim()) {
      setError(
        role === "admin"
          ? "Please enter your admin ID."
          : "Please enter your email or phone number."
      );
      return;
    }

    if (!password.trim()) {
      setError(
        role === "admin" ? "Please enter your administrator password." : "Please enter your password."
      );
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);
    try {
      if (role === "admin") {
        const res = await mockAuth.login(identifier, password, "admin");
        if (res.success) navigate("/admin");
        else setError(res.error || "Administrator authentication failed.");
      } else {
        // User path: existing mock auth, unchanged.
        const res = await mockAuth.login(identifier, password, "user");
        if (res.success) {
          navigate("/select");
        } else {
          setError(res.error || "Authentication failed. Please check your credentials.");
        }
      }
    } catch {
      setError("An error occurred during authentication.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");

    if (!regName.trim()) {
      setRegError("Please enter your full name.");
      return;
    }

    if (!regEmail.trim()) {
      setRegError("Please enter your email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail.trim())) {
      setRegError("Please enter a valid email address.");
      return;
    }

    if (!regPassword) {
      setRegError("Please create a password.");
      return;
    }

    if (regPassword.length < 8) {
      setRegError("Password must be at least 8 characters long.");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setRegError("Passwords do not match.");
      return;
    }

    if (!agreeTerms) {
      setRegError("You must agree to the Terms of Service and Privacy Policy to create an account.");
      return;
    }

    setIsRegLoading(true);
    try {
      const res = await mockAuth.register(regName, regEmail, regPassword);
      if (res.success) {
        navigate("/select");
      } else {
        setRegError(res.error || "Failed to create account. Please try again.");
      }
    } catch {
      setRegError("An error occurred during registration.");
    } finally {
      setIsRegLoading(false);
    }
  };

  const switchMode = (mode: "login" | "register") => {
    setViewMode(mode);
    setError("");
    setRegError("");
    if (mode === "register") {
      window.location.hash = "register";
    } else {
      window.location.hash = "";
    }
  };

  return (
    <AppLayout className="login-page-layout">
      <Header showBackHome={true} />

      <section className="login-container container">
        {/* SURROUNDING PHARMACEUTICAL & BOTANICAL ACCENTS (LEFT) */}
        <div className="login-accents-left" aria-hidden="true">
          <div className="login-leaf login-leaf-left" />
          <div className="login-script-text font-script text-left-script">
            Knowledge<br />
            for a healthier<br />
            tomorrow.
          </div>
          <div className="login-blister-pack blister-left">
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
          </div>
        </div>

        {/* MAIN CARD: LOGIN OR REGISTER */}
        <div className="login-card-wrap">
          {viewMode === "register" ? (
            /* CREATE ACCOUNT CARD */
            <div className="login-card card-user-mode register-card">
              {/* BACK TO SIGN IN ACTION */}
              <button
                type="button"
                className="register-back-btn"
                onClick={() => switchMode("login")}
              >
                <ArrowLeft size={16} />
                <span>Back to Sign In</span>
              </button>

              {/* CARD HEADER */}
              <div className="login-card-header register-card-header">
                <h1 className="login-title">Create your account</h1>
                <p className="login-subtext">
                  Join DrugDoc AI and get trusted, evidence-based medication information.
                </p>
              </div>

              {/* ERROR ALERT */}
              {regError && (
                <div className="login-error-banner">
                  <AlertCircle size={16} />
                  <span>{regError}</span>
                </div>
              )}

              {/* REGISTER FORM */}
              <form onSubmit={handleRegisterSubmit} className="login-form">
                {/* FULL NAME */}
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <div className="input-with-icon">
                    <UserIcon size={17} className="input-icon" />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Enter your full name"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                    />
                  </div>
                </div>

                {/* EMAIL */}
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <div className="input-with-icon">
                    <Mail size={17} className="input-icon" />
                    <input
                      type="email"
                      className="form-input"
                      placeholder="Enter your email address"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                    />
                  </div>
                </div>

                {/* PASSWORD */}
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="input-with-icon">
                    <Lock size={17} className="input-icon" />
                    <input
                      type={showRegPassword ? "text" : "password"}
                      className="form-input password-input"
                      placeholder="Create a password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      aria-label={showRegPassword ? "Hide password" : "Show password"}
                    >
                      {showRegPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <span className="password-hint">
                    Use at least 8 characters with a mix of letters, numbers and symbols.
                  </span>
                </div>

                {/* CONFIRM PASSWORD */}
                <div className="form-group">
                  <label className="form-label">Confirm Password</label>
                  <div className="input-with-icon">
                    <Lock size={17} className="input-icon" />
                    <input
                      type={showRegConfirmPassword ? "text" : "password"}
                      className="form-input password-input"
                      placeholder="Confirm your password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                      aria-label={showRegConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showRegConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {/* TERMS OF SERVICE CHECKBOX */}
                <div className="register-terms-group">
                  <label className="register-terms-label">
                    <input
                      type="checkbox"
                      className="register-checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                    />
                    <span>
                      I agree to the{" "}
                      <a href="/terms" className="terms-link">
                        Terms
                      </a>{" "}
                      and{" "}
                      <a href="/privacy" className="terms-link">
                        Privacy Policy
                      </a>
                    </span>
                  </label>
                </div>

                {/* CREATE ACCOUNT SUBMIT BUTTON */}
                <button
                  type="submit"
                  className="button button-large button-primary login-submit-btn"
                  disabled={isRegLoading}
                >
                  {isRegLoading ? "Creating Account..." : "Create Account"}{" "}
                  <ArrowRight size={18} />
                </button>
              </form>

              {/* EXTRA OPTIONS (OR divider + Google + Sign In link) */}
              <div className="user-extra-options">
                <div className="login-or-divider">
                  <span>OR</span>
                </div>

                <button type="button" className="google-sign-in-btn" onClick={handleGoogleSignIn}>
                  <svg className="google-icon" width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
                {googleError && <p className="login-error-banner" role="alert">{googleError}</p>}

                <div className="create-account-wrap">
                  <span>Already have an account?</span>{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="create-account-link register-signin-btn"
                  >
                    Sign in
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* SIGN IN CARD */
            <div className={`login-card ${role === "admin" ? "card-admin-mode" : "card-user-mode"}`}>
              {/* CARD HEADER */}
              <div className="login-card-header">
                <h1 className="login-title">
                  {role === "admin" ? "Admin Access" : "Welcome to DrugDoc AI"}
                </h1>
                <p className="login-subtext">
                  {role === "admin"
                    ? "Sign in to access the administration dashboard."
                    : "Sign in to continue to safer, evidence-based medication information."}
                </p>
              </div>

              {/* ROLE SELECTOR CARDS */}
              <div className="role-selector-grid">
                {/* USER ROLE CARD */}
                <div
                  className={`role-card ${role === "user" ? "role-selected role-user-selected" : ""}`}
                  onClick={() => handleRoleSwitch("user")}
                  role="radio"
                  aria-checked={role === "user"}
                  tabIndex={0}
                >
                  <div className="role-icon-circle role-icon-blush">
                    <UserIcon size={18} />
                  </div>
                  <div className="role-card-text">
                    <strong className="role-title">User</strong>
                    <span className="role-sub">Patient / Caregiver</span>
                  </div>
                  <span className={`role-radio-dot ${role === "user" ? "radio-dot-checked radio-dot-clay" : ""}`} />
                </div>

                {/* ADMIN ROLE CARD */}
                <div
                  className={`role-card ${role === "admin" ? "role-selected role-admin-selected" : ""}`}
                  onClick={() => handleRoleSwitch("admin")}
                  role="radio"
                  aria-checked={role === "admin"}
                  tabIndex={0}
                >
                  <div className="role-icon-circle role-icon-green">
                    <Settings size={18} />
                  </div>
                  <div className="role-card-text">
                    <strong className="role-title">Admin</strong>
                    <span className="role-sub">Administration</span>
                  </div>
                  <span className={`role-radio-dot ${role === "admin" ? "radio-dot-checked radio-dot-teal" : ""}`} />
                </div>
              </div>

              {/* ERROR ALERT */}
              {error && (
                <div className="login-error-banner">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {/* LOGIN FORM */}
              <form onSubmit={handleLoginSubmit} className="login-form">
                {/* IDENTIFIER FIELD */}
                <div className="form-group">
                  <label className="form-label">
                    {role === "admin" ? "Admin ID or Email" : "Email or Phone"}
                  </label>
                  <div className="input-with-icon">
                    <Mail size={17} className="input-icon" />
                    <input
                      type="text"
                      className="form-input"
                      placeholder={
                        role === "admin"
                          ? "Enter your admin ID or email"
                          : "Enter your email or phone number"
                      }
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                    />
                  </div>
                </div>

                {/* PASSWORD FIELD */}
                <div className="form-group">
                  <label className="form-label">
                    {role === "admin" ? "Administrator Password" : "Password"}
                  </label>
                  <div className="input-with-icon">
                    <Lock size={17} className="input-icon" />
                    <input
                      type={showPassword ? "text" : "password"}
                      className="form-input password-input"
                      placeholder={
                        role === "admin" ? "Enter your administrator password" : "Enter your password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={role === "admin" ? "off" : "current-password"}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={role === "user" ? () => setShowPassword(!showPassword) : undefined}
                      onMouseDown={role === "admin" ? () => setShowPassword(true) : undefined}
                      onMouseUp={role === "admin" ? () => setShowPassword(false) : undefined}
                      onMouseLeave={role === "admin" ? () => setShowPassword(false) : undefined}
                      onTouchStart={role === "admin" ? () => setShowPassword(true) : undefined}
                      onTouchEnd={role === "admin" ? () => setShowPassword(false) : undefined}
                      aria-label={role === "admin" ? "Hold to reveal key" : (showPassword ? "Hide password" : "Show password")}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {role === "user" && (
                    <div className="forgot-password-wrap">
                      <a href="#forgot" className="forgot-password-link">
                        Forgot password?
                      </a>
                    </div>
                  )}
                </div>

                {/* SUBMIT BUTTON */}
                <button
                  type="submit"
                  className={`button button-large login-submit-btn ${role === "admin" ? "button-admin-primary" : "button-primary"
                    }`}
                  disabled={isLoading}
                >
                  {isLoading ? "Signing In..." : "Sign In"} <ArrowRight size={18} />
                </button>
              </form>

              {/* USER-ONLY EXTRA OPTIONS */}
              {role === "user" && (
                <div className="user-extra-options">
                  <div className="login-or-divider">
                    <span>OR</span>
                  </div>

                  <button type="button" className="google-sign-in-btn" onClick={handleGoogleSignIn}>
                    <svg className="google-icon" width="18" height="18" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </button>
                  {googleError && <p className="login-error-banner" role="alert">{googleError}</p>}

                  <div className="create-account-wrap">
                    <span>Don't have an account?</span>{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("register")}
                      className="create-account-link register-signin-btn"
                    >
                      Create one
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SURROUNDING PHARMACEUTICAL & BOTANICAL ACCENTS (RIGHT) */}
        <div className="login-accents-right" aria-hidden="true">
          <div className="login-leaf login-leaf-right" />
          <div className="login-script-text font-script text-right-script">
            Better<br />
            information.<br />
            Healthier<br />
            decisions.
          </div>
          <div className="login-capsule-3d">
            <div className="capsule-half capsule-red" />
            <div className="capsule-half capsule-white" />
            <div className="capsule-shine" />
          </div>
          <div className="login-tablet login-tablet-1" />
          <div className="login-tablet login-tablet-2" />
          <div className="login-blister-pack blister-right">
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
            <div className="blister-pocket"><span className="blister-pill" /></div>
          </div>
        </div>
      </section>
      <Footer />
    </AppLayout>
  );
};
