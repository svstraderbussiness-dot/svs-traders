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
        liveUpdate(field, !settings[field]);
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
        <section className="rounded-3xl bg-[#1d1d2e] border border-white/10 shadow-xl p-5 lg:p-6">
            <div className="mb-5">
                <h2 className="text-2xl font-bold">{title}</h2>
                {subtitle ? <p className="text-white/50 text-sm mt-1">{subtitle}</p> : null}
            </div>
            {children}
        </section>
    );

    const Toggle = ({ label, hint, checked, onToggle }) => (
        <button
            type="button"
            onClick={onToggle}
            className={`w-full rounded-2xl border p-4 text-left transition ${checked
                ? "border-white/20 bg-white/10"
                : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
        >
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="font-semibold">{label}</div>
                    {hint ? <div className="mt-1 text-sm text-white/50">{hint}</div> : null}
                </div>
                <div
                    className={`flex h-8 w-14 items-center rounded-full p-1 transition ${checked ? "justify-end" : "justify-start"
                        }`}
                    style={{
                        backgroundColor: checked ? accentColor : "rgba(255,255,255,0.18)",
                    }}
                >
                    <div className="h-6 w-6 rounded-full bg-white shadow" />
                </div>
            </div>
        </button>
    );

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
                                <label className="mb-2 block text-sm text-white/70">Business Name</label>
                                <input
                                    value={settings.business_name}
                                    onChange={(e) => liveUpdate("business_name", e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none placeholder:text-white/40"
                                    placeholder="SVS TRADERS"
                                />
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm text-white/70">Owner Name</label>
                                    <input
                                        value={settings.owner_name}
                                        onChange={(e) => liveUpdate("owner_name", e.target.value)}
                                        className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none placeholder:text-white/40"
                                        placeholder="KARUN"
                                    />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm text-white/70">Phone</label>
                                    <input
                                        value={settings.phone}
                                        onChange={(e) => liveUpdate("phone", e.target.value)}
                                        className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none placeholder:text-white/40"
                                        placeholder="9705583982"
                                    />
                                </div>
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
                                    <label className="mb-2 block text-sm text-white/70">Default Payment Mode</label>
                                    <select
                                        value={settings.default_payment_mode}
                                        onChange={(e) => liveUpdate("default_payment_mode", e.target.value)}
                                        className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none"
                                    >
                                        <option>Cash</option>
                                        <option>Card</option>
                                        <option>UPI</option>
                                        <option>Credit</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm text-white/70">Default Discount Type</label>
                                    <select
                                        value={settings.default_discount_type}
                                        onChange={(e) => liveUpdate("default_discount_type", e.target.value)}
                                        className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none"
                                    >
                                        <option value="₹">₹ Amount</option>
                                        <option value="%">% Percent</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Toggle
                                    label="Auto Invoice Number"
                                    checked={settings.auto_invoice}
                                    onToggle={() => toggleField("auto_invoice")}
                                    hint="Automatically create the next invoice code."
                                />
                                <Toggle
                                    label="WhatsApp Receipt"
                                    checked={settings.whatsapp_receipt}
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
                                    checked={settings.barcode_scan_mode}
                                    onToggle={() => toggleField("barcode_scan_mode")}
                                    hint="Prioritize barcode lookup in billing."
                                />
                                <Toggle
                                    label="Auto Restore Returned Stock"
                                    checked={settings.auto_restore_return_stock}
                                    onToggle={() => toggleField("auto_restore_return_stock")}
                                    hint="Accepted returns go back into inventory."
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
                                    checked={settings.compact_view}
                                    onToggle={() => toggleField("compact_view")}
                                    hint="Tighter spacing for data-heavy screens."
                                />
                                <Toggle
                                    label="Sidebar Collapsed"
                                    checked={settings.sidebar_collapsed}
                                    onToggle={() => toggleField("sidebar_collapsed")}
                                    hint="Change sidebar width immediately."
                                />
                            </div>

                            <div>
                                <label className="mb-3 block text-sm text-white/70">Accent Theme</label>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {["Blue", "Green", "Purple", "Orange"].map((theme) => {
                                        const active = settings.accent_theme === theme;
                                        return (
                                            <button
                                                key={theme}
                                                type="button"
                                                onClick={() => liveUpdate("accent_theme", theme)}
                                                className={`rounded-2xl border px-4 py-3 font-semibold transition ${active
                                                    ? "border-white/30 bg-white/10"
                                                    : "border-white/10 bg-white/5 hover:bg-white/10"
                                                    }`}
                                                style={
                                                    active ? { boxShadow: `0 0 0 1px ${accentColor} inset` } : undefined
                                                }
                                            >
                                                {theme}
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