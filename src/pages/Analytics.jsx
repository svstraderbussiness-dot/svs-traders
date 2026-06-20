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
import { finalizePDF, drawSummaryCards, standardTableOpts } from "../lib/pdfHelper";


const PIE_COLORS = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#14b8a6",
];

function money(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function pad(value) {
    return String(value).padStart(2, "0");
}

function parseDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
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

function daysAgo(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() - days);
    return d;
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

function isSameLocalYear(a, b) {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear();
}

function isWithinDays(value, days) {
    const d = parseDate(value);
    if (!d) return false;
    if (days === Infinity) return true;
    const from = startOfDay(daysAgo(new Date(), days - 1));
    return d >= from;
}

function isAcceptedReturn(row) {
    return String(row?.status || "").toLowerCase() === "accepted";
}

function isReplacementReturn(row) {
    return String(row?.status || "").toLowerCase() === "replacement";
}

function isRejectedReturn(row) {
    return String(row?.status || "").toLowerCase() === "rejected";
}

function toDayKey(value) {
    const d = parseDate(value);
    if (!d) return null;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDayLabel(key) {
    if (!key) return "-";
    const d = new Date(`${key}T00:00:00`);
    if (Number.isNaN(d.getTime())) return key;
    return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

function getProductLabel(item, productById) {
    const product = productById.get(item.product_id);
    return (
        item.product_name ||
        product?.product_name ||
        product?.product_code ||
        product?.style_code ||
        "Product"
    );
}

function getBrandLabel(item, productById) {
    const product = productById.get(item.product_id);
    return item.brand || product?.brand || "Unknown";
}

function getBarcodeLabel(item, productById) {
    const product = productById.get(item.product_id);
    return item.barcode || product?.barcode || "-";
}

function StatCard({ title, value, hint, tone = "blue" }) {
    const toneClasses = {
        blue: "bg-white/5 border-white/10",
        green: "bg-emerald-500/10 border-emerald-500/20",
        red: "bg-red-500/10 border-red-500/20",
        amber: "bg-amber-500/10 border-amber-500/20",
    };

    return (
        <div className={`rounded-3xl border p-5 shadow-xl ${toneClasses[tone]}`}>
            <div>
                <div className="text-sm text-white/60">{title}</div>
                <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
                {hint ? <div className="mt-2 text-sm text-white/45">{hint}</div> : null}
            </div>
        </div>
    );
}

function SectionCard({ title, subtitle, right, children }) {
    return (
        <section className="rounded-3xl border border-white/10 bg-[#1d1d2e] p-5 shadow-xl lg:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold">{title}</h2>
                    {subtitle ? <p className="mt-1 text-sm text-white/55">{subtitle}</p> : null}
                </div>
                {right ? <div>{right}</div> : null}
            </div>
            {children}
        </section>
    );
}

function getRangeLabel(range) {
    if (range === "7d") return "Last 7 Days";
    if (range === "30d") return "Last 30 Days";
    if (range === "90d") return "Last 90 Days";
    return "All Data";
}

export default function Analytics() {
    const [products, setProducts] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [invoiceItems, setInvoiceItems] = useState([]);
    const [returnsData, setReturnsData] = useState([]);
    const [chartRange, setChartRange] = useState("30d");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [lastUpdated, setLastUpdated] = useState(null);

    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [productsRes, invoicesRes, itemsRes, returnsRes] = await Promise.all([
                supabase
                    .from("products")
                    .select("id, barcode, date, style_code, size, product_code, quantity, mrp, brand")
                    .order("id", { ascending: false }),

                supabase
                    .from("invoices")
                    .select(
                        "id, invoice_code, customer_id, subtotal, discount_amount, final_amount, payment_mode, payment_status, total_items, created_at"
                    )
                    .order("created_at", { ascending: false }),

                supabase
                    .from("invoice_items")
                    .select(
                        "id, invoice_id, product_id, quantity, price, subtotal, barcode, product_name, brand"
                    ),

                supabase
                    .from("returns")
                    .select(
                        "id, invoice_code, status, quantity, refund_amount, created_at, barcode, product_name, reason, rejection_reason, customer_name, phone_number, invoice_date, processed_by, add_to_inventory, replacement_type, replacement_barcode, replacement_product_name, replacement_quantity, replacement_product_id, replacement_done"
                    )
                    .order("created_at", { ascending: false }),
            ]);

            if (productsRes.error) throw productsRes.error;
            if (invoicesRes.error) throw invoicesRes.error;
            if (itemsRes.error) throw itemsRes.error;
            if (returnsRes.error) throw returnsRes.error;

            const safeProducts = (productsRes.data || []).map((p) => ({
                ...p,
                product_name: p.product_code || p.style_code || "Product",
            }));

            setProducts(safeProducts);
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
        products.forEach((p) => map.set(p.id, p));
        return map;
    }, [products]);

    const productByBarcode = useMemo(() => {
        const map = new Map();
        products.forEach((p) => {
            if (p.barcode) map.set(String(p.barcode), p);
        });
        return map;
    }, [products]);

    const invoiceByCode = useMemo(() => {
        const map = new Map();
        invoices.forEach((inv) => {
            if (inv.invoice_code) map.set(String(inv.invoice_code), inv);
        });
        return map;
    }, [invoices]);

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
    }, [chartRange, invoices]);

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

        return returnsData.filter(
            (item) => isWithinDays(item.created_at, days) && isAcceptedReturn(item)
        );
    }, [chartRange, returnsData]);

    const totals = useMemo(() => {
        const now = new Date();

        const todayInvoices = invoices.filter((inv) => isSameLocalDay(parseDate(inv.created_at), now));
        const weekInvoices = invoices.filter((inv) => isWithinDays(inv.created_at, 7));
        const monthInvoices = invoices.filter((inv) => isSameLocalMonth(parseDate(inv.created_at), now));
        const yearInvoices = invoices.filter((inv) => isSameLocalYear(parseDate(inv.created_at), now));

        const todayAcceptedReturns = returnsData.filter(
            (r) => isAcceptedReturn(r) && isSameLocalDay(parseDate(r.created_at), now)
        );
        const weekAcceptedReturns = returnsData.filter(
            (r) => isAcceptedReturn(r) && isWithinDays(r.created_at, 7)
        );
        const monthAcceptedReturns = returnsData.filter(
            (r) => isAcceptedReturn(r) && isSameLocalMonth(parseDate(r.created_at), now)
        );
        const yearAcceptedReturns = returnsData.filter(
            (r) => isAcceptedReturn(r) && isSameLocalYear(parseDate(r.created_at), now)
        );

        const totalBills = invoices.length;

        const todayGross = todayInvoices.reduce((sum, inv) => sum + Number(inv.final_amount || 0), 0);
        const weekGross = weekInvoices.reduce((sum, inv) => sum + Number(inv.final_amount || 0), 0);
        const monthGross = monthInvoices.reduce((sum, inv) => sum + Number(inv.final_amount || 0), 0);
        const yearGross = yearInvoices.reduce((sum, inv) => sum + Number(inv.final_amount || 0), 0);

        const todayRefund = todayAcceptedReturns.reduce((sum, r) => sum + Number(r.refund_amount || 0), 0);
        const weekRefund = weekAcceptedReturns.reduce((sum, r) => sum + Number(r.refund_amount || 0), 0);
        const monthRefund = monthAcceptedReturns.reduce((sum, r) => sum + Number(r.refund_amount || 0), 0);
        const yearRefund = yearAcceptedReturns.reduce((sum, r) => sum + Number(r.refund_amount || 0), 0);

        const todayRevenue = Math.max(todayGross - todayRefund, 0);
        const weekRevenue = Math.max(weekGross - weekRefund, 0);
        const monthRevenue = Math.max(monthGross - monthRefund, 0);
        const yearRevenue = Math.max(yearGross - yearRefund, 0);

        const totalDiscount = invoices.reduce((sum, inv) => sum + Number(inv.discount_amount || 0), 0);
        const grossIncome = invoices.reduce((sum, inv) => sum + Number(inv.final_amount || 0), 0);
        const totalReturnRefund = returnsData.filter(isAcceptedReturn).reduce((sum, item) => sum + Number(item.refund_amount || 0), 0);
        const totalAcceptedReturnQty = returnsData.filter(isAcceptedReturn).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const totalReplacementQty = returnsData.filter(isReplacementReturn).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const totalReplacementProductQty = returnsData.filter(isReplacementReturn).reduce((sum, item) => sum + Number(item.replacement_quantity || 0), 0);
        const totalAcceptedReturns = returnsData.filter(isAcceptedReturn).length;
        const totalReplacementReturns = returnsData.filter(isReplacementReturn).length;
        const totalRejectedReturns = returnsData.filter(isRejectedReturn).length;

        const paymentCount = invoices.reduce((acc, inv) => {
            const key = inv.payment_mode || "Unknown";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const grossPaymentRevenue = invoices.reduce((acc, inv) => {
            const key = inv.payment_mode || "Unknown";
            acc[key] = (acc[key] || 0) + Number(inv.final_amount || 0);
            return acc;
        }, {});

        const returnRefundByPaymentMode = returnsData.reduce((acc, r) => {
            if (!isAcceptedReturn(r)) return acc;
            const linkedInvoice = invoiceByCode.get(String(r.invoice_code || ""));
            const mode = linkedInvoice?.payment_mode || "Unknown";
            acc[mode] = (acc[mode] || 0) + Number(r.refund_amount || 0);
            return acc;
        }, {});

        const paymentRevenue = Object.keys(grossPaymentRevenue).reduce((acc, mode) => {
            acc[mode] = Math.max(
                Number(grossPaymentRevenue[mode] || 0) - Number(returnRefundByPaymentMode[mode] || 0),
                0
            );
            return acc;
        }, {});

        const inventoryValue = products.reduce((sum, p) => {
            const qty = Number(p.quantity || 0);
            const price = Number(p.mrp || 0);
            return sum + qty * price;
        }, 0);

        const totalIncome = Math.max(grossIncome - totalReturnRefund, 0);
        const billAverage = totalBills > 0 ? totalIncome / totalBills : 0;

        return {
            todayRevenue,
            weekRevenue,
            monthRevenue,
            yearRevenue,
            totalBills,
            totalIncome,
            grossIncome,
            totalDiscount,
            billAverage,
            totalReturnRefund,
            totalAcceptedReturnQty,
            totalReplacementQty,
            totalReplacementProductQty,
            totalAcceptedReturns,
            totalReplacementReturns,
            totalRejectedReturns,
            inventoryValue,
            paymentCount,
            paymentRevenue,
        };
    }, [invoices, invoiceByCode, products, returnsData]);
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

        const selectedReturnMap = new Map();
        selectedReturns.forEach((r) => {
            const key = toDayKey(r.created_at);
            if (!key) return;
            selectedReturnMap.set(
                key,
                (selectedReturnMap.get(key) || 0) + Number(r.refund_amount || 0)
            );
        });

        return Array.from(map.values())
            .map((row) => ({
                ...row,
                revenue: Math.max(row.revenue - Number(selectedReturnMap.get(row.day) || 0), 0),
            }))
            .sort((a, b) => a.day.localeCompare(b.day));
    }, [selectedInvoices, selectedReturns]);

    const brandAnalytics = useMemo(() => {
        const brandMap = new Map();
        const barcodeToBrand = new Map();
        const barcodeToPrice = new Map();

        selectedItems.forEach((item) => {
            const product = productById.get(item.product_id);
            const brand = item.brand || product?.brand || "Unknown";
            const barcode = String(item.barcode || product?.barcode || "-");
            const qty = Number(item.quantity || 0);
            const amount = Number(item.subtotal || 0) || qty * Number(item.price || 0);

            barcodeToBrand.set(barcode, brand);
            barcodeToPrice.set(
                barcode,
                Number(item.price || 0) || Number(item.subtotal || 0) / (qty || 1)
            );

            const existing = brandMap.get(brand) || {
                brand,
                qty: 0,
                revenue: 0,
            };

            existing.qty += qty;
            existing.revenue += amount;
            brandMap.set(brand, existing);
        });

        selectedReturns.forEach((r) => {
            const barcode = String(r.barcode || "-");
            const brand =
                barcodeToBrand.get(barcode) || productByBarcode.get(barcode)?.brand || "Unknown";
            const price =
                barcodeToPrice.get(barcode) ||
                Number(r.refund_amount || 0) / (Number(r.quantity || 1) || 1);
            const qty = Number(r.quantity || 0);
            const amount = Number(r.refund_amount || qty * price || 0);

            const existing = brandMap.get(brand) || {
                brand,
                qty: 0,
                revenue: 0,
            };

            existing.qty = Math.max(existing.qty - qty, 0);
            existing.revenue = Math.max(existing.revenue - amount, 0);
            brandMap.set(brand, existing);
        });

        return Array.from(brandMap.values()).sort((a, b) => b.revenue - a.revenue);
    }, [productByBarcode, productById, selectedItems, selectedReturns]);

    const topProducts = useMemo(() => {
        const map = new Map();

        selectedItems.forEach((item) => {
            const productId = item.product_id || item.barcode || `${item.product_name}-${item.brand}`;
            const product = productById.get(item.product_id);
            const productName = getProductLabel(item, productById);
            const brand = getBrandLabel(item, productById);
            const barcode = getBarcodeLabel(item, productById);
            const qty = Number(item.quantity || 0);
            const amount = Number(item.subtotal || 0) || qty * Number(item.price || 0);

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

        selectedReturns.forEach((r) => {
            const barcode = String(r.barcode || "-");
            const matched = Array.from(map.values()).find(
                (x) => String(x.barcode || "") === barcode
            );

            if (!matched) return;

            const qty = Number(r.quantity || 0);
            const refund = Number(r.refund_amount || 0);

            matched.qty = Math.max(matched.qty - qty, 0);
            matched.revenue = Math.max(matched.revenue - refund, 0);
        });

        return Array.from(map.values())
            .sort((a, b) => b.qty - a.qty)
            .filter((item) => item.qty > 0 || item.revenue > 0);
    }, [productById, selectedItems, selectedReturns]);

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
        const replacement = returnsData.filter((r) => r.status === "Replacement").length;
        const totalRefund = returnsData
            .filter(isAcceptedReturn)
            .reduce((sum, item) => sum + Number(item.refund_amount || 0), 0);

        const topAcceptedReturned = selectedReturns
            .map((row) => ({
                ...row,
                displayProduct: row.product_name || row.barcode || "Unknown Product",
            }))
            .filter((row) => row.displayProduct !== "Unknown Product" || row.barcode || row.product_name)
            .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
            .slice(0, 8);

        const topReplacementReturned = returnsData
            .filter(isReplacementReturn)
            .map((row) => ({
                ...row,
                displayProduct: row.product_name || row.barcode || "Unknown Product",
                replacementDisplay:
                    row.replacement_product_name || row.replacement_barcode || "Unknown Replacement",
            }))
            .sort((a, b) => Number(b.replacement_quantity || 0) - Number(a.replacement_quantity || 0))
            .slice(0, 8);

        return {
            accepted,
            rejected,
            replacement,
            totalRefund,
            topAcceptedReturned,
            topReplacementReturned,
        };
    }, [returnsData, selectedReturns]);
    const chartDataKeyLabel = useMemo(() => getRangeLabel(chartRange), [chartRange]);

    const downloadAnalyticsPDF = () => {
        try {
            const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

            const infoLeft = [
                `Chart Range: ${chartDataKeyLabel}`,
            ];
            const infoRight = [
                `Report Type: Analytics Summary`,
            ];

            const summaryCards = [
                { label: "Total Bills", value: totals.totalBills },
                { label: "Total Income", value: `₹${money(totals.totalIncome)}` },
                { label: "Inventory Value", value: `₹${money(totals.inventoryValue)}` },
                { label: "Accepted Returns", value: totals.totalAcceptedReturns },
                { label: "Replacement Returns", value: totals.totalReplacementReturns },
                { label: "Return Refund", value: `₹${money(totals.totalReturnRefund)}` },
            ];

            const cardsEndY = drawSummaryCards(doc, summaryCards, 48);

            autoTable(doc, {
                ...standardTableOpts,
                startY: cardsEndY + 4,
                head: [["Date", "Bills", "Revenue"]],
                body:
                    revenueTrend.length > 0
                        ? revenueTrend.map((row) => [
                            row.label,
                            row.bills,
                            `₹${money(row.revenue)}`,
                        ])
                        : [["-", 0, "₹0.00"]],
                columnStyles: {
                    0: { halign: "left" }, // Date
                    1: { halign: "right" }, // Bills
                    2: { halign: "right" }, // Revenue
                }
            });

            autoTable(doc, {
                ...standardTableOpts,
                startY: doc.lastAutoTable.finalY + 8,
                head: [["Brand", "Qty Sold", "Revenue"]],
                body:
                    brandAnalytics.length > 0
                        ? brandAnalytics.map((row) => [
                            row.brand,
                            row.qty,
                            `₹${money(row.revenue)}`,
                        ])
                        : [["-", 0, "₹0.00"]],
                columnStyles: {
                    0: { halign: "left" }, // Brand
                    1: { halign: "right" }, // Qty Sold
                    2: { halign: "right" }, // Revenue
                }
            });

            autoTable(doc, {
                ...standardTableOpts,
                startY: doc.lastAutoTable.finalY + 8,
                head: [["Mode", "Bills", "Revenue"]],
                body:
                    paymentAnalytics.length > 0
                        ? paymentAnalytics.map((row) => [
                            row.mode,
                            row.count,
                            `₹${money(row.revenue)}`,
                        ])
                        : [["-", 0, "₹0.00"]],
                columnStyles: {
                    0: { halign: "left" }, // Mode
                    1: { halign: "right" }, // Bills
                    2: { halign: "right" }, // Revenue
                }
            });

            if (returnAnalytics.topAcceptedReturned.length > 0) {
                autoTable(doc, {
                    ...standardTableOpts,
                    startY: doc.lastAutoTable.finalY + 8,
                    head: [["Invoice", "Barcode", "Product", "Qty", "Refund", "Status"]],
                    body: returnAnalytics.topAcceptedReturned.map((row) => [
                        row.invoice_code || "-",
                        row.barcode || "N/A",
                        row.displayProduct || "Unknown Product",
                        row.quantity || 0,
                        `₹${money(row.refund_amount || 0)}`,
                        row.status || "-",
                    ]),
                    columnStyles: {
                        0: { halign: "left" }, // Invoice
                        1: { halign: "center" }, // Barcode
                        2: { halign: "left" }, // Product
                        3: { halign: "right" }, // Qty
                        4: { halign: "right" }, // Refund
                        5: { halign: "center" }, // Status
                    }
                });
            }

            if (returnAnalytics.topReplacementReturned.length > 0) {
                autoTable(doc, {
                    ...standardTableOpts,
                    startY: doc.lastAutoTable.finalY + 8,
                    head: [["Invoice", "Returned Item", "Replacement Item", "Returned Qty", "Replacement Qty"]],
                    body: returnAnalytics.topReplacementReturned.map((row) => [
                        row.invoice_code || "-",
                        row.displayProduct || "-",
                        row.replacementDisplay || "-",
                        row.quantity || 0,
                        row.replacement_quantity || 0,
                    ]),
                    columnStyles: {
                        0: { halign: "left" }, // Invoice
                        1: { halign: "left" }, // Returned Item
                        2: { halign: "left" }, // Replacement Item
                        3: { halign: "right" }, // Returned Qty
                        4: { halign: "right" }, // Replacement Qty
                    }
                });
            }

            finalizePDF(doc, "Analytics Report", infoLeft, infoRight);

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
                    <StatCard
                        title="Today Revenue"
                        value={`₹${money(totals.todayRevenue)}`}
                        hint="Net after accepted returns"
                        tone="blue"
                    />
                    <StatCard
                        title="This Week Revenue"
                        value={`₹${money(totals.weekRevenue)}`}
                        hint="Last 7 days"
                        tone="green"
                    />
                    <StatCard
                        title="This Month Revenue"
                        value={`₹${money(totals.monthRevenue)}`}
                        hint="Current month"
                        tone="amber"
                    />
                    <StatCard
                        title="This Year Revenue"
                        value={`₹${money(totals.yearRevenue)}`}
                        hint="Current year"
                        tone="red"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                    <StatCard
                        title="Total Bills"
                        value={totals.totalBills}
                        hint="All invoices"
                        tone="blue"
                    />
                    <StatCard
                        title="Net Revenue"
                        value={`₹${money(totals.totalIncome)}`}
                        hint="Gross minus accepted returns"
                        tone="green"
                    />
                    <StatCard
                        title="Inventory Value"
                        value={`₹${money(totals.inventoryValue)}`}
                        hint="Quantity × MRP"
                        tone="amber"
                    />
                    <StatCard
                        title="Average Bill"
                        value={`₹${money(totals.billAverage)}`}
                        hint="Net revenue / bills"
                        tone="red"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                    <StatCard
                        title="Total Discount"
                        value={`₹${money(totals.totalDiscount)}`}
                        hint="Invoice discounts"
                        tone="blue"
                    />
                    <StatCard
                        title="Accepted Returns"
                        value={totals.totalAcceptedReturns}
                        hint="Refunded returns"
                        tone="green"
                    />
                    <StatCard
                        title="Replacement Returns"
                        value={totals.totalReplacementReturns}
                        hint="Replacement cases"
                        tone="amber"
                    />
                    <StatCard
                        title="Return Refund"
                        value={`₹${money(totals.totalReturnRefund)}`}
                        hint="Refund paid"
                        tone="red"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                    <StatCard
                        title="Accepted Return Qty"
                        value={totals.totalAcceptedReturnQty}
                        hint="Items returned"
                        tone="blue"
                    />
                    <StatCard
                        title="Replacement Qty"
                        value={totals.totalReplacementQty}
                        hint="Items replaced"
                        tone="green"
                    />
                    <StatCard
                        title="Replacement Product Qty"
                        value={totals.totalReplacementProductQty}
                        hint="Replacement units"
                        tone="amber"
                    />
                    <StatCard
                        title="Average Bill"
                        value={`₹${money(totals.billAverage)}`}
                        hint="Net revenue / bills"
                        tone="red"
                    />
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
                            <span className="text-white/50 text-sm">{chartDataKeyLabel}</span>
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
                                            formatter={(value) => `₹${money(value)}`}
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
                                            formatter={(value) => `₹${money(value)}`}
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
                                            formatter={(value) => `₹${money(value)}`}
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
                                                name === "revenue" ? `₹${money(value)}` : value
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
                                                <td className="py-3 pr-4">₹{money(row.revenue)}</td>
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
                                                <td className="py-3 pr-4">₹{money(row.revenue)}</td>
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
                        <span className="text-white/50 text-sm">
                            {returnAnalytics.topAcceptedReturned.length + returnAnalytics.topReplacementReturned.length} records
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                            <div className="text-white/50 text-sm">Accepted</div>
                            <div className="text-2xl font-bold mt-1">{returnAnalytics.accepted}</div>
                        </div>
                        <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                            <div className="text-white/50 text-sm">Replacement</div>
                            <div className="text-2xl font-bold mt-1">{returnAnalytics.replacement}</div>
                        </div>
                        <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                            <div className="text-white/50 text-sm">Rejected</div>
                            <div className="text-2xl font-bold mt-1">{returnAnalytics.rejected}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                            <div className="text-white/50 text-sm">Accepted Refund</div>
                            <div className="text-2xl font-bold mt-1">
                                ₹{money(returnAnalytics.totalRefund)}
                            </div>
                        </div>
                        <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                            <div className="text-white/50 text-sm">Accepted Return Qty</div>
                            <div className="text-2xl font-bold mt-1">{totals.totalAcceptedReturnQty}</div>
                        </div>
                    </div>

                    {returnAnalytics.topAcceptedReturned.length === 0 &&
                        returnAnalytics.topReplacementReturned.length === 0 ? (
                        <div className="rounded-2xl bg-white/5 border border-white/5 p-4 text-white/50">
                            No return records for this range.
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {returnAnalytics.topAcceptedReturned.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <h3 className="mb-3 font-semibold text-white/80">Accepted Returns</h3>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left border-b border-white/10 text-white/70">
                                                <th className="py-3 pr-4">Invoice</th>
                                                <th className="py-3 pr-4">Barcode</th>
                                                <th className="py-3 pr-4">Product</th>
                                                <th className="py-3 pr-4">Qty</th>
                                                <th className="py-3 pr-4">Refund</th>
                                                <th className="py-3 pr-4">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {returnAnalytics.topAcceptedReturned.map((r) => (
                                                <tr key={r.id} className="border-b border-white/5">
                                                    <td className="py-3 pr-4">{r.invoice_code || "-"}</td>
                                                    <td className="py-3 pr-4">{r.barcode || "N/A"}</td>
                                                    <td className="py-3 pr-4">{r.displayProduct || "-"}</td>
                                                    <td className="py-3 pr-4">{r.quantity || 0}</td>
                                                    <td className="py-3 pr-4">₹{money(r.refund_amount || 0)}</td>
                                                    <td className="py-3 pr-4">{r.status || "-"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : null}

                            {returnAnalytics.topReplacementReturned.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <h3 className="mb-3 font-semibold text-white/80">Replacement Returns</h3>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left border-b border-white/10 text-white/70">
                                                <th className="py-3 pr-4">Invoice</th>
                                                <th className="py-3 pr-4">Returned Item</th>
                                                <th className="py-3 pr-4">Replacement Item</th>
                                                <th className="py-3 pr-4">Returned Qty</th>
                                                <th className="py-3 pr-4">Replacement Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {returnAnalytics.topReplacementReturned.map((r) => (
                                                <tr key={r.id} className="border-b border-white/5">
                                                    <td className="py-3 pr-4">{r.invoice_code || "-"}</td>
                                                    <td className="py-3 pr-4">{r.displayProduct || "-"}</td>
                                                    <td className="py-3 pr-4">{r.replacementDisplay || "-"}</td>
                                                    <td className="py-3 pr-4">{r.quantity || 0}</td>
                                                    <td className="py-3 pr-4">{r.replacement_quantity || 0}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : null}
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