import {
    BarChart3,
    Boxes,
    ChevronLeft,
    ChevronRight,
    Home,
    LogOut,
    ReceiptText,
    RotateCcw,
    Settings2,
    ShoppingBag,
    Store,
    Upload,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";

const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: Home },
    { to: "/billing", label: "Billing", icon: ReceiptText },
    { to: "/returns", label: "Returns", icon: RotateCcw },
    { to: "/jockey-inventory", label: "Jockey Inventory", icon: ShoppingBag },
    { to: "/bevdass-inventory", label: "2 Dudes Bevdaas Inventory", icon: Store },
    { to: "/svs-inventory", label: "SVS Inventory", icon: Boxes },
    { to: "/upload-stock", label: "Upload Stock", icon: Upload },
    { to: "/reports", label: "Reports", icon: BarChart3 },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/settings", label: "Settings", icon: Settings2 },
];

/* Ripple helper */
function addRipple(e) {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const r = document.createElement("span");
    r.className = "ripple-circle";
    Object.assign(r.style, { width: `${size}px`, height: `${size}px`, left: `${x}px`, top: `${y}px` });
    btn.appendChild(r);
    r.addEventListener("animationend", () => r.remove());
}

export default function Sidebar() {
    const { settings, updateSetting, accentColor } = useTheme();
    const navigate = useNavigate();
    const collapsed = Boolean(settings.sidebar_collapsed);

    const handleLogout = async (e) => {
        addRipple(e);
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
    };

    const activeStyle = {
        backgroundColor: accentColor,
        color: "#ffffff",
        boxShadow: `0 6px 22px ${accentColor}55, 0 2px 6px rgba(0,0,0,0.3)`,
    };

    return (
        <aside
            className={`sticky top-0 h-screen overflow-y-auto border-r text-white transition-all duration-300 ${
                collapsed ? "w-[68px]" : "w-[268px]"
            }`}
            style={{
                background: "linear-gradient(180deg, #0d1528 0%, #070c1a 100%)",
                borderColor: "rgba(255,255,255,0.06)",
            }}
        >
            <div className="flex h-full flex-col p-3">

                {/* ── Logo ── */}
                <div className="flex items-center justify-between gap-2 mb-6 px-1 pt-2">
                    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                        {/* Accent dot */}
                        <span
                            className="h-2 w-2 rounded-full shrink-0 animate-pulse-glow"
                            style={{ backgroundColor: accentColor }}
                        />
                        <div className="min-w-0">
                            <div className="text-[17px] font-black tracking-tight text-white leading-none">
                                {collapsed ? "SVS" : "SVS TRADERS"}
                            </div>
                            {!collapsed && (
                                <div className="text-[9.5px] text-white/28 mt-0.5 tracking-[0.18em] uppercase font-medium">
                                    Inventory · Billing · Reports
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => updateSetting("sidebar_collapsed", !collapsed, { persist: true })}
                        className="btn-ripple grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
                        style={{ background: "rgba(255,255,255,0.07)" }}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>
                </div>

                {/* ── Navigation ── */}
                <nav className="flex-1 space-y-0.5">
                    {navItems.map((item, idx) => {
                        const Icon = item.icon;
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                title={item.label}
                                className={({ isActive }) =>
                                    [
                                        "nav-item group relative flex items-center gap-2.5 rounded-xl text-[13px] font-medium",
                                        "animate-slide-in-left",
                                        collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                                        isActive
                                            ? "nav-active text-white"
                                            : "text-white/50 hover:text-white",
                                    ].join(" ")
                                }
                                style={({ isActive }) =>
                                    isActive
                                        ? { ...activeStyle, animationDelay: `${idx * 30}ms` }
                                        : { animationDelay: `${idx * 30}ms` }
                                }
                            >
                                <Icon size={15} className="shrink-0" />
                                {!collapsed && <span className="truncate">{item.label}</span>}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* ── Logout ── */}
                <button
                    type="button"
                    onClick={handleLogout}
                    title="Logout"
                    className={[
                        "btn-ripple mt-3 flex items-center gap-2.5 rounded-xl text-[13px] font-semibold",
                        "border transition-all duration-200",
                        "bg-red-500/10 hover:bg-red-500/20 border-red-500/20 hover:border-red-500/35",
                        "text-red-400 hover:text-red-300",
                        collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                    ].join(" ")}
                >
                    <LogOut size={15} className="shrink-0" />
                    {!collapsed && <span>Logout</span>}
                </button>

                {/* ── Theme badge ── */}
                <div
                    className="mt-3 rounded-xl p-3"
                    style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                    }}
                >
                    {!collapsed ? (
                        <>
                            <div className="text-[9.5px] font-bold text-white/30 uppercase tracking-[0.16em] mb-2">
                                Theme
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-white/45">
                                <span
                                    className="h-2.5 w-2.5 rounded-full ring-1 ring-white/20 shrink-0"
                                    style={{ backgroundColor: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
                                />
                                <span className="font-semibold text-white/60">{settings.accent_theme}</span>
                                <span className="text-white/20">·</span>
                                <span>{settings.dark_mode ? "Dark" : "Light"}</span>
                            </div>
                        </>
                    ) : (
                        <div
                            className="mx-auto h-2.5 w-2.5 rounded-full ring-1 ring-white/20"
                            style={{ backgroundColor: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
                            title={`${settings.accent_theme} theme`}
                        />
                    )}
                </div>

            </div>
        </aside>
    );
}