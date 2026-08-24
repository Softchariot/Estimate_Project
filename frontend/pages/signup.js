import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

const API_BASE = "https://estimate-project-omega.vercel.app";
// const API_BASE = "http://localhost:4000";

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
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid #c8d4df",
  background: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 15,
};

const requiredStar = (
  <span style={{ color: "#cc2222", fontWeight: 700 }}>*</span>
);

const emptyIndividual = {
  userLoginName: "",
  userPWD: "",
  userName: "",
  userAddress: "",
  userContact: "",
  userEmail: "",
  remarks: "",
};

const emptyOrganization = {
  orgName: "",
  orgAddress: "",
  orgCode: "",
  orgContact: "",
  orgEmail: "",
  remarks: "",
};

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState("choose"); // choose | individual | organization | done
  const [individual, setIndividual] = useState(emptyIndividual);
  const [organization, setOrganization] = useState(emptyOrganization);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loginNameHint, setLoginNameHint] = useState("");
  const [orgCodeHint, setOrgCodeHint] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!individual.userLoginName.trim()) {
      setLoginNameHint("");
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/signup/check-login-name?name=${encodeURIComponent(
            individual.userLoginName.trim(),
          )}`,
        );
        const data = await res.json();
        setLoginNameHint(data.message || "");
      } catch {
        setLoginNameHint("");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [individual.userLoginName]);

  useEffect(() => {
    if (!organization.orgCode.trim()) {
      setOrgCodeHint("");
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/signup/check-org-code?code=${encodeURIComponent(
            organization.orgCode.trim(),
          )}`,
        );
        const data = await res.json();
        setOrgCodeHint(data.message || "");
      } catch {
        setOrgCodeHint("");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [organization.orgCode]);

  const onSubmitIndividual = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/signup/individual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(individual),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Signup failed.");
      setSuccess(
        `${data.message}${
          data.data?.OrgCode
            ? ` After approval, sign in with organization code “${data.data.OrgCode}”.`
            : ""
        }`,
      );
      setStep("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onSubmitOrganization = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/signup/organization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(organization),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Signup failed.");
      setSuccess(data.message || "Organization signup submitted.");
      setStep("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pageShell = (children) => (
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
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>New User Sign Up</h1>
          <p style={{ margin: 0, color: "#5d6c7a", fontSize: 15 }}>
            SoftChariot
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
        <div style={cardStyle}>{children}</div>
        <p style={{ textAlign: "center", marginTop: 18, fontSize: 14 }}>
          <Link href="/" style={{ color: "#216bcb", fontWeight: 600 }}>
            Back to Login
          </Link>
        </p>
      </div>
    </main>
  );

  if (step === "done") {
    return pageShell(
      <div>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Request submitted</h2>
        <p style={{ color: "#5d6c7a", fontSize: 14, lineHeight: 1.5 }}>
          {success}
        </p>
        <button
          type="button"
          style={{ ...primaryButtonStyle, marginTop: 16, cursor: "pointer" }}
          onClick={() => router.push("/")}
        >
          Go to Login
        </button>
      </div>,
    );
  }

  if (step === "choose") {
    return pageShell(
      <div style={{ display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Choose signup type</h2>
        <p style={{ margin: 0, color: "#5d6c7a", fontSize: 14 }}>
          SuperAdmin must approve your request before you can use SoftChariot.
        </p>
        <button
          type="button"
          style={{ ...primaryButtonStyle, cursor: "pointer" }}
          onClick={() => {
            setError("");
            setIndividual(emptyIndividual);
            setStep("individual");
          }}
        >
          Are you an Individual User?
        </button>
        <button
          type="button"
          style={{ ...secondaryButtonStyle }}
          onClick={() => {
            setError("");
            setOrganization(emptyOrganization);
            setStep("organization");
          }}
        >
          Looking to use this software in your Organization?
        </button>
      </div>,
    );
  }

  if (step === "individual") {
    return pageShell(
      <form onSubmit={onSubmitIndividual}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Individual User</h2>
        <p style={{ color: "#5d6c7a", fontSize: 13, marginTop: 0 }}>
          Account stays inactive until SuperAdmin approval.
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={labelStyle}>
            User Name {requiredStar}
            <input
              style={inputStyle}
              value={individual.userLoginName}
              onChange={(e) =>
                setIndividual((p) => ({ ...p, userLoginName: e.target.value }))
              }
              required
              autoFocus
            />
            {loginNameHint && (
              <span style={{ fontWeight: 500, fontSize: 12, color: "#5d6c7a" }}>
                {loginNameHint}
              </span>
            )}
          </label>
          <label style={labelStyle}>
            Password {requiredStar}
            <div style={{ position: "relative" }}>
              <input
                style={{ ...inputStyle, paddingRight: 44 }}
                type={showPassword ? "text" : "password"}
                value={individual.userPWD}
                onChange={(e) =>
                  setIndividual((p) => ({ ...p, userPWD: e.target.value }))
                }
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
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
          <label style={labelStyle}>
            Full Name {requiredStar}
            <input
              style={inputStyle}
              value={individual.userName}
              onChange={(e) =>
                setIndividual((p) => ({ ...p, userName: e.target.value }))
              }
              required
            />
          </label>
          <label style={labelStyle}>
            Residential Address {requiredStar}
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
              value={individual.userAddress}
              onChange={(e) =>
                setIndividual((p) => ({ ...p, userAddress: e.target.value }))
              }
              required
            />
          </label>
          <label style={labelStyle}>
            Mobile Contact {requiredStar}
            <input
              style={inputStyle}
              value={individual.userContact}
              onChange={(e) =>
                setIndividual((p) => ({ ...p, userContact: e.target.value }))
              }
              required
            />
          </label>
          <label style={labelStyle}>
            Email {requiredStar}
            <input
              style={inputStyle}
              type="email"
              value={individual.userEmail}
              onChange={(e) =>
                setIndividual((p) => ({ ...p, userEmail: e.target.value }))
              }
              required
            />
          </label>
          <label style={labelStyle}>
            Name of Organization and Brief Info about you{" "}
            <span style={{ fontWeight: 500, color: "#8fa0b5" }}>
              (Optional, max 200)
            </span>
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
              maxLength={200}
              value={individual.remarks}
              onChange={(e) =>
                setIndividual((p) => ({ ...p, remarks: e.target.value }))
              }
            />
            <span style={{ fontWeight: 500, fontSize: 12, color: "#8fa0b5" }}>
              {individual.remarks.length}/200
            </span>
          </label>
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              ...primaryButtonStyle,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Submitting…" : "Submit for approval"}
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => {
              setError("");
              setStep("choose");
            }}
          >
            Back
          </button>
        </div>
      </form>,
    );
  }

  return pageShell(
    <form onSubmit={onSubmitOrganization}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Organization</h2>
      <p style={{ color: "#5d6c7a", fontSize: 13, marginTop: 0 }}>
        Organization stays inactive until SuperAdmin approval.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={labelStyle}>
          Organization Name {requiredStar}
          <input
            style={inputStyle}
            value={organization.orgName}
            onChange={(e) =>
              setOrganization((p) => ({ ...p, orgName: e.target.value }))
            }
            required
            autoFocus
          />
        </label>
        <label style={labelStyle}>
          Address {requiredStar}
          <textarea
            style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
            value={organization.orgAddress}
            onChange={(e) =>
              setOrganization((p) => ({ ...p, orgAddress: e.target.value }))
            }
            required
          />
        </label>
        <label style={labelStyle}>
          Code {requiredStar}{" "}
          <span style={{ fontWeight: 500, color: "#8fa0b5" }}>
            (4–10 chars, no spaces)
          </span>
          <input
            style={inputStyle}
            value={organization.orgCode}
            onChange={(e) =>
              setOrganization((p) => ({
                ...p,
                orgCode: e.target.value.replace(/\s+/g, ""),
              }))
            }
            minLength={4}
            maxLength={10}
            pattern="[A-Za-z0-9]{4,10}"
            required
          />
          {orgCodeHint && (
            <span style={{ fontWeight: 500, fontSize: 12, color: "#5d6c7a" }}>
              {orgCodeHint}
            </span>
          )}
        </label>
        <label style={labelStyle}>
          Mobile Contact {requiredStar}
          <input
            style={inputStyle}
            value={organization.orgContact}
            onChange={(e) =>
              setOrganization((p) => ({ ...p, orgContact: e.target.value }))
            }
            required
          />
        </label>
        <label style={labelStyle}>
          Email {requiredStar}
          <input
            style={inputStyle}
            type="email"
            value={organization.orgEmail}
            onChange={(e) =>
              setOrganization((p) => ({ ...p, orgEmail: e.target.value }))
            }
            required
          />
        </label>
        <label style={labelStyle}>
          Brief Information about your Organization{" "}
          <span style={{ fontWeight: 500, color: "#8fa0b5" }}>
            (Optional, max 200)
          </span>
          <textarea
            style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
            maxLength={200}
            value={organization.remarks}
            onChange={(e) =>
              setOrganization((p) => ({ ...p, remarks: e.target.value }))
            }
          />
          <span style={{ fontWeight: 500, fontSize: 12, color: "#8fa0b5" }}>
            {organization.remarks.length}/200
          </span>
        </label>
      </div>
      <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
        <button
          type="submit"
          disabled={loading}
          style={{
            ...primaryButtonStyle,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Submitting…" : "Submit for approval"}
        </button>
        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => {
            setError("");
            setStep("choose");
          }}
        >
          Back
        </button>
      </div>
    </form>,
  );
}
