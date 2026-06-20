import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    ArrowRight,
    Boxes,
    FileText,
    Package2,
    RefreshCw,
    RotateCcw,
    ShoppingCart,
    Store,
    TrendingUp,
    Wallet,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../context/ThemeContext";

/* ── Animated counter hook ── */
function useAnimatedCounter(target, duration = 900) {
    const [display, setDisplay] = useState(target);
    const prevRef = useRef(target);
    const rafRef = useRef(null);

    useEffect(() => {
        const from = prevRef.current;
        const to = target;
        if (from === to) return;
        prevRef.current = to;

        const startTime = performance.now();
        const diff = to - from;

        const tick = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(from + diff * eased);
            if (progress < 1) rafRef.current = requestAnimationFrame(tick);
        };

        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [target, duration]);

    return display;
}

/* ── Ripple click helper ── */
function addRipple(e) {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple-circle';
    Object.assign(ripple.style, {
        width: `${size}px`, height: `${size}px`,
        left: `${x}px`, top: `${y}px`,
    });
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
}

function money(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function pad2(n) {
    return String(n).padStart(2, "0");
}

function toSqlDateTime(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

function startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

function startOfMonth(date = new Date()) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

function daysAgo(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() - days);
    return d;
}

function parseDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function isSameLocalDay(a, b) {
    if (!a || !b) return false;
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function isSameLocalMonth(a, b) {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

const toneConfig = {
    blue:  { card: "bg-white/[0.05] border-white/10", icon: "bg-blue-500/10", glow: "0 0 20px rgba(37,99,235,0.2)" },
    green: { card: "bg-emerald-500/10 border-emerald-500/20", icon: "bg-emerald-500/10", glow: "0 0 20px rgba(16,185,129,0.2)" },
    red:   { card: "bg-red-500/10 border-red-500/20", icon: "bg-red-500/10", glow: "0 0 20px rgba(239,68,68,0.2)" },
    amber: { card: "bg-amber-500/10 border-amber-500/20", icon: "bg-amber-500/10", glow: "0 0 20px rgba(245,158,11,0.2)" },
};

function StatCard({ title, value, hint, icon: Icon, accentColor, tone = "blue", stagger = 0 }) {
    const cfg = toneConfig[tone] || toneConfig.blue;

    return (
        <div
            className={`stat-card animate-card-entrance rounded-3xl border p-5 shadow-lg stagger-${stagger} ${cfg.card}`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{title}</div>
                    <div
                        className="mt-2.5 text-3xl font-bold tracking-tight text-white tabular-nums"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                        {value}
                    </div>
                    {hint ? (
                        <div className="mt-2 text-[11px] text-white/38 font-medium">{hint}</div>
                    ) : null}
                </div>
                {Icon ? (
                    <div
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${cfg.icon}`}
                        style={{ boxShadow: cfg.glow }}
                    >
                        <Icon size={18} style={{ color: accentColor || "#fff" }} />
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function SectionCard({ title, subtitle, right, children }) {
    return (
        <section
            className="section-card animate-fade-in-up rounded-3xl border border-white/[0.08] p-5 shadow-xl lg:p-6"
            style={{ background: "linear-gradient(145deg, #0f1e3a 0%, #0a1428 100%)" }}
        >
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold tracking-tight">{title}</h2>
                    {subtitle ? <p className="mt-1 text-xs text-white/40 font-medium">{subtitle}</p> : null}
                </div>
                {right ? <div>{right}</div> : null}
            </div>
            {children}
        </section>
    );
}

export default function Dashboard() {
    const navigate = useNavigate();
    const { settings, accentColorMap } = useTheme();

    const accentColor = useMemo(() => {
        return accentColorMap?.[settings.accent_theme] || "#2563eb";
    }, [accentColorMap, settings.accent_theme]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [lastUpdated, setLastUpdated] = useState("");

    const [todayInvoices, setTodayInvoices] = useState([]);
    const [weekInvoices, setWeekInvoices] = useState([]);
    const [monthInvoices, setMonthInvoices] = useState([]);
    const [products, setProducts] = useState([]);
    const [monthInvoiceItems, setMonthInvoiceItems] = useState([]);
    const [customersMap, setCustomersMap] = useState({});
    const [returnsData, setReturnsData] = useState([]);

    const loadDashboard = useCallback(async ({ silent = false } = {}) => {
        if (silent) setRefreshing(true);
        else setLoading(true);

        setError("");

        try {
            const now = new Date();
            const todayStartDate = startOfDay(now);
            const todayEndDate = endOfDay(now);
            const weekStartDate = startOfDay(daysAgo(now, 6));
            const monthStartDate = startOfMonth(now);
            const returnsQueryStartDate =
                weekStartDate.getTime() < monthStartDate.getTime()
                    ? weekStartDate
                    : monthStartDate;

            const todayStart = toSqlDateTime(todayStartDate);
            const todayEnd = toSqlDateTime(todayEndDate);
            const weekStart = toSqlDateTime(weekStartDate);
            const monthStart = toSqlDateTime(monthStartDate);
            const returnsStart = toSqlDateTime(returnsQueryStartDate);

            const [todayRes, weekRes, monthRes, productsRes, returnsRes] = await Promise.all([
                supabase
                    .from("invoices")
                    .select(
                        "id, invoice_code, customer_id, subtotal, discount_amount, final_amount, payment_mode, payment_status, total_items, created_at"
                    )
                    .gte("created_at", todayStart)
                    .lte("created_at", todayEnd)
                    .order("created_at", { ascending: false }),

                supabase
                    .from("invoices")
                    .select(
                        "id, invoice_code, customer_id, subtotal, discount_amount, final_amount, payment_mode, payment_status, total_items, created_at"
                    )
                    .gte("created_at", weekStart)
                    .lte("created_at", todayEnd)
                    .order("created_at", { ascending: true }),

                supabase
                    .from("invoices")
                    .select(
                        "id, invoice_code, customer_id, subtotal, discount_amount, final_amount, payment_mode, payment_status, total_items, created_at"
                    )
                    .gte("created_at", monthStart)
                    .lte("created_at", todayEnd)
                    .order("created_at", { ascending: false }),

                supabase
                    .from("products")
                    .select(
                        "id, barcode, product_code, style_code, size, brand, quantity, mrp, created_at"
                    ),

                supabase
                    .from("returns")
                    .select("id, invoice_code, status, quantity, refund_amount, created_at")
                    .gte("created_at", returnsStart)
                    .lte("created_at", todayEnd)
                    .order("created_at", { ascending: false }),
            ]);

            if (todayRes.error) throw todayRes.error;
            if (weekRes.error) throw weekRes.error;
            if (monthRes.error) throw monthRes.error;
            if (productsRes.error) throw productsRes.error;
            if (returnsRes.error) throw returnsRes.error;

            const todayData = todayRes.data || [];
            const weekData = weekRes.data || [];
            const monthData = monthRes.data || [];
            const productsData = (productsRes.data || []).map((product) => ({
                ...product,
                product_name: product.product_code || "Product",
                selling_price: product.mrp ?? 0,
            }));
            const returnsRows = returnsRes.data || [];

            setTodayInvoices(todayData);
            setWeekInvoices(weekData);
            setMonthInvoices(monthData);
            setProducts(productsData);
            setReturnsData(returnsRows);

            const customerIds = [...new Set(monthData.map((inv) => inv.customer_id).filter(Boolean))];
            if (customerIds.length > 0) {
                const { data: customerRows, error: customerError } = await supabase
                    .from("customers")
                    .select("id, customer_name, phone_number, email")
                    .in("id", customerIds);

                if (customerError) throw customerError;

                const map = Object.fromEntries(
                    (customerRows || []).map((row) => [
                        row.id,
                        {
                            customer_name: row.customer_name || "-",
                            phone_number: row.phone_number || "-",
                            email: row.email || "-",
                        },
                    ])
                );

                setCustomersMap(map);
            } else {
                setCustomersMap({});
            }

            const monthInvoiceIds = monthData.map((inv) => inv.id);
            if (monthInvoiceIds.length > 0) {
                const { data: itemsRows, error: itemsError } = await supabase
                    .from("invoice_items")
                    .select("id, invoice_id, product_id, quantity, price, subtotal, barcode, product_name, brand")
                    .in("invoice_id", monthInvoiceIds);

                if (itemsError) throw itemsError;
                setMonthInvoiceItems(itemsRows || []);
            } else {
                setMonthInvoiceItems([]);
            }

            setLastUpdated(new Date().toLocaleString());
        } catch (err) {
            console.error(err);
            setError(err?.message || "Failed to load dashboard data.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void loadDashboard();

        const timer = window.setInterval(() => {
            void loadDashboard({ silent: true });
        }, 30000);

        return () => window.clearInterval(timer);
    }, [loadDashboard]);

    const summary = useMemo(() => {
        const now = new Date();

        const todayGrossRevenue = todayInvoices.reduce(
            (sum, inv) => sum + Number(inv.final_amount || 0),
            0
        );
        const todayBills = todayInvoices.length;
        const todayItemsSold = todayInvoices.reduce(
            (sum, inv) => sum + Number(inv.total_items || 0),
            0
        );

        const monthGrossRevenue = monthInvoices.reduce(
            (sum, inv) => sum + Number(inv.final_amount || 0),
            0
        );
        const monthBills = monthInvoices.length;
        const monthItemsSold = monthInvoices.reduce(
            (sum, inv) => sum + Number(inv.total_items || 0),
            0
        );

        const acceptedReturnsToday = returnsData.filter((r) => {
            const created = parseDate(r.created_at);
            const status = String(r.status || "").toLowerCase();
            return status === "accepted" && created && isSameLocalDay(created, now);
        });

        const acceptedReturnsMonth = returnsData.filter((r) => {
            const created = parseDate(r.created_at);
            const status = String(r.status || "").toLowerCase();
            return status === "accepted" && created && isSameLocalMonth(created, now);
        });

        const returnsTodayCount = acceptedReturnsToday.length;
        const returnsTodayRefund = acceptedReturnsToday.reduce(
            (sum, r) => sum + Number(r.refund_amount || 0),
            0
        );

        const monthAcceptedRefund = acceptedReturnsMonth.reduce(
            (sum, r) => sum + Number(r.refund_amount || 0),
            0
        );

        const todayRevenue = todayGrossRevenue - returnsTodayRefund;
        const monthRevenue = monthGrossRevenue - monthAcceptedRefund;

        const pendingCreditBills = monthInvoices.filter((inv) => {
            const status = String(inv.payment_status || "").toLowerCase();
            const mode = String(inv.payment_mode || "").toLowerCase();
            return status !== "paid" || mode === "credit";
        }).length;

        const inventoryValue = products.reduce((sum, product) => {
            const qty = Number(product.quantity || 0);
            const price = Number(product.mrp || 0);
            return sum + qty * price;
        }, 0);

        return {
            todayRevenue,
            todayBills,
            todayItemsSold,
            monthRevenue,
            monthBills,
            monthItemsSold,
            returnsTodayCount,
            returnsTodayRefund,
            pendingCreditBills,
            inventoryValue,
        };
    }, [monthInvoices, products, returnsData, todayInvoices]);

    const trendData = useMemo(() => {
        const now = new Date();
        const weekStart = startOfDay(daysAgo(now, 6));

        const labels = Array.from({ length: 7 }, (_, idx) => {
            const d = daysAgo(now, 6 - idx);
            return {
                key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
                label: d.toLocaleDateString(undefined, { weekday: "short" }),
            };
        });

        const acceptedRefundByDay = new Map();

        returnsData.forEach((r) => {
            const created = parseDate(r.created_at);
            const status = String(r.status || "").toLowerCase();

            if (!created || status !== "accepted") return;
            if (created < weekStart || created > endOfDay(now)) return;

            const key = `${created.getFullYear()}-${pad2(created.getMonth() + 1)}-${pad2(
                created.getDate()
            )}`;

            acceptedRefundByDay.set(
                key,
                (acceptedRefundByDay.get(key) || 0) + Number(r.refund_amount || 0)
            );
        });

        return labels.map((item) => {
            const grossRevenue = weekInvoices.reduce((sum, inv) => {
                const invDate = new Date(inv.created_at);
                const key = `${invDate.getFullYear()}-${pad2(invDate.getMonth() + 1)}-${pad2(
                    invDate.getDate()
                )}`;
                if (key === item.key) return sum + Number(inv.final_amount || 0);
                return sum;
            }, 0);

            const acceptedRefund = Number(acceptedRefundByDay.get(item.key) || 0);

            return {
                ...item,
                revenue: grossRevenue - acceptedRefund,
            };
        });
    }, [returnsData, weekInvoices]);

    const brandPerformance = useMemo(() => {
        const grouped = new Map();

        monthInvoiceItems.forEach((item) => {
            const brand = item.brand || "Unbranded";
            const qty = Number(item.quantity || 0);
            const revenue = Number(item.subtotal || 0);

            const existing = grouped.get(brand) || {
                brand,
                qty: 0,
                revenue: 0,
            };

            existing.qty += qty;
            existing.revenue += revenue;
            grouped.set(brand, existing);
        });

        return [...grouped.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
    }, [monthInvoiceItems]);

    const paymentBreakdown = useMemo(() => {
        const grouped = new Map();

        monthInvoices.forEach((inv) => {
            const mode = inv.payment_mode || "Unknown";
            const existing = grouped.get(mode) || {
                mode,
                bills: 0,
                revenue: 0,
            };

            existing.bills += 1;
            existing.revenue += Number(inv.final_amount || 0);
            grouped.set(mode, existing);
        });

        return [...grouped.values()].sort((a, b) => b.revenue - a.revenue);
    }, [monthInvoices]);

    const recentBills = useMemo(() => {
        return [...monthInvoices].slice(0, 8).map((inv) => ({
            ...inv,
            customer_name: customersMap[inv.customer_id]?.customer_name || "-",
            phone_number: customersMap[inv.customer_id]?.phone_number || "-",
        }));
    }, [customersMap, monthInvoices]);

    const maxTrend = Math.max(...trendData.map((d) => d.revenue), 1);
    const maxBrandRevenue = Math.max(...brandPerformance.map((d) => d.revenue), 1);

    return (
        <div className="min-h-screen bg-[#061b4d] text-white p-4 lg:p-6">
            <div className="mx-auto max-w-[1600px]">
                <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="text-4xl lg:text-5xl font-bold">Dashboard</h1>
                        <p className="mt-2 text-white/70">
                            Control center for sales, inventory, returns, reports, and billing activity.
                        </p>
                        {lastUpdated ? (
                            <div className="mt-2 text-sm text-white/45">Last updated: {lastUpdated}</div>
                        ) : null}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => loadDashboard()}
                            disabled={loading || refreshing}
                            className="btn-ripple rounded-2xl bg-white/10 px-5 py-3 font-semibold hover:bg-white/15"
                            onClick={(e) => { addRipple(e); loadDashboard(); }}
                            disabled={loading || refreshing}
                            style={{ opacity: loading || refreshing ? 0.5 : 1 }}
                        >
                            <RefreshCw size={15} className={`inline mr-2 ${loading || refreshing ? "animate-spin-smooth" : ""}`} />
                            {loading || refreshing ? "Refreshing…" : "Refresh"}
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { addRipple(e); navigate("/billing"); }}
                            className="btn-ripple rounded-2xl px-5 py-3 font-semibold text-white"
                            style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, boxShadow: `0 6px 20px ${accentColor}50` }}
                        >
                            Create Bill
                        </button>
                    </div>
                </div>

                {error ? (
                    <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-200">
                        {error}
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        title="Today Revenue"
                        value={`₹${money(summary.todayRevenue)}`}
                        hint={`${summary.todayBills} bills • ${summary.todayItemsSold} items sold`}
                        icon={Wallet}
                        accentColor={accentColor}
                        tone="blue"
                        stagger={1}
                    />
                    <StatCard
                        title="This Month Revenue"
                        value={`₹${money(summary.monthRevenue)}`}
                        hint={`${summary.monthBills} bills • ${summary.monthItemsSold} items sold`}
                        icon={TrendingUp}
                        accentColor={accentColor}
                        tone="green"
                        stagger={2}
                    />
                    <StatCard
                        title="Returns Today"
                        value={summary.returnsTodayCount}
                        hint={`Refund today: ₹${money(summary.returnsTodayRefund)}`}
                        icon={RotateCcw}
                        accentColor={accentColor}
                        tone="amber"
                        stagger={3}
                    />
                    <StatCard
                        title="Pending Credit Bills"
                        value={summary.pendingCreditBills}
                        hint="Bills pending payment collection"
                        icon={RefreshCw}
                        accentColor={accentColor}
                        tone="red"
                        stagger={4}
                    />
                    <StatCard
                        title="Inventory Value"
                        value={`₹${money(summary.inventoryValue)}`}
                        hint={`${products.length} products in stock`}
                        icon={Boxes}
                        accentColor={accentColor}
                        tone="blue"
                        stagger={5}
                    />
                    <StatCard
                        title="Today's Bills"
                        value={summary.todayBills}
                        hint="Live sales count for today"
                        icon={FileText}
                        accentColor={accentColor}
                        tone="green"
                        stagger={6}
                    />
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
                    <div className="space-y-6 xl:col-span-7">
                        <SectionCard
                            title="Revenue Trend"
                            subtitle="Last 7 days revenue movement"
                            right={
                                <div className="rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/60">
                                    7-day view
                                </div>
                            }
                        >
                            <div className="space-y-3.5">
                                {trendData.map((item) => {
                                    const percent = (item.revenue / maxTrend) * 100;
                                    return (
                                        <div key={item.key} className="space-y-1.5">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-white/60 font-semibold">{item.label}</span>
                                                <span className="text-white/50 font-medium">₹{money(item.revenue)}</span>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                                                <div
                                                    className="progress-bar-fill h-full rounded-full"
                                                    style={{
                                                        width: `${Math.max(percent, item.revenue > 0 ? 6 : 0)}%`,
                                                        background: `linear-gradient(90deg, ${accentColor}99, ${accentColor})`,
                                                        boxShadow: `0 0 8px ${accentColor}66`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </SectionCard>

                        <SectionCard
                            title="Brand Performance"
                            subtitle="Revenue and sold quantity by brand"
                            right={
                                <div className="rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/60">
                                    {brandPerformance.length} brands
                                </div>
                            }
                        >
                            {brandPerformance.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/50">
                                    No brand sales data found yet.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {brandPerformance.map((item) => (
                                        <div key={item.brand} className="space-y-1.5">
                                            <div className="flex items-center justify-between gap-4">
                                                <div>
                                                    <div className="text-sm font-semibold">{item.brand}</div>
                                                    <div className="text-xs text-white/40 font-medium">{item.qty} items sold</div>
                                                </div>
                                                <div className="text-sm font-bold">₹{money(item.revenue)}</div>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                                                <div
                                                    className="h-full rounded-full transition-all duration-700"
                                                    style={{
                                                        width: `${(item.revenue / maxBrandRevenue) * 100}%`,
                                                        background: `linear-gradient(90deg, ${accentColor}cc, ${accentColor})`,
                                                        boxShadow: `0 0 6px ${accentColor}55`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard
                            title="Payment Breakdown"
                            subtitle="Monthly bills and revenue by payment mode"
                        >
                            {paymentBreakdown.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/50">
                                    No payment data available yet.
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {paymentBreakdown.map((item) => (
                                        <div
                                            key={item.mode}
                                            className="rounded-2xl border border-white/10 bg-white/5 p-4"
                                        >
                                            <div className="text-white/60 text-sm">Mode</div>
                                            <div className="mt-1 text-xl font-bold">{item.mode}</div>
                                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                                <div className="rounded-2xl bg-black/20 p-3">
                                                    <div className="text-white/40">Bills</div>
                                                    <div className="mt-1 font-semibold">{item.bills}</div>
                                                </div>
                                                <div className="rounded-2xl bg-black/20 p-3">
                                                    <div className="text-white/40">Revenue</div>
                                                    <div className="mt-1 font-semibold">₹{money(item.revenue)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard
                            title="Recent Bills"
                            subtitle="Latest invoices generated in your system"
                            right={
                                <button
                                    type="button"
                                    onClick={() => navigate("/billing")}
                                    className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/15"
                                >
                                    Go to Billing <ArrowRight size={16} />
                                </button>
                            }
                        >
                            {recentBills.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/50">
                                    No bills found.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-white/10 text-left text-white/70">
                                                <th className="py-3 pr-4">Invoice</th>
                                                <th className="py-3 pr-4">Customer</th>
                                                <th className="py-3 pr-4">Time</th>
                                                <th className="py-3 pr-4">Payment</th>
                                                <th className="py-3 pr-4">Status</th>
                                                <th className="py-3 pr-4">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recentBills.map((inv) => {
                                                const status = String(inv.payment_status || "").toLowerCase();
                                                const badgeClass = status === "paid"
                                                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                                                    : status === "credit"
                                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
                                                    : "bg-red-500/15 text-red-300 border-red-500/25";
                                                return (
                                                    <tr key={inv.id} className="table-row-hover border-b border-white/[0.05]">
                                                        <td className="py-3 pr-4 font-mono text-xs font-semibold text-white/80">{inv.invoice_code}</td>
                                                        <td className="py-3 pr-4">
                                                            <div className="text-sm font-medium">{inv.customer_name || "-"}</div>
                                                            <div className="text-xs text-white/40">{inv.phone_number || "-"}</div>
                                                        </td>
                                                        <td className="py-3 pr-4 text-xs text-white/50">
                                                            {new Date(inv.created_at).toLocaleTimeString([], {
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                            })}
                                                        </td>
                                                        <td className="py-3 pr-4 text-xs text-white/60">{inv.payment_mode || "-"}</td>
                                                        <td className="py-3 pr-4">
                                                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}>
                                                                {inv.payment_status || "-"}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 pr-4 text-sm font-bold">₹{money(inv.final_amount)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </SectionCard>
                    </div>

                    <div className="space-y-6 xl:col-span-5">
                        <SectionCard
                            title="Inventory Insights"
                            subtitle="Stock overview and stock value"
                            right={
                                <button
                                    type="button"
                                    onClick={() => navigate("/svs-inventory")}
                                    className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/15"
                                >
                                    Open Inventory <ArrowRight size={16} />
                                </button>
                            }
                        >
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-white/5 p-4">
                                    <div className="text-sm text-white/45">Total Products</div>
                                    <div className="mt-1 text-2xl font-bold">{products.length}</div>
                                </div>
                                <div className="rounded-2xl bg-white/5 p-4">
                                    <div className="text-sm text-white/45">Inventory Value</div>
                                    <div className="mt-1 text-2xl font-bold">₹{money(summary.inventoryValue)}</div>
                                </div>
                            </div>
                        </SectionCard>

                        <SectionCard title="Quick Actions" subtitle="Common tasks for fast workflow">
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: "Create Bill", icon: ShoppingCart, path: "/billing" },
                                    { label: "Process Return", icon: RotateCcw, path: "/returns" },
                                    { label: "Upload Stock", icon: Package2, path: "/upload-stock" },
                                    { label: "Reports", icon: FileText, path: "/reports" },
                                    { label: "Analytics", icon: TrendingUp, path: "/analytics" },
                                    { label: "Inventory", icon: Store, path: "/svs-inventory" },
                                ].map((action) => {
                                    const Icon = action.icon;
                                    return (
                                        <button
                                            key={action.label}
                                            type="button"
                                            onClick={() => navigate(action.path)}
                                            className="quick-action-card rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-left"
                                        >
                                            <div
                                                className="qa-icon grid h-9 w-9 place-items-center rounded-xl"
                                                style={{
                                                    backgroundColor: `${accentColor}20`,
                                                    boxShadow: `0 0 12px ${accentColor}25`,
                                                }}
                                            >
                                                <Icon size={16} style={{ color: accentColor }} />
                                            </div>
                                            <div className="mt-3 text-sm font-bold">{action.label}</div>
                                            <div className="mt-0.5 text-xs text-white/35 font-medium">Open page →</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </SectionCard>
                    </div>
                </div>
            </div>
        </div>
    );
}