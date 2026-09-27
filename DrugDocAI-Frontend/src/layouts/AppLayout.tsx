import React from "react";

interface AppLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, className = "" }) => {
  return <main className={`landing ${className}`.trim()}>{children}</main>;
};
