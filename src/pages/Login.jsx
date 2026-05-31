import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

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
        <div className="min-h-screen flex items-center justify-center bg-[#061b4d] px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1d1d2e] p-6 shadow-2xl">
                <h1 className="text-3xl font-bold text-white">SVS Traders Login</h1>
                <p className="mt-2 text-sm text-white/60">
                    Sign in to access the billing and inventory system.
                </p>

                <form onSubmit={handleLogin} className="mt-6 space-y-4">
                    <div>
                        <label className="mb-2 block text-sm text-white/70">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none placeholder:text-white/35"
                            placeholder="admin@example.com"
                            autoComplete="email"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-white/70">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none placeholder:text-white/35"
                            placeholder="••••••••"
                            autoComplete="current-password"
                        />
                    </div>

                    {error ? (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {error}
                        </div>
                    ) : null}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                        {loading ? "Signing in..." : "Login"}
                    </button>
                </form>
            </div>
        </div>
    );
}