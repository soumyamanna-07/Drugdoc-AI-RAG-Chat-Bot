import { clearAdminKey, getAuthToken, setAuthToken } from "./adminApi";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "patient" | "admin" | "user";
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  error?: string;
}

const STORAGE_KEY = "drugdoc_mock_user";

export const mockAuth = {
  login: async (
    identifier: string,
    password?: string,
    role: "user" | "admin" = "user"
  ): Promise<AuthResponse> => {
    if (!identifier || identifier.trim().length === 0) {
      return {
        success: false,
        error: role === "admin" ? "Please enter your admin ID or email." : "Please enter your email or phone number.",
      };
    }

    if (!password || password.trim().length === 0) {
      return { success: false, error: "Please enter your password." };
    }

    if (role === "admin") {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok || data.user?.role !== "admin") {
        return { success: false, error: data.detail || "Administrator authentication failed." };
      }
      setAuthToken(data.token);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
      return { success: true, user: data.user };
    } else {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.detail || "Authentication failed." };
      }
      setAuthToken(data.token);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
      return { success: true, user: data.user };
    }
  },

  register: async (
    name: string,
    email: string,
    password?: string
  ): Promise<AuthResponse> => {
    if (!name || name.trim().length === 0) {
      return { success: false, error: "Please enter your full name." };
    }

    if (!email || email.trim().length === 0) {
      return { success: false, error: "Please enter your email address." };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return { success: false, error: "Please enter a valid email address." };
    }

    if (!password || password.length < 8) {
      return { success: false, error: "Password must be at least 8 characters long." };
    }

    const response = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), name: name.trim(), password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: data.detail || `Registration failed (HTTP ${response.status}).`,
      };
    }
    setAuthToken(data.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
    return { success: true, user: data.user };
  },

  logout: (): void => {
    localStorage.removeItem(STORAGE_KEY);
    // Also clear the admin API key from sessionStorage so the tab is fully
    // de-authenticated when the user logs out.
    clearAdminKey();
  },

  getCurrentUser: (): User | null => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data) as User;
    } catch {
      return null;
    }
  },

  isAuthenticated: (): boolean => {
    return !!getAuthToken() && !!localStorage.getItem(STORAGE_KEY);
  },
};
