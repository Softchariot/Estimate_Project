import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = "https://estimate-project-omega.vercel.app";
const SESSION_KEY = "werms_user";

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #dde5ec",
  borderRadius: 12,
  padding: 28,
  boxShadow: "0 4px 24px rgba(36, 50, 63, 0.08)",
};

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid #c8d4df",
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle = { display: "grid", gap: 6, fontWeight: 600, fontSize: 14 };

const requiredStar = (
  <span style={{ color: "#cc2222", fontWeight: 700 }}>*</span>
);

export default function LoginPage() {
  const [step, setStep] = useState("org");
  const [orgCode, setOrgCode] = useState("");
  const [organization, setOrganization] = useState(null);
  const [userLoginName, setUserLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        setUser(JSON.parse(saved));
        setStep("profile");
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  const onValidateOrganization = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/validate-organization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgCode }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.message || "Organization validation failed.");
      setOrganization(data);
      setStep("credentials");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgCode, userLoginName, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed.");
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
      setUser(data);
      setStep("profile");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
    setOrganization(null);
    setOrgCode("");
    setUserLoginName("");
    setPassword("");
    setStep("org");
    setError("");
  };

  const onChangeOrganization = () => {
    setOrganization(null);
    setUserLoginName("");
    setPassword("");
    setStep("org");
    setError("");
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(160deg, #eef4fb 0%, #f8fafc 50%, #e8f0f8 100%)",
        fontFamily: "Arial, sans-serif",
        color: "#24323f",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>WERMS Login</h1>
          <p style={{ margin: 0, color: "#5d6c7a", fontSize: 15 }}>
            {step === "profile"
              ? "Welcome back"
              : "Sign in to your organization"}
          </p>
        </div>

        {error && (
          <p
            style={{
              padding: "10px 14px",
              background: "#fff0f0",
              border: "1px solid #f5c2c2",
              borderRadius: 6,
              color: "#9b1c1c",
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            {error}
          </p>
        )}

        {step === "org" && (
          <form onSubmit={onValidateOrganization} style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 6, fontSize: 20 }}>
              Organization
            </h2>
            <p
              style={{
                marginTop: 0,
                marginBottom: 20,
                color: "#5d6c7a",
                fontSize: 14,
              }}
            >
              Enter your organization code to continue.
            </p>
            <label style={labelStyle}>
              Organization Code {requiredStar}
              <input
                style={inputStyle}
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value)}
                placeholder="e.g. SOFT"
                required
                autoFocus
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 20,
                width: "100%",
                padding: "12px 16px",
                borderRadius: 8,
                border: "none",
                background: "#216bcb",
                color: "#fff",
                fontWeight: 600,
                fontSize: 15,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Validating..." : "Continue"}
            </button>
          </form>
        )}

        {step === "credentials" && organization && (
          <form onSubmit={onLogin} style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 6, fontSize: 20 }}>
              User Login
            </h2>
            <p
              style={{
                marginTop: 0,
                marginBottom: 20,
                color: "#5d6c7a",
                fontSize: 14,
              }}
            >
              Organization: <strong>{organization.OrgName}</strong> (
              {organization.OrgCode})
            </p>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={labelStyle}>
                User Name {requiredStar}
                <input
                  style={inputStyle}
                  value={userLoginName}
                  onChange={(e) => setUserLoginName(e.target.value)}
                  placeholder="Login name"
                  required
                  autoFocus
                />
              </label>
              <label style={labelStyle}>
                Password {requiredStar}
                <input
                  style={inputStyle}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={onChangeOrganization}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "1px solid #c8d4df",
                  background: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 2,
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#216bcb",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </div>
          </form>
        )}

        {step === "profile" && user && (
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 6, fontSize: 20 }}>
              User Profile
            </h2>
            <p
              style={{
                marginTop: 0,
                marginBottom: 20,
                color: "#5d6c7a",
                fontSize: 14,
              }}
            >
              You are signed in to <strong>{user.OrgName}</strong>
            </p>
            <dl
              style={{
                margin: 0,
                display: "grid",
                gap: 14,
                background: "#f9fbfd",
                border: "1px solid #e4ebf2",
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div>
                <dt
                  style={{
                    fontSize: 12,
                    color: "#637385",
                    marginBottom: 4,
                    fontWeight: 600,
                  }}
                >
                  User Name
                </dt>
                <dd style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                  {user.UserName}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    fontSize: 12,
                    color: "#637385",
                    marginBottom: 4,
                    fontWeight: 600,
                  }}
                >
                  Designation
                </dt>
                <dd style={{ margin: 0, fontSize: 16 }}>
                  {user.DesignationName}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    fontSize: 12,
                    color: "#637385",
                    marginBottom: 4,
                    fontWeight: 600,
                  }}
                >
                  User Category
                </dt>
                <dd style={{ margin: 0, fontSize: 16 }}>
                  {user.UserCategoryName}
                </dd>
              </div>
            </dl>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <Link
                href="/home"
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#216bcb",
                  color: "#fff",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Go to Masters
              </Link>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "1px solid #c8d4df",
                  background: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
