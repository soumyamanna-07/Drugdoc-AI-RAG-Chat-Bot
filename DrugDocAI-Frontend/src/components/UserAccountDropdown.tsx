import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, User, Mail, Lock, LogOut } from "lucide-react";
import { useCurrentUser } from "../hooks/useCurrentUser";

export const UserAccountDropdown: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useCurrentUser();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleDropdown = () => {
    setIsOpen((prev) => !prev);
  };

  const handleProfileClick = () => {
    setIsOpen(false);
    navigate("/profile");
  };

  const handleChangeEmailClick = () => {
    setIsOpen(false);
    // Placeholder action: easy to connect to profile / backend modal flow
    console.log("Change Email action triggered");
  };

  const handleSecurityClick = () => {
    setIsOpen(false);
    // Placeholder action: easy to connect to future password / security settings
    console.log("Security settings action triggered");
  };

  const handleSignOutClick = () => {
    setIsOpen(false);
    logout();
    navigate("/login");
  };

  return (
    <div className="user-account-dropdown-wrapper" ref={containerRef}>
      <button
        type="button"
        className={`user-avatar-pill ${isOpen ? "user-avatar-pill--active" : ""}`}
        onClick={toggleDropdown}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User account menu"
      >
        <span className="avatar-circle">{user.avatarInitial}</span>
        <ChevronDown size={14} className={`avatar-chevron ${isOpen ? "avatar-chevron--rotated" : ""}`} />
      </button>

      {isOpen && (
        <div className="user-account-menu" role="menu" aria-label="User account details">
          {/* Header showing avatar, full name, and email */}
          <div className="user-account-header">
            <div className="avatar-circle avatar-circle--lg">
              {user.avatarInitial}
            </div>
            <div className="user-account-meta">
              <span className="user-account-name">{user.name}</span>
              <span className="user-account-email">{user.email}</span>
            </div>
          </div>

          <div className="user-account-divider" />

          {/* Menu options */}
          <div className="user-account-items">
            <button
              type="button"
              className="user-account-item"
              onClick={handleProfileClick}
              role="menuitem"
            >
              <User size={18} className="user-account-item-icon" />
              <span>My Profile</span>
            </button>

            <button
              type="button"
              className="user-account-item"
              onClick={handleChangeEmailClick}
              role="menuitem"
            >
              <Mail size={18} className="user-account-item-icon" />
              <span>Change Email</span>
            </button>

            <button
              type="button"
              className="user-account-item"
              onClick={handleSecurityClick}
              role="menuitem"
            >
              <Lock size={18} className="user-account-item-icon" />
              <span>Security</span>
            </button>

            <button
              type="button"
              className="user-account-item user-account-item--danger"
              onClick={handleSignOutClick}
              role="menuitem"
            >
              <LogOut size={18} className="user-account-item-icon" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
