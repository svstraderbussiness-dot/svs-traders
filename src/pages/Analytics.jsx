import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PIE_COLORS = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#14b8a6",
];

export default function Analytics() {
    const [products, setProducts] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [invoiceItems, setInvoiceItems] = useState([]);
    const [returnsData, setReturnsData] = useState([]);
    const [chartRange, setChartRange] = useState("30d");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [lastUpdated, setLastUpdated] = useState(null);

    const currency = useCallback((value) => {
        return Number(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }, []);

    const pad = (value) => String(value).padStart(2, "0");

    const parseDate = useCallback((value) => {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }, []);

    const toDayKey = useCallback(
        (value) => {
            const d = parseDate(value);
            if (!d) return null;
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        },
        [parseDate]
    );

    const formatDayLabel = useCallback((key) => {
        if (!key) return "-";
        const d = new Date(`${key}T00:00:00`);
        if (Number.isNaN(d.getTime())) return key;
        return d.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
    }, []);

    const isToday = useCallback(
        (value) => {
            const d = parseDate(value);
            if (!d) return false;
            const now = new Date();
            return (
                d.getFullYear() === now.getFullYear() &&
                d.getMonth() === now.getMonth() &&
                d.getDate() === now.getDate()
            );
        },
        [parseDate]
    );

    const isWithinDays = useCallback(
        (value, days) => {
            const d = parseDate(value);
            if (!d) return false;
            if (days === Infinity) return true;
            const from = new Date();
            from.setHours(0, 0, 0, 0);
            from.setDate(from.getDate() - (days - 1));
            return d >= from;
        },
        [parseDate]
    );

    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [productsRes, invoicesRes, itemsRes, returnsRes] = await Promise.all([
                supabase.from("products").select("*").order("created_at", { ascending: false }),
                supabase.from("invoices").select("*").order("created_at", { ascending: false }),
                supabase.from("invoice_items").select("*"),
                supabase.from("returns").select("*").order("created_at", { ascending: false }),
            ]);

            if (productsRes.error) throw productsRes.error;
            if (invoicesRes.error) throw invoicesRes.error;
            if (itemsRes.error) throw itemsRes.error;
            if (returnsRes.error) throw returnsRes.error;

            setProducts(productsRes.data || []);
            setInvoices(invoicesRes.data || []);
            setInvoiceItems(itemsRes.data || []);
            setReturnsData(returnsRes.data || []);
            setLastUpdated(new Date());
        } catch (err) {
            console.error(err);
            setError(err?.message || "Failed to load analytics data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAnalytics();
        const timer = setInterval(loadAnalytics, 60000);
        return () => clearInterval(timer);
    }, [loadAnalytics]);

    const productById = useMemo(() => {
        const map = new Map();
        products.forEach((p) => {
            map.set(p.id, p);
        });
        return map;
    }, [products]);

    const selectedInvoices = useMemo(() => {
        const days =
            chartRange === "7d"
                ? 7
                : chartRange === "30d"
                    ? 30
                    : chartRange === "90d"
                        ? 90
                        : Infinity;

        return invoices.filter((inv) => isWithinDays(inv.created_at, days));
    }, [chartRange, invoices, isWithinDays]);

    const selectedInvoiceIds = useMemo(() => {
        return new Set(selectedInvoices.map((inv) => inv.id));
    }, [selectedInvoices]);

    const selectedItems = useMemo(() => {
        return invoiceItems.filter((item) => selectedInvoiceIds.has(item.invoice_id));
    }, [invoiceItems, selectedInvoiceIds]);

    const selectedReturns = useMemo(() => {
        const days =
            chartRange === "7d"
                ? 7
                : chartRange === "30d"
                    ? 30
                    : chartRange === "90d"
                        ? 90
                        : Infinity;

        return returnsData.filter((item) => isWithinDays(item.created_at, days));
    }, [chartRange, returnsData, isWithinDays]);

    const totals = useMemo(() => {
        const now = new Date();

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

        const todayInvoices = invoices.filter((inv) => isToday(inv.created_at));
        const weekInvoices = invoices.filter((inv) => isWithinDays(inv.created_at, 7));
        const monthInvoices = invoices.filter((inv) => {
            const d = parseDate(inv.created_at);
            return d && d >= startOfMonth && d <= endOfMonth;
        });
        const yearInvoices = invoices.filter((inv) => {
            const d = parseDate(inv.created_at);
            return d && d >= startOfYear && d <= endOfYear;
        });

        const totalBills = invoices.length;
        const todayRevenue = todayInvoices.reduce(
            (sum, inv) => sum + Number(inv.final_amount || 0),
            0
        );
        const weekRevenue = weekInvoices.reduce(
            (sum, inv) => sum + Number(inv.final_amount || 0),
            0
        );
        const monthRevenue = monthInvoices.reduce(
            (sum, inv) => sum + Number(inv.final_amount || 0),
            0
        );
        const yearRevenue = yearInvoices.reduce(
            (sum, inv) => sum + Number(inv.final_amount || 0),
            0
        );

        const totalDiscount = invoices.reduce(
            (sum, inv) => sum + Number(inv.discount_amount || 0),
            0
        );
        const totalIncome = invoices.reduce(
            (sum, inv) => sum + Number(inv.final_amount || 0),
            0
        );

        const totalReturnRefund = returnsData.reduce(
            (sum, item) => sum + Number(item.refund_amount || 0),
            0
        );
        const totalReturnQty = returnsData.reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
        );
        const totalReturns = returnsData.length;

        const paymentCount = invoices.reduce((acc, inv) => {
            const key = inv.payment_mode || "Unknown";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const paymentRevenue = invoices.reduce((acc, inv) => {
            const key = inv.payment_mode || "Unknown";
            acc[key] = (acc[key] || 0) + Number(inv.final_amount || 0);
            return acc;
        }, {});

        const inventoryValue = products.reduce(
            (sum, p) => sum + Number(p.quantity || 0) * Number(p.selling_price || p.mrp || 0),
            0
        );

        const billAverage = totalBills > 0 ? totalIncome / totalBills : 0;
        const netRevenue = totalIncome - totalReturnRefund;

        return {
            todayRevenue,
            weekRevenue,
            monthRevenue,
            yearRevenue,
            totalBills,
            totalIncome,
            totalDiscount,
            billAverage,
            totalReturnRefund,
            totalReturnQty,
            totalReturns,
            inventoryValue,
            paymentCount,
            paymentRevenue,
            netRevenue,
        };
    }, [invoices, isToday, isWithinDays, parseDate, products, returnsData]);

    const revenueTrend = useMemo(() => {
        const map = new Map();

        selectedInvoices.forEach((inv) => {
            const key = toDayKey(inv.created_at);
            if (!key) return;

            const existing = map.get(key) || {
                day: key,
                label: formatDayLabel(key),
                revenue: 0,
                bills: 0,
            };

            existing.revenue += Number(inv.final_amount || 0);
            existing.bills += 1;
            map.set(key, existing);
        });

        return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
    }, [formatDayLabel, selectedInvoices, toDayKey]);

    const brandAnalytics = useMemo(() => {
        const map = new Map();

        selectedItems.forEach((item) => {
            const brand =
                item.brand || productById.get(item.product_id)?.brand || "Unknown";
            const qty = Number(item.quantity || 0);
            const amount =
                Number(item.subtotal || 0) || qty * Number(item.price || 0);

            const existing = map.get(brand) || {
                brand,
                qty: 0,
                revenue: 0,
            };

            existing.qty += qty;
            existing.revenue += amount;
            map.set(brand, existing);
        });

        return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    }, [productById, selectedItems]);

    const topProducts = useMemo(() => {
        const map = new Map();

        selectedItems.forEach((item) => {
            const productId =
                item.product_id || item.barcode || `${item.product_name}-${item.brand}`;
            const productName =
                item.product_name ||
                productById.get(item.product_id)?.product_name ||
                "Product";
            const brand =
                item.brand || productById.get(item.product_id)?.brand || "Unknown";
            const barcode =
                item.barcode || productById.get(item.product_id)?.barcode || "-";
            const qty = Number(item.quantity || 0);
            const amount =
                Number(item.subtotal || 0) || qty * Number(item.price || 0);

            const existing = map.get(productId) || {
                productId,
                barcode,
                productName,
                brand,
                qty: 0,
                revenue: 0,
            };

            existing.qty += qty;
            existing.revenue += amount;
            map.set(productId, existing);
        });

        return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
    }, [productById, selectedItems]);

    const paymentAnalytics = useMemo(() => {
        return Object.entries(totals.paymentCount)
            .map(([mode, count]) => ({
                mode,
                count,
                revenue: Number(totals.paymentRevenue[mode] || 0),
            }))
            .sort((a, b) => b.revenue - a.revenue);
    }, [totals.paymentCount, totals.paymentRevenue]);

    const returnAnalytics = useMemo(() => {
        const accepted = returnsData.filter((r) => r.status === "Accepted").length;
        const rejected = returnsData.filter((r) => r.status === "Rejected").length;
        const totalRefund = returnsData.reduce(
            (sum, item) => sum + Number(item.refund_amount || 0),
            0
        );
        const topReturned = [...selectedReturns]
            .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
            .slice(0, 8);

        return {
            accepted,
            rejected,
            totalRefund,
            topReturned,
        };
    }, [returnsData, selectedReturns]);

    const downloadAnalyticsPDF = () => {
        try {
            const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
            const now = new Date();
            const titleRange =
                chartRange === "7d"
                    ? "Last 7 Days"
                    : chartRange === "30d"
                        ? "Last 30 Days"
                        : chartRange === "90d"
                            ? "Last 90 Days"
                            : "All Data";

            doc.setFont("helvetica", "bold");
            doc.setFontSize(18);
            doc.text("SVS TRADERS - Analytics Report", 14, 16);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Generated: ${now.toLocaleString()}`, 14, 23);
            doc.text(`Chart Range: ${titleRange}`, 14, 29);
            doc.text(`Total Bills: ${totals.totalBills}`, 14, 35);
            doc.text(`Total Income: ₹${currency(totals.totalIncome)}`, 14, 41);
            doc.text(`Net Revenue: ₹${currency(totals.netRevenue)}`, 14, 47);
            doc.text(`Inventory Value: ₹${currency(totals.inventoryValue)}`, 14, 53);
            doc.text(`Returns: ${totals.totalReturns}`, 14, 59);

            autoTable(doc, {
                startY: 66,
                head: [["Date", "Bills", "Revenue"]],
                body:
                    revenueTrend.length > 0
                        ? revenueTrend.map((row) => [row.label, row.bills, `₹${currency(row.revenue)}`])
                        : [["-", 0, "₹0.00"]],
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [10, 32, 83], textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [245, 247, 255] },
                margin: { left: 14, right: 14 },
            });

            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 8,
                head: [["Brand", "Qty Sold", "Revenue"]],
                body:
                    brandAnalytics.length > 0
                        ? brandAnalytics.map((row) => [row.brand, row.qty, `₹${currency(row.revenue)}`])
                        : [["-", 0, "₹0.00"]],
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [10, 32, 83], textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [245, 247, 255] },
                margin: { left: 14, right: 14 },
            });

            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 8,
                head: [["Mode", "Bills", "Revenue"]],
                body:
                    paymentAnalytics.length > 0
                        ? paymentAnalytics.map((row) => [row.mode, row.count, `₹${currency(row.revenue)}`])
                        : [["-", 0, "₹0.00"]],
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [10, 32, 83], textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [245, 247, 255] },
                margin: { left: 14, right: 14 },
            });

            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 8,
                head: [["Barcode", "Product", "Qty", "Refund", "Status"]],
                body:
                    returnAnalytics.topReturned.length > 0
                        ? returnAnalytics.topReturned.map((row) => [
                            row.barcode || "-",
                            row.product_name || "-",
                            row.quantity || 0,
                            `₹${currency(row.refund_amount)}`,
                            row.status || "-",
                        ])
                        : [["-", "-", 0, "₹0.00", "-"]],
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [10, 32, 83], textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [245, 247, 255] },
                margin: { left: 14, right: 14 },
            });

            doc.save(`SVS_Analytics_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err) {
            console.error(err);
            alert("Could not generate analytics PDF.");
        }
    };

    const cardClass =
        "rounded-3xl bg-[#1d1d2e] border border-white/10 shadow-xl p-5 lg:p-6";
    const chartCardClass =
        "rounded-3xl bg-[#1d1d2e] border border-white/10 shadow-xl p-5 lg:p-6";

    return (
        <div className="min-h-screen bg-[#061b4d] text-white p-4 lg:p-6">
            <div className="max-w-[1600px] mx-auto">
                <div className="mb-6 lg:mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="text-4xl lg:text-5xl font-bold">Analytics</h1>
                        <p className="text-white/70 mt-2">
                            Revenue, brand performance, top products, payment trends, inventory insight, and returns.
                        </p>
                        <p className="text-white/40 text-sm mt-2">
                            Last updated: {lastUpdated ? lastUpdated.toLocaleString() : "—"}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={loadAnalytics}
                            disabled={loading}
                            className="bg-white/10 hover:bg-white/15 disabled:opacity-50 transition rounded-2xl px-5 py-3 font-semibold"
                        >
                            {loading ? "Loading..." : "Refresh"}
                        </button>
                        <button
                            onClick={downloadAnalyticsPDF}
                            className="bg-emerald-600 hover:bg-emerald-700 transition rounded-2xl px-5 py-3 font-semibold"
                        >
                            Download PDF
                        </button>
                    </div>
                </div>

                {error ? <div className={`${cardClass} mb-6 text-red-300`}>{error}</div> : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Today Revenue</div>
                        <div className="text-3xl font-bold mt-2">₹{currency(totals.todayRevenue)}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">This Week Revenue</div>
                        <div className="text-3xl font-bold mt-2">₹{currency(totals.weekRevenue)}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">This Month Revenue</div>
                        <div className="text-3xl font-bold mt-2">₹{currency(totals.monthRevenue)}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">This Year Revenue</div>
                        <div className="text-3xl font-bold mt-2">₹{currency(totals.yearRevenue)}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Total Bills</div>
                        <div className="text-3xl font-bold mt-2">{totals.totalBills}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Net Revenue</div>
                        <div className="text-3xl font-bold mt-2">₹{currency(totals.netRevenue)}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Inventory Value</div>
                        <div className="text-3xl font-bold mt-2">₹{currency(totals.inventoryValue)}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Average Bill</div>
                        <div className="text-3xl font-bold mt-2">₹{currency(totals.billAverage)}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Total Discount</div>
                        <div className="text-3xl font-bold mt-2">₹{currency(totals.totalDiscount)}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Returns Count</div>
                        <div className="text-3xl font-bold mt-2">{totals.totalReturns}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Return Refund</div>
                        <div className="text-3xl font-bold mt-2">₹{currency(totals.totalReturnRefund)}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Return Qty</div>
                        <div className="text-3xl font-bold mt-2">{totals.totalReturnQty}</div>
                    </div>
                </div>

                <div className="mb-6 flex flex-wrap gap-3">
                    <button
                        onClick={() => setChartRange("7d")}
                        className={`px-5 py-3 rounded-2xl font-semibold transition ${chartRange === "7d" ? "bg-blue-600" : "bg-white/10 hover:bg-white/15"
                            }`}
                    >
                        7 Days
                    </button>
                    <button
                        onClick={() => setChartRange("30d")}
                        className={`px-5 py-3 rounded-2xl font-semibold transition ${chartRange === "30d" ? "bg-blue-600" : "bg-white/10 hover:bg-white/15"
                            }`}
                    >
                        30 Days
                    </button>
                    <button
                        onClick={() => setChartRange("90d")}
                        className={`px-5 py-3 rounded-2xl font-semibold transition ${chartRange === "90d" ? "bg-blue-600" : "bg-white/10 hover:bg-white/15"
                            }`}
                    >
                        90 Days
                    </button>
                    <button
                        onClick={() => setChartRange("all")}
                        className={`px-5 py-3 rounded-2xl font-semibold transition ${chartRange === "all" ? "bg-blue-600" : "bg-white/10 hover:bg-white/15"
                            }`}
                    >
                        All Data
                    </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                    <div className={chartCardClass}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold">Revenue Trend</h2>
                            <span className="text-white/50 text-sm">
                                {chartRange === "7d"
                                    ? "Last 7 days"
                                    : chartRange === "30d"
                                        ? "Last 30 days"
                                        : chartRange === "90d"
                                            ? "Last 90 days"
                                            : "All data"}
                            </span>
                        </div>

                        {revenueTrend.length === 0 ? (
                            <div className="rounded-2xl bg-white/5 border border-white/5 p-6 text-white/50">
                                No revenue data for this range.
                            </div>
                        ) : (
                            <div className="h-[340px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={revenueTrend}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis dataKey="label" stroke="rgba(255,255,255,0.6)" />
                                        <YAxis stroke="rgba(255,255,255,0.6)" />
                                        <Tooltip
                                            contentStyle={{
                                                background: "#111827",
                                                border: "1px solid rgba(255,255,255,0.1)",
                                                borderRadius: 12,
                                            }}
                                            formatter={(value) => `₹${currency(value)}`}
                                        />
                                        <Legend />
                                        <Line
                                            type="monotone"
                                            dataKey="revenue"
                                            stroke="#3b82f6"
                                            strokeWidth={3}
                                            dot={{ r: 4 }}
                                            activeDot={{ r: 6 }}
                                            name="Revenue"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className={chartCardClass}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold">Brand Revenue</h2>
                            <span className="text-white/50 text-sm">{brandAnalytics.length} brands</span>
                        </div>

                        {brandAnalytics.length === 0 ? (
                            <div className="rounded-2xl bg-white/5 border border-white/5 p-6 text-white/50">
                                No brand data for this range.
                            </div>
                        ) : (
                            <div className="h-[340px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={brandAnalytics}
                                            dataKey="revenue"
                                            nameKey="brand"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={110}
                                            label
                                        >
                                            {brandAnalytics.map((entry, index) => (
                                                <Cell
                                                    key={`brand-${entry.brand}-${index}`}
                                                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                background: "#111827",
                                                border: "1px solid rgba(255,255,255,0.1)",
                                                borderRadius: 12,
                                            }}
                                            formatter={(value) => `₹${currency(value)}`}
                                        />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                    <div className={chartCardClass}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold">Payment Analytics</h2>
                            <span className="text-white/50 text-sm">{paymentAnalytics.length} modes</span>
                        </div>

                        {paymentAnalytics.length === 0 ? (
                            <div className="rounded-2xl bg-white/5 border border-white/5 p-6 text-white/50">
                                No payment data for this range.
                            </div>
                        ) : (
                            <div className="h-[340px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={paymentAnalytics}
                                            dataKey="revenue"
                                            nameKey="mode"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={110}
                                            label
                                        >
                                            {paymentAnalytics.map((entry, index) => (
                                                <Cell
                                                    key={`payment-${entry.mode}-${index}`}
                                                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                background: "#111827",
                                                border: "1px solid rgba(255,255,255,0.1)",
                                                borderRadius: 12,
                                            }}
                                            formatter={(value) => `₹${currency(value)}`}
                                        />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className={chartCardClass}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold">Top Products</h2>
                            <span className="text-white/50 text-sm">{topProducts.length} products</span>
                        </div>

                        {topProducts.length === 0 ? (
                            <div className="rounded-2xl bg-white/5 border border-white/5 p-6 text-white/50">
                                No product sales for this range.
                            </div>
                        ) : (
                            <div className="h-[340px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={topProducts.slice(0, 10)}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis dataKey="productName" stroke="rgba(255,255,255,0.6)" hide />
                                        <YAxis stroke="rgba(255,255,255,0.6)" />
                                        <Tooltip
                                            contentStyle={{
                                                background: "#111827",
                                                border: "1px solid rgba(255,255,255,0.1)",
                                                borderRadius: 12,
                                            }}
                                            formatter={(value, name) =>
                                                name === "revenue" ? `₹${currency(value)}` : value
                                            }
                                        />
                                        <Legend />
                                        <Bar dataKey="qty" fill="#3b82f6" name="Qty Sold" />
                                        <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                    <div className={chartCardClass}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold">Brand Table</h2>
                            <span className="text-white/50 text-sm">{brandAnalytics.length} entries</span>
                        </div>

                        {brandAnalytics.length === 0 ? (
                            <div className="rounded-2xl bg-white/5 border border-white/5 p-4 text-white/50">
                                No brand analytics found.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left border-b border-white/10 text-white/70">
                                            <th className="py-3 pr-4">Brand</th>
                                            <th className="py-3 pr-4">Qty Sold</th>
                                            <th className="py-3 pr-4">Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {brandAnalytics.map((row) => (
                                            <tr key={row.brand} className="border-b border-white/5">
                                                <td className="py-3 pr-4">{row.brand}</td>
                                                <td className="py-3 pr-4">{row.qty}</td>
                                                <td className="py-3 pr-4">₹{currency(row.revenue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className={chartCardClass}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold">Payment Table</h2>
                            <span className="text-white/50 text-sm">{paymentAnalytics.length} entries</span>
                        </div>

                        {paymentAnalytics.length === 0 ? (
                            <div className="rounded-2xl bg-white/5 border border-white/5 p-4 text-white/50">
                                No payment analytics found.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left border-b border-white/10 text-white/70">
                                            <th className="py-3 pr-4">Mode</th>
                                            <th className="py-3 pr-4">Bills</th>
                                            <th className="py-3 pr-4">Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paymentAnalytics.map((row) => (
                                            <tr key={row.mode} className="border-b border-white/5">
                                                <td className="py-3 pr-4">{row.mode}</td>
                                                <td className="py-3 pr-4">{row.count}</td>
                                                <td className="py-3 pr-4">₹{currency(row.revenue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <div className={chartCardClass}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-bold">Returns Summary</h2>
                        <span className="text-white/50 text-sm">{returnAnalytics.topReturned.length} records</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                            <div className="text-white/50 text-sm">Accepted</div>
                            <div className="text-2xl font-bold mt-1">{returnAnalytics.accepted}</div>
                        </div>
                        <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                            <div className="text-white/50 text-sm">Rejected</div>
                            <div className="text-2xl font-bold mt-1">{returnAnalytics.rejected}</div>
                        </div>
                        <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                            <div className="text-white/50 text-sm">Refund</div>
                            <div className="text-2xl font-bold mt-1">₹{currency(returnAnalytics.totalRefund)}</div>
                        </div>
                    </div>

                    {returnAnalytics.topReturned.length === 0 ? (
                        <div className="rounded-2xl bg-white/5 border border-white/5 p-4 text-white/50">
                            No return records for this range.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b border-white/10 text-white/70">
                                        <th className="py-3 pr-4">Invoice</th>
                                        <th className="py-3 pr-4">Product</th>
                                        <th className="py-3 pr-4">Qty</th>
                                        <th className="py-3 pr-4">Refund</th>
                                        <th className="py-3 pr-4">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {returnAnalytics.topReturned.map((r) => (
                                        <tr key={r.id} className="border-b border-white/5">
                                            <td className="py-3 pr-4">{r.invoice_code || "-"}</td>
                                            <td className="py-3 pr-4">{r.product_name || "-"}</td>
                                            <td className="py-3 pr-4">{r.quantity || 0}</td>
                                            <td className="py-3 pr-4">₹{currency(r.refund_amount)}</td>
                                            <td className="py-3 pr-4">{r.status || "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="text-white/40 text-sm pb-2 mt-6">
                    Data is calculated from invoices, invoice items, products, and returns in Supabase.
                </div>
            </div>
        </div>
    );
}