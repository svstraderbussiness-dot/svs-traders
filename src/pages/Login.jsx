import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/* Floating label input component */
function FloatingInput({ id, type, value, onChange, placeholder, autoComplete }) {
    const [focused, setFocused] = useState(false);
    const active = focused || value.length > 0;

    return (
        <div className="relative">
            <input
                id={id}
                type={type}
                value={value}
                onChange={onChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoComplete={autoComplete}
                required
                className="peer w-full rounded-xl border px-4 pb-2.5 pt-6 text-sm text-white bg-white/[0.05] placeholder-transparent transition-all duration-150"
                style={{
                    borderColor: active ? "rgba(var(--accent-rgb), 0.55)" : "rgba(255,255,255,0.10)",
                    boxShadow: focused ? "0 0 0 2.5px rgba(var(--accent-rgb), 0.3)" : "none",
                }}
                placeholder={placeholder}
            />
            <label
                htmlFor={id}
                className="absolute left-4 text-white/45 font-medium pointer-events-none transition-all duration-200"
                style={{
                    top: active ? "8px" : "50%",
                    transform: active ? "translateY(0)" : "translateY(-50%)",
                    fontSize: active ? "10px" : "13px",
                    letterSpacing: active ? "0.08em" : "0",
                    textTransform: active ? "uppercase" : "none",
                }}
            >
                {placeholder}
            </label>
        </div>
    );
}

export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

            if (signInError) throw signInError;

            navigate("/", { replace: true });
        } catch (err) {
            setError(err?.message || "Login failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
            style={{
                background: "linear-gradient(135deg, #020d2e 0%, #061b4d 45%, #0a2458 75%, #030f35 100%)",
            }}
        >
            {/* Animated grid pattern */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                                      linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
                    backgroundSize: "60px 60px",
                }}
            />

            {/* Gradient blobs */}
            <div className="pointer-events-none absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full opacity-[0.18] blur-[130px]"
                style={{ background: "var(--accent-color)" }} />
            <div className="pointer-events-none absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full opacity-[0.12] blur-[110px]"
                style={{ background: "#3b82f6" }} />

            {/* Card */}
            <div
                className="animate-fade-in-up relative w-full max-w-sm rounded-3xl p-8"
                style={{
                    background: "rgba(10, 18, 40, 0.8)",
                    backdropFilter: "blur(28px)",
                    WebkitBackdropFilter: "blur(28px)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    boxShadow: "0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
                }}
            >
                {/* Logo mark */}
                <div className="mb-8">
                    <div
                        className="inline-flex items-center justify-center h-12 w-12 rounded-2xl mb-5"
                        style={{
                            background: "linear-gradient(135deg, var(--accent-color), #1d4ed8)",
                            boxShadow: "0 10px 28px rgba(var(--accent-rgb), 0.5)",
                        }}
                    >
                        <span className="text-white font-black text-lg select-none">S</span>
                    </div>
                    <h1 className="text-[26px] font-bold text-white tracking-tight leading-tight">
                        Welcome back
                    </h1>
                    <p className="mt-1.5 text-[13px] text-white/45 font-medium">
                        Sign in to SVS Traders Management System
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <FloatingInput
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        autoComplete="email"
                    />

                    <FloatingInput
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        autoComplete="current-password"
                    />

                    {error && (
                        <div
                            className="animate-fade-in-up flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-300"
                        >
                            <span className="text-red-400 mt-0.5">⚠</span>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-ripple w-full rounded-xl px-4 py-3.5 text-[14px] font-bold text-white disabled:opacity-60 flex items-center justify-center gap-2.5 mt-2"
                        style={{
                            background: "linear-gradient(135deg, var(--accent-color) 0%, #1d4ed8 100%)",
                            boxShadow: loading ? "none" : "0 8px 28px rgba(var(--accent-rgb), 0.45)",
                        }}
                    >
                        {loading ? (
                            <>
                                <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin-smooth" />
                                Signing in…
                            </>
                        ) : (
                            "Sign In →"
                        )}
                    </button>
                </form>

                <p className="mt-6 text-center text-[11px] text-white/20 tracking-wide">
                    SVS TRADERS · MANAGEMENT SYSTEM
                </p>
            </div>
        </div>
    );
}