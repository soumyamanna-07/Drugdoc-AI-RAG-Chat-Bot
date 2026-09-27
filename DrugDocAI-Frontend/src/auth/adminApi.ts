/** Backwards-compatible auth helpers for existing admin code. */
import {
  authenticatedFetch,
  clearAuthSession,
  getAuthToken,
  isAuthenticated,
  setAuthToken,
} from "../data/api";

export { getAuthToken, setAuthToken };

/** Remove the bearer token and local account state from this browser tab. */
export function clearAdminKey(): void {
  clearAuthSession();
}

/** True if a bearer token is currently stored in this tab. */
export function isAdminKeyPresent(): boolean {
  return isAuthenticated();
}

/**
 * Existing admin API name retained so admin pages do not need a second
 * authentication implementation.
 */
export async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return authenticatedFetch(input, init);
}
