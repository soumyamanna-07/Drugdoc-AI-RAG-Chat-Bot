import React from "react";
import { Navigate } from "react-router-dom";
import { isAdminKeyPresent } from "./adminApi";

/**
 * Wraps admin pages and requires a bearer token established by login.
 */
export const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isAdminKeyPresent()) {
    return <Navigate to="/login#admin" replace />;
  }
  return <>{children}</>;
};
