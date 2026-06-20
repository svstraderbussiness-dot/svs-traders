import { useMemo, useState } from "react";
import { DEFAULT_SETTINGS, useTheme } from "../context/ThemeContext";

export default function Settings() {
    const {
        settings,
        loading,
        saving,
        refreshSettings,
        persistSettings,
        updateSetting,
        accentColorMap,
    } = useTheme();

    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");

    const accentColor = useMemo(() => {
        return accentColorMap?.[settings.accent_theme] || "#2563eb";
    }, [accentColorMap, settings.accent_theme]);

    const liveUpdate = (field, value) => {
        setNotice("");
        setError("");
        updateSetting(field, value, { persist: true });
    };

    const toggleField = (field) => {
        liveUpdate(field, !Boolean(settings?.[field]));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setNotice("");
        setError("");

        try {
            await persistSettings();
            setNotice("Settings saved successfully.");
        } catch (err) {
            console.error(err);
            setError(err?.message || "Failed to save settings.");
        }
    };

    const resetToDefaults = async () => {
        setNotice("");
        setError("");

        try {
            await persistSettings(DEFAULT_SETTINGS);
            setNotice("Defaults restored successfully.");
        } catch (err) {
            console.error(err);
            setError(err?.message || "Failed to restore defaults.");
        }
    };

    const Section = ({ title, subtitle, children }) => (
        <section
            className="rounded-3xl border border-white/[0.08] p-5 shadow-xl lg:p-6 relative overflow-hidden"
            style={{ background: "linear-gradient(145deg, #0f1e3a 0%, #0a1428 100%)" }}
        >
            <div
                className="absolute left-0 top-6 bottom-6 w-[3px] rounded-r-full"
                style={{ backgroundColor: accentColor, opacity: 0.7 }}
            />
            <div className="mb-5 pl-3">
                <h2 className="text-lg font-bold tracking-tight">{title}</h2>
                {subtitle ? <p className="text-white/45 text-xs font-medium mt-1">{subtitle}</p> : null}
            </div>
            <div className="pl-3">{children}</div>
        </section>
    );

    const Toggle = ({ label, hint, checked, onToggle }) => (
        <button
            type="button"
            onClick={onToggle}
            className={`w-full rounded-xl border p-4 text-left transition-all duration-200 ${checked
                    ? "border-white/15 bg-white/[0.07]"
                    : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
        >
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="text-sm font-semibold">{label}</div>
                    {hint ? <div className="mt-0.5 text-xs text-white/45 font-medium">{hint}</div> : null}
                </div>
                {/* Animated toggle pill */}
                <div
                    className="relative flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-250"
                    style={{ backgroundColor: checked ? accentColor : "rgba(255,255,255,0.15)" }}
                >
                    <div
                        className="h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-250"
                        style={{ transform: checked ? "translateX(20px)" : "translateX(0px)" }}
                    />
                </div>
            </div>
        </button>
    );

    const numberField = (key, fallback = 0) => {
        const raw = settings?.[key];
        const value = raw === undefined || raw === null || raw === "" ? fallback : raw;
        return Number.isFinite(Number(value)) ? Number(value) : fallback;
    };

    return (
        <div className="min-h-screen bg-[#061b4d] text-white p-4 lg:p-6">
            <div className="mx-auto max-w-[1600px]">
                <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="text-4xl lg:text-5xl font-bold">Settings</h1>
                        <p className="mt-2 text-white/70">
                            Manage business details, billing rules, inventory controls, and app preferences.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={refreshSettings}
                            disabled={loading}
                            className="rounded-2xl bg-white/10 px-5 py-3 font-semibold transition hover:bg-white/15 disabled:opacity-50"
                        >
                            {loading ? "Loading..." : "Reload"}
                        </button>
                        <button
                            type="submit"
                            form="settings-form"
                            disabled={saving}
                            className="rounded-2xl px-5 py-3 font-semibold text-white transition disabled:opacity-50"
                            style={{ backgroundColor: accentColor }}
                        >
                            {saving ? "Saving..." : "Save Settings"}
                        </button>
                    </div>
                </div>

                {notice ? (
                    <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-emerald-200">
                        {notice}
                    </div>
                ) : null}

                {error ? (
                    <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-200">
                        {error}
                    </div>
                ) : null}

                <form
                    id="settings-form"
                    onSubmit={handleSave}
                    className="grid grid-cols-1 gap-6 xl:grid-cols-2"
                >
                    <Section
                        title="Business Information"
                        subtitle="Shown in invoices, receipts, reports, and WhatsApp messages."
                    >
                        <div className="grid gap-4">
                            <div>
                                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
                                    Business Name
                                </label>
                                <input
                                    value={settings?.business_name ?? ""}
                                    onChange={(e) =>
                                        liveUpdate("business_name", e.target.value)
                                    }
                                    className="w-full rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-white/30 transition-all duration-150"
                                    placeholder="SVS TRADERS"
                                />
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
                                        Owner Name
                                    </label>
                                    <input
                                        value={settings?.owner_name ?? ""}
                                        onChange={(e) =>
                                            liveUpdate("owner_name", e.target.value)
                                        }
                                        className="w-full rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-white/30 transition-all duration-150"
                                        placeholder="KARUN"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
                                        Phone
                                    </label>
                                    <input
                                        value={settings?.phone ?? ""}
                                        onChange={(e) =>
                                            liveUpdate("phone", e.target.value)
                                        }
                                        className="w-full rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-white/30 transition-all duration-150"
                                        placeholder="9705583982"
                                    />
                                </div>
                            </div>



                            <div>
                                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={settings?.email ?? ""}
                                    onChange={(e) =>
                                        liveUpdate("email", e.target.value)
                                    }
                                    className="w-full rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-white/30 transition-all duration-150"
                                    placeholder="store@example.com"
                                />
                            </div>
                        </div>
                    </Section>

                    <Section
                        title="Billing Preferences"
                        subtitle="Invoice numbering, default payment mode, discount format, and receipts."
                    >
                        <div className="grid gap-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
                                        Default Payment Mode
                                    </label>
                                    <select
                                        value={settings?.default_payment_mode ?? "Cash"}
                                        onChange={(e) =>
                                            liveUpdate("default_payment_mode", e.target.value)
                                        }
                                        className="w-full rounded-xl border border-white/[0.10] bg-[#0e1a35] px-4 py-3 text-sm text-white transition-all duration-150"
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="Card">Card</option>
                                        <option value="UPI">UPI</option>
                                        <option value="Credit">Credit</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
                                        Default Discount Type
                                    </label>
                                    <select
                                        value={settings?.default_discount_type ?? "₹"}
                                        onChange={(e) =>
                                            liveUpdate("default_discount_type", e.target.value)
                                        }
                                        className="w-full rounded-xl border border-white/[0.10] bg-[#0e1a35] px-4 py-3 text-sm text-white transition-all duration-150"
                                    >
                                        <option value="₹">₹ Amount</option>
                                        <option value="%">% Percent</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Toggle
                                    label="Auto Invoice Number"
                                    checked={Boolean(settings?.auto_invoice)}
                                    onToggle={() => toggleField("auto_invoice")}
                                    hint="Automatically create the next invoice code."
                                />
                                <Toggle
                                    label="WhatsApp Receipt"
                                    checked={Boolean(settings?.whatsapp_receipt)}
                                    onToggle={() => toggleField("whatsapp_receipt")}
                                    hint="Send a receipt link on WhatsApp."
                                />
                            </div>

                        </div>
                    </Section>

                    <Section
                        title="Inventory Controls"
                        subtitle="How stock behaves when items are scanned, returned, and tracked."
                    >
                        <div className="grid gap-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Toggle
                                    label="Barcode Scan Mode"
                                    checked={Boolean(settings?.barcode_scan_mode)}
                                    onToggle={() => toggleField("barcode_scan_mode")}
                                    hint="Prioritize barcode lookup in billing."
                                />
                                <Toggle
                                    label="Auto Restore Returned Stock"
                                    checked={Boolean(settings?.auto_restore_return_stock)}
                                    onToggle={() => toggleField("auto_restore_return_stock")}
                                    hint="Accepted returns go back into inventory."
                                />
                            </div>


                            <div className="grid gap-4 md:grid-cols-2">
                                <Toggle
                                    label="Auto Print Invoice"
                                    checked={Boolean(settings?.auto_print_invoice)}
                                    onToggle={() => toggleField("auto_print_invoice")}
                                    hint="Automatically trigger receipt print after billing."
                                />

                            </div>
                        </div>
                    </Section>

                    <Section
                        title="App Preferences"
                        subtitle="Visual preferences applied across the application."
                    >
                        <div className="grid gap-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Toggle
                                    label="Compact View"
                                    checked={Boolean(settings?.compact_view)}
                                    onToggle={() => toggleField("compact_view")}
                                    hint="Tighter spacing for data-heavy screens."
                                />
                                <Toggle
                                    label="Sidebar Collapsed"
                                    checked={Boolean(settings?.sidebar_collapsed)}
                                    onToggle={() => toggleField("sidebar_collapsed")}
                                    hint="Change sidebar width immediately."
                                />
                            </div>


                            <div>
                                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
                                    Accent Theme
                                </label>
                                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                                    {[
                                        { name: "Blue", color: "#2563eb" },
                                        { name: "Green", color: "#10b981" },
                                        { name: "Purple", color: "#8b5cf6" },
                                        { name: "Orange", color: "#f97316" },
                                    ].map(({ name, color }) => {
                                        const active = settings?.accent_theme === name;
                                        return (
                                            <button
                                                key={name}
                                                type="button"
                                                onClick={() => liveUpdate("accent_theme", name)}
                                                className={`btn-press flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${active
                                                        ? "border-white/25 bg-white/10"
                                                        : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]"
                                                    }`}
                                                style={
                                                    active
                                                        ? { boxShadow: `0 0 0 1.5px ${color} inset` }
                                                        : undefined
                                                }
                                            >
                                                <span
                                                    className="h-3 w-3 rounded-full shrink-0 ring-2 ring-white/20"
                                                    style={{ backgroundColor: color }}
                                                />
                                                {name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </Section>

                    <div className="xl:col-span-2 flex flex-col gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={resetToDefaults}
                            className="rounded-2xl bg-white/10 px-6 py-3 font-semibold transition hover:bg-white/15"
                        >
                            Reset Defaults
                        </button>
                        <button
                            type="button"
                            onClick={refreshSettings}
                            className="rounded-2xl bg-white/10 px-6 py-3 font-semibold transition hover:bg-white/15"
                        >
                            Reload From DB
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}