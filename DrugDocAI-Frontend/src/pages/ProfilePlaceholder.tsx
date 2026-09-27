import React from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { User, Mail, Shield, CheckCircle } from "lucide-react";

export const ProfilePlaceholder: React.FC = () => {
  const { user } = useCurrentUser();

  return (
    <div className="page-wrapper">
      <Header showAvatar={true} />
      
      <main className="container" style={{ paddingTop: "40px", paddingBottom: "60px", maxWidth: "800px" }}>
        <div style={{
          background: "#ffffff",
          borderRadius: "20px",
          border: "1px solid rgba(220, 210, 195, 0.8)",
          boxShadow: "0 10px 30px rgba(20, 45, 45, 0.06)",
          padding: "36px",
          textAlign: "left"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "28px" }}>
            <div className="avatar-circle avatar-circle--lg" style={{ width: "64px", height: "64px", fontSize: "26px" }}>
              {user.avatarInitial}
            </div>
            <div>
              <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#163334", margin: 0 }}>
                {user.name}
              </h1>
              <p style={{ color: "#697c78", margin: "4px 0 0 0", fontSize: "14px" }}>
                {user.email}
              </p>
            </div>
          </div>

          <div style={{ height: "1px", background: "rgba(225, 215, 200, 0.7)", marginBottom: "28px" }} />

          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#163334", marginBottom: "16px" }}>
            Account Overview
          </h2>

          <div style={{ display: "grid", gap: "16px" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "16px",
              background: "#f7f9f8",
              borderRadius: "12px"
            }}>
              <User size={20} color="#163334" />
              <div>
                <strong style={{ display: "block", fontSize: "13px", color: "#697c78" }}>Full Name</strong>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "#163334" }}>{user.name}</span>
              </div>
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "16px",
              background: "#f7f9f8",
              borderRadius: "12px"
            }}>
              <Mail size={20} color="#163334" />
              <div>
                <strong style={{ display: "block", fontSize: "13px", color: "#697c78" }}>Email Address</strong>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "#163334" }}>{user.email}</span>
              </div>
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "16px",
              background: "#f7f9f8",
              borderRadius: "12px"
            }}>
              <Shield size={20} color="#163334" />
              <div>
                <strong style={{ display: "block", fontSize: "13px", color: "#697c78" }}>Role & Permissions</strong>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "#163334", textTransform: "capitalize" }}>
                  {user.role || "Standard User"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
