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
    { to: "/bevdass-inventory", label: "Bevdass Inventory", icon: Store },
    { to: "/svs-inventory", label: "SVS Inventory", icon: Boxes },
    { to: "/upload-stock", label: "Upload Stock", icon: Upload },
    { to: "/reports", label: "Reports", icon: BarChart3 },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/settings", label: "Settings", icon: Settings2 },
];

export default function Sidebar() {
    const { settings, updateSetting, accentColor } = useTheme();
    const navigate = useNavigate();
    const collapsed = Boolean(settings.sidebar_collapsed);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
    };

    const activeStyle = {
        backgroundColor: accentColor,
        color: "#ffffff",
        boxShadow: "0 16px 32px rgba(0,0,0,0.18)",
    };

    const inactiveStyle = {
        backgroundColor: "transparent",
    };

    return (
        <aside
            className={`sticky top-0 h-screen overflow-y-auto border-r border-white/10 bg-[#0b0b0d] text-white transition-all duration-300 ${collapsed ? "w-[84px]" : "w-[280px]"
                }`}
        >
            <div className="flex h-full flex-col p-4">
                <div className="flex items-center justify-between gap-3 mb-6">
                    <div className="min-w-0">
                        <div className="text-2xl font-black tracking-tight">
                            {collapsed ? "SVS" : "SVS TRADERS"}
                        </div>
                        {!collapsed ? (
                            <div className="text-xs text-white/45 mt-1 truncate">
                                Inventory • Billing • Reports
                            </div>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        onClick={() =>
                            updateSetting("sidebar_collapsed", !collapsed, { persist: true })
                        }
                        className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 hover:bg-white/15 transition"
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>
                </div>

                <nav className="flex-1 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;

                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                title={item.label}
                                className={({ isActive }) =>
                                    [
                                        "group flex items-center gap-3 rounded-2xl px-4 py-3 font-medium transition-all duration-200",
                                        collapsed ? "justify-center px-3" : "",
                                        isActive
                                            ? "text-white"
                                            : "text-white/70 hover:bg-white/5 hover:text-white",
                                    ].join(" ")
                                }
                                style={({ isActive }) => (isActive ? activeStyle : inactiveStyle)}
                            >
                                <Icon size={18} className="shrink-0" />
                                {!collapsed ? <span className="truncate">{item.label}</span> : null}
                            </NavLink>
                        );
                    })}
                </nav>

                <button
                    type="button"
                    onClick={handleLogout}
                    title="Logout"
                    className={`mt-4 flex items-center gap-3 rounded-2xl px-4 py-3 font-medium transition-all duration-200 bg-red-600 hover:bg-red-700 text-white ${collapsed ? "justify-center px-3" : ""
                        }`}
                >
                    <LogOut size={18} className="shrink-0" />
                    {!collapsed ? <span>Logout</span> : null}
                </button>

                <div className="mt-6 rounded-3xl bg-white/5 border border-white/10 p-4">
                    {!collapsed ? (
                        <>
                            <div className="text-sm font-semibold">Theme</div>
                            <div className="mt-2 flex items-center gap-2 text-sm text-white/60">
                                <span
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: accentColor }}
                                />
                                {settings.accent_theme} / {settings.dark_mode ? "Dark" : "Light"}
                            </div>
                        </>
                    ) : (
                        <div
                            className="mx-auto h-3 w-3 rounded-full"
                            style={{ backgroundColor: accentColor }}
                            title={`${settings.accent_theme} theme`}
                        />
                    )}
                </div>
            </div>
        </aside>
    );
}