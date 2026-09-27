/** Shared authenticated API client for user and admin requests. */

const TOKEN_KEY = "drugdoc_auth_token";
const USER_KEY = "drugdoc_mock_user";

export const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:8000";

export function getAuthToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem("drugdoc_session_id");
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthToken());
}

/**
 * Fetch an authenticated API resource.
 *
 * All protected frontend API calls should use this instead of raw fetch().
 * A 401 means the bearer token is no longer valid, so clear the local
 * authentication state and return the user to the login page.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getAuthToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    clearAuthSession();

    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }

  return response;
}
