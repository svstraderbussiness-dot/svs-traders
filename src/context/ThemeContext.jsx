import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { supabase } from "../lib/supabase";

export const DEFAULT_SETTINGS = {
    business_name: "SVS TRADERS",
    owner_name: "",
    email: "",
    phone: "",
    gst_number: "",
    address: "",
    invoice_prefix: "SVS",
    auto_invoice: true,
    default_payment_mode: "Cash",
    default_discount_type: "₹",
    whatsapp_receipt: true,
    email_receipt: false,
    credit_billing: true,
    low_stock_threshold: 5,
    auto_restore_return_stock: true,
    barcode_scan_mode: true,
    separate_brand_inventory: true,
    dark_mode: true,
    compact_view: false,
    sidebar_collapsed: false,
    accent_theme: "Blue",
};

const ACCENT_THEME_MAP = {
    Blue: "#2563eb",
    Green: "#10b981",
    Purple: "#8b5cf6",
    Orange: "#f97316",
    Red: "#ef4444",
};

const STORAGE_KEY = "svs-traders-settings-cache";

const ThemeContext = createContext(null);

const safeJsonParse = (value) => {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const hexToRgb = (hex) => {
    const normalized = String(hex || "#2563eb").replace("#", "");
    const expanded =
        normalized.length === 3
            ? normalized
                .split("")
                .map((c) => c + c)
                .join("")
            : normalized;

    const int = Number.parseInt(expanded, 16);
    if (Number.isNaN(int)) return "37, 99, 235";

    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `${r}, ${g}, ${b}`;
};

const mapRowToSettings = (row) => ({
    ...DEFAULT_SETTINGS,
    ...row,
    low_stock_threshold: Number(row?.low_stock_threshold ?? DEFAULT_SETTINGS.low_stock_threshold),
    auto_invoice: Boolean(row?.auto_invoice ?? DEFAULT_SETTINGS.auto_invoice),
    whatsapp_receipt: Boolean(row?.whatsapp_receipt ?? DEFAULT_SETTINGS.whatsapp_receipt),
    email_receipt: Boolean(row?.email_receipt ?? DEFAULT_SETTINGS.email_receipt),
    credit_billing: Boolean(row?.credit_billing ?? DEFAULT_SETTINGS.credit_billing),
    auto_restore_return_stock: Boolean(
        row?.auto_restore_return_stock ?? DEFAULT_SETTINGS.auto_restore_return_stock
    ),
    barcode_scan_mode: Boolean(row?.barcode_scan_mode ?? DEFAULT_SETTINGS.barcode_scan_mode),
    separate_brand_inventory: Boolean(
        row?.separate_brand_inventory ?? DEFAULT_SETTINGS.separate_brand_inventory
    ),
    dark_mode: Boolean(row?.dark_mode ?? DEFAULT_SETTINGS.dark_mode),
    compact_view: Boolean(row?.compact_view ?? DEFAULT_SETTINGS.compact_view),
    sidebar_collapsed: Boolean(row?.sidebar_collapsed ?? DEFAULT_SETTINGS.sidebar_collapsed),
});

const mapSettingsToPayload = (settings) => ({
    business_name: settings.business_name?.trim() || null,
    owner_name: settings.owner_name?.trim() || null,
    email: settings.email?.trim() || null,
    phone: settings.phone?.trim() || null,
    gst_number: settings.gst_number?.trim() || null,
    address: settings.address?.trim() || null,
    invoice_prefix: settings.invoice_prefix?.trim() || "SVS",
    auto_invoice: Boolean(settings.auto_invoice),
    default_payment_mode: settings.default_payment_mode || "Cash",
    default_discount_type: settings.default_discount_type || "₹",
    whatsapp_receipt: Boolean(settings.whatsapp_receipt),
    email_receipt: Boolean(settings.email_receipt),
    credit_billing: Boolean(settings.credit_billing),
    low_stock_threshold: Number(settings.low_stock_threshold || 5),
    auto_restore_return_stock: Boolean(settings.auto_restore_return_stock),
    barcode_scan_mode: Boolean(settings.barcode_scan_mode),
    separate_brand_inventory: Boolean(settings.separate_brand_inventory),
    dark_mode: Boolean(settings.dark_mode),
    compact_view: Boolean(settings.compact_view),
    sidebar_collapsed: Boolean(settings.sidebar_collapsed),
    accent_theme: settings.accent_theme || "Blue",
});

export function ThemeProvider({ children }) {
    const [settingsId, setSettingsId] = useState(null);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const settingsIdRef = useRef(null);
    const settingsRef = useRef(DEFAULT_SETTINGS);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        settingsIdRef.current = settingsId;
    }, [settingsId]);

    const applyThemeToDom = useCallback((nextSettings) => {
        const accent = ACCENT_THEME_MAP[nextSettings.accent_theme] || ACCENT_THEME_MAP.Blue;
        const isDark = Boolean(nextSettings.dark_mode);
        const isCompact = Boolean(nextSettings.compact_view);

        document.documentElement.style.setProperty("--accent-color", accent);
        document.documentElement.style.setProperty("--accent-rgb", hexToRgb(accent));
        document.documentElement.dataset.theme = isDark ? "dark" : "light";
        document.body.dataset.compact = isCompact ? "true" : "false";
        document.body.dataset.theme = isDark ? "dark" : "light";
        document.body.classList.toggle("theme-dark", isDark);
        document.body.classList.toggle("theme-light", !isDark);
        document.body.classList.toggle("theme-compact", isCompact);
        document.body.style.backgroundColor = isDark ? "#061b4d" : "#f8fafc";
        document.body.style.color = isDark ? "#ffffff" : "#0f172a";
    }, []);

    useEffect(() => {
        applyThemeToDom(settings);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // ignore localStorage failures
        }
    }, [applyThemeToDom, settings]);

    const refreshSettings = useCallback(async () => {
        setLoading(true);

        try {
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                const parsed = safeJsonParse(cached);
                if (parsed) {
                    setSettings((prev) => ({
                        ...prev,
                        ...parsed,
                    }));
                }
            }

            const { data, error } = await supabase
                .from("settings")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(1);

            if (error) throw error;

            const row = data?.[0] || null;
            if (row) {
                const next = mapRowToSettings(row);
                setSettingsId(row.id);
                settingsIdRef.current = row.id;
                setSettings(next);
            } else if (!cached) {
                setSettings(DEFAULT_SETTINGS);
            }
        } catch (err) {
            console.error("Failed to load settings:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshSettings();
    }, [refreshSettings]);

    const persistSettings = useCallback(async (overrideSettings = null) => {
        const nextSettings = mapRowToSettings(overrideSettings || settingsRef.current);
        const payload = mapSettingsToPayload(nextSettings);

        setSaving(true);
        try {
            const currentId = settingsIdRef.current;

            let result;
            if (currentId) {
                result = await supabase
                    .from("settings")
                    .update(payload)
                    .eq("id", currentId)
                    .select("*")
                    .single();
            } else {
                result = await supabase
                    .from("settings")
                    .insert([payload])
                    .select("*")
                    .single();
            }

            if (result.error) throw result.error;

            const saved = result.data ? mapRowToSettings(result.data) : nextSettings;
            setSettingsId(saved.id || currentId || null);
            settingsIdRef.current = saved.id || currentId || null;
            setSettings(saved);
            return saved;
        } finally {
            setSaving(false);
        }
    }, []);

    const updateSetting = useCallback(
        (key, value, options = {}) => {
            const { persist = false } = options;

            setSettings((prev) => {
                const next = {
                    ...prev,
                    [key]: value,
                };

                if (persist) {
                    void persistSettings(next);
                }

                return next;
            });
        },
        [persistSettings]
    );

    const value = useMemo(
        () => ({
            settings,
            settingsId,
            loading,
            saving,
            refreshSettings,
            persistSettings,
            updateSetting,
            accentColor: ACCENT_THEME_MAP[settings.accent_theme] || ACCENT_THEME_MAP.Blue,
            accentColorMap: ACCENT_THEME_MAP,
        }),
        [settings, settingsId, loading, saving, refreshSettings, persistSettings, updateSetting]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        throw new Error("useTheme must be used inside ThemeProvider");
    }
    return ctx;
}