import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const API_BASE = "https://estimate-project-omega.vercel.app";
// const API_BASE = "http://localhost:4000";
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

const sectionTitleStyle = {
  marginTop: 0,
  marginBottom: 6,
  fontSize: 18,
};

const sectionHintStyle = {
  marginTop: 0,
  marginBottom: 16,
  color: "#5d6c7a",
  fontSize: 14,
};

const primaryButtonStyle = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "none",
  background: "#216bcb",
  color: "#fff",
  fontWeight: 600,
  fontSize: 15,
};

const secondaryButtonStyle = {
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid #c8d4df",
  background: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const requiredStar = (
  <span style={{ color: "#cc2222", fontWeight: 700 }}>*</span>
);

export default function LoginPage() {
  const router = useRouter();
  const [orgCode, setOrgCode] = useState("");
  const [organization, setOrganization] = useState(null);
  const [userLoginName, setUserLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        JSON.parse(saved);
        router.replace("/home");
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
  }, [router]);

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
      setUserLoginName("");
      setPassword("");
      setShowPassword(false);
    } catch (err) {
      setOrganization(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async (e) => {
    e.preventDefault();
    if (!organization) return;
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
      router.replace("/home");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onChangeOrganization = () => {
    setOrganization(null);
    setUserLoginName("");
    setPassword("");
    setShowPassword(false);
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
          <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>
            SoftChariot Login
          </h1>
          <p
            style={{
              margin: "0 0 8px",
              color: "#5d6c7a",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Version 1.06 Release 17 Aug 26
          </p>
          <p style={{ margin: 0, color: "#5d6c7a", fontSize: 15 }}>
            Sign in to your organization
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

        <div style={cardStyle}>
          {!organization ? (
            <form onSubmit={onValidateOrganization}>
              <h2 style={sectionTitleStyle}>Organization Authentication</h2>
              <p style={sectionHintStyle}>
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
                  ...primaryButtonStyle,
                  marginTop: 20,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Validating..." : "Continue"}
              </button>
            </form>
          ) : (
            <form onSubmit={onLogin}>
              <div style={{ marginBottom: 24 }}>
                <h2 style={sectionTitleStyle}>Organization Authentication</h2>
                <p style={{ ...sectionHintStyle, marginBottom: 10 }}>
                  Organization verified.
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    background: "#f3f8fd",
                    border: "1px solid #d5e4f3",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: 14 }}>
                    <strong>{organization.OrgName}</strong> (
                    {organization.OrgCode})
                  </span>
                  <button
                    type="button"
                    onClick={onChangeOrganization}
                    style={{
                      ...secondaryButtonStyle,
                      padding: "6px 12px",
                      fontSize: 13,
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>

              <h2 style={sectionTitleStyle}>User Authentication</h2>
              <p style={sectionHintStyle}>
                Enter your credentials to sign in.
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
                  <div style={{ position: "relative" }}>
                    <input
                      style={{ ...inputStyle, paddingRight: 44 }}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      title={showPassword ? "Hide password" : "Show password"}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        padding: 4,
                        display: "flex",
                        alignItems: "center",
                        color: "#637385",
                      }}
                    >
                      {showPassword ? (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </label>
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  ...primaryButtonStyle,
                  marginTop: 20,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
