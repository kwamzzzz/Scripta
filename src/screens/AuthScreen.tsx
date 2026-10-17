import { useState } from "react";
import { ArrowRight, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import ScriptaLogo from "@/components/ScriptaLogo";
import { supabase } from "@/integrations/supabase/client";
import { scriptaTheme } from "@/lib/tokens";
import "@/components/scripta-controls.css";
import "./auth-screen.css";

export default function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const cleanEmail = email.trim().toLowerCase();
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
      } else {
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Account created. Confirm your email, then sign in with your password.");
          setMode("in");
          setPassword("");
          setConfirmPassword("");
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-stage scripta-ui" style={scriptaTheme}>
      <div className="auth-page">
        <header className="auth-header">
          <ScriptaLogo />
        </header>

        <main className="auth-layout">
          <section className="auth-editorial" aria-label="About Scripta">
            <p className="auth-display">
              Clarity, <br />
              in every <em>matter.</em>
            </p>
            <p className="auth-summary">Document drafting, contract review and legal research.</p>

            <div className="auth-document-study" aria-hidden="true">
              <svg viewBox="0 0 420 235" fill="none" focusable="false">
                <path d="M88 168L203 204L354 154L240 119Z" className="auth-study-ground" />
                <path d="M105 158L218 194L354 148L241 112Z" className="auth-study-page" />
                <path d="M105 158V165L218 201L354 155V148" className="auth-study-edge" />
                <path d="M115 147L228 183L364 137L251 101Z" className="auth-study-page" />
                <path d="M115 147V154L228 190L364 144V137" className="auth-study-edge" />
                <path d="M118 72L229 107L352 65L241 30Z" className="auth-study-page" />
                <path
                  d="M229 107L352 65L352 82L260 113L352 142L229 183V166L319 136L229 107Z"
                  className="auth-study-fold"
                />
                <path d="M118 72V79L229 114V107" className="auth-study-edge" />
                <path d="M153 68L220 89M169 63L240 85M185 57L256 79" className="auth-study-lines" />
                <path d="M273 47L297 54L285 58L261 51Z" className="auth-study-tab" />
                <path
                  d="M155 144L221 165M171 139L240 161M187 134L257 155"
                  className="auth-study-lines"
                />
              </svg>
            </div>
          </section>

          <section className="auth-form-panel" aria-labelledby="auth-title">
            <div className="auth-form-heading">
              <h1 id="auth-title">{mode === "in" ? "Welcome back." : "Create your account."}</h1>
              <p id="auth-intro">
                {mode === "in"
                  ? "Sign in to pick up where you left off."
                  : "A personal workspace for your legal work."}
              </p>
            </div>

            <form
              onSubmit={submit}
              className="auth-form"
              aria-describedby="auth-intro"
              aria-busy={busy}
            >
              <fieldset className="auth-fields" disabled={busy}>
                <legend className="auth-sr-only">
                  {mode === "in" ? "Sign-in details" : "Account details"}
                </legend>
                {mode === "up" && (
                  <label className="scripta-field">
                    <span>Full name</span>
                    <input
                      name="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      placeholder="Your full name"
                      required
                    />
                  </label>
                )}
                <label className="scripta-field">
                  <span>Email address</span>
                  <input
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="you@firm.com"
                    required
                  />
                </label>
                <div className="scripta-field">
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    type="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "in" ? "current-password" : "new-password"}
                    aria-describedby={mode === "up" ? "auth-password-hint" : undefined}
                    minLength={8}
                    required
                  />
                  {mode === "up" && <small id="auth-password-hint">At least 8 characters.</small>}
                </div>
                {mode === "up" && (
                  <label className="scripta-field">
                    <span>Confirm password</span>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </label>
                )}
              </fieldset>

              {error && (
                <div className="scripta-feedback is-error" role="alert">
                  <CircleAlert size={17} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
              {notice && (
                <div className="scripta-feedback is-success" role="status">
                  <CircleCheck size={17} aria-hidden="true" />
                  <span>{notice}</span>
                </div>
              )}
              <button className="scripta-button auth-submit" type="submit" disabled={busy}>
                <span>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</span>
                {busy ? (
                  <LoaderCircle className="auth-spinner" size={17} aria-hidden="true" />
                ) : (
                  <ArrowRight size={17} aria-hidden="true" />
                )}
              </button>
            </form>
            <span className="auth-sr-only" role="status">
              {busy ? "Please wait. Your request is being processed." : ""}
            </span>

            <div className="auth-mode-switch">
              <span>{mode === "in" ? "New to Scripta?" : "Already have an account?"}</span>
              <button
                className="scripta-text-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode(mode === "in" ? "up" : "in");
                  setError(null);
                  setNotice(null);
                  setPassword("");
                  setConfirmPassword("");
                }}
              >
                {mode === "in" ? "Create an account" : "Sign in instead"}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
