import { useState } from "react";
import { BookOpen, Eye, EyeOff } from "lucide-react";
import { db, User } from "../db";

async function generateSalt(): Promise<string> {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface AuthScreenProps {
  onAuthenticated: (userId: number, userName: string) => void;
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<"email" | "reset">("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotUser, setForgotUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    try {
      const existing = await db.users.where("email").equals(email.trim().toLowerCase()).first();
      if (existing) { setError("An account with that email already exists."); return; }

      const salt = await generateSalt();
      const passwordHash = await hashPassword(password, salt);
      const user: User = {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        passwordHash,
        salt,
        createdAt: Date.now(),
      };
      const id = await db.users.add(user);
      localStorage.setItem("lexio.session", String(id));
      localStorage.setItem("lexio.userName", name.trim());
      onAuthenticated(id as number, name.trim());
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError("Email and password are required."); return; }

    setLoading(true);
    try {
      const user = await db.users.where("email").equals(email.trim().toLowerCase()).first();
      if (!user) { setError("No account found with that email."); return; }

      const hash = await hashPassword(password, user.salt);
      if (hash !== user.passwordHash) { setError("Incorrect password."); return; }

      localStorage.setItem("lexio.session", String(user.id));
      localStorage.setItem("lexio.userName", user.name);
      onAuthenticated(user.id!, user.name);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!forgotEmail.trim()) { setError("Enter your email."); return; }
    setLoading(true);
    try {
      const user = await db.users.where("email").equals(forgotEmail.trim().toLowerCase()).first();
      if (!user) { setError("No account found with that email."); return; }
      setForgotUser(user);
      setForgotStep("reset");
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!forgotUser) return;
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      const salt = await generateSalt();
      const passwordHash = await hashPassword(newPassword, salt);
      await db.users.update(forgotUser.id!, { passwordHash, salt });
      // Sign in automatically after reset
      localStorage.setItem("lexio.session", String(forgotUser.id));
      localStorage.setItem("lexio.userName", forgotUser.name);
      onAuthenticated(forgotUser.id!, forgotUser.name);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (forgotMode) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 justify-center mb-8">
            <div className="bg-green-600 p-2.5 rounded-xl text-white"><BookOpen size={26} /></div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">Lexio</h1>
          </div>
          <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-dark-hover shadow-sm overflow-hidden">
            <div className="p-6">
              <h2 className="text-lg font-black text-gray-900 dark:text-white mb-1">
                {forgotStep === "email" ? "Reset Password" : `Reset password for ${forgotUser?.name}`}
              </h2>
              <p className="text-xs text-gray-400 dark:text-dark-muted mb-5">
                {forgotStep === "email"
                  ? "Enter your account email to proceed."
                  : "Choose a new password. You'll be signed in automatically."}
              </p>
              <form onSubmit={forgotStep === "email" ? handleForgotLookup : handleForgotReset} className="space-y-4">
                {forgotStep === "email" ? (
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                  />
                ) : (
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password (min. 6 characters)"
                      autoComplete="new-password"
                      className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl px-3 py-2.5 pr-10 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                )}
                {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-bold transition-all shadow-lg shadow-green-600/20"
                >
                  {loading ? "Please wait…" : forgotStep === "email" ? "Continue" : "Set New Password"}
                </button>
                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setForgotStep("email"); setForgotEmail(""); setForgotUser(null); setNewPassword(""); setError(null); }}
                  className="w-full py-2 text-sm text-gray-500 dark:text-dark-muted hover:text-gray-800 dark:hover:text-white transition-colors"
                >
                  ← Back to Sign In
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="bg-green-600 p-2.5 rounded-xl text-white">
            <BookOpen size={26} />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">
            Lexio
          </h1>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-200 dark:border-dark-hover shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-dark-hover">
            {(["signin", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); }}
                className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                  tab === t
                    ? "text-green-600 border-b-2 border-green-600"
                    : "text-gray-500 dark:text-dark-muted hover:text-gray-800 dark:hover:text-white"
                }`}
              >
                {t === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form
            onSubmit={tab === "signin" ? handleSignIn : handleSignUp}
            className="p-6 space-y-4"
          >
            {tab === "signup" && (
              <div>
                <label className="text-xs uppercase tracking-widest text-gray-400 dark:text-dark-muted block mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            )}

            <div>
              <label className="text-xs uppercase tracking-widest text-gray-400 dark:text-dark-muted block mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-gray-400 dark:text-dark-muted block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === "signup" ? "At least 6 characters" : "Your password"}
                  autoComplete={tab === "signin" ? "current-password" : "new-password"}
                  className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-hover rounded-xl px-3 py-2.5 pr-10 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-bold transition-all shadow-lg shadow-green-600/20"
            >
              {loading
                ? "Please wait…"
                : tab === "signin"
                ? "Sign In"
                : "Create Account"}
            </button>

            {tab === "signin" && (
              <button
                type="button"
                onClick={() => { setForgotMode(true); setForgotEmail(email); setError(null); }}
                className="w-full text-center text-xs text-gray-400 dark:text-dark-muted hover:text-green-600 dark:hover:text-green-400 transition-colors py-1"
              >
                Forgot password?
              </button>
            )}
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-dark-muted mt-5">
          Your data is stored locally on this device.
        </p>
      </div>
    </div>
  );
}
