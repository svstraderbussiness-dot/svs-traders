import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { finalizePDF, drawSummaryCards, standardTableOpts } from "../lib/pdfHelper";


function pad2(value) {
    return String(value).padStart(2, "0");
}

function getMonthOptions(count = 12) {
    const options = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
        const label = d.toLocaleString("default", {
            month: "long",
            year: "numeric",
        });

        options.push({ value, label });
    }

    return options;
}

function getDailyRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const endExclusive = new Date();
    endExclusive.setHours(24, 0, 0, 0);

    return {
        start: start.toISOString(),
        end: endExclusive.toISOString(),
        label: start.toLocaleDateString(),
    };
}

function getMonthlyRange(monthValue) {
    const [yearStr, monthStr] = monthValue.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;

    const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const endExclusive = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);

    return {
        start: start.toISOString(),
        end: endExclusive.toISOString(),
        label: start.toLocaleString("en-US", {
            month: "long",
            year: "numeric",
        }),
    };
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

export default function Reports() {
    const monthOptions = useMemo(() => getMonthOptions(12), []);
    const [reportMode, setReportMode] = useState("daily");
    const [selectedMonth, setSelectedMonth] = useState(
        () => getMonthOptions(12)[0]?.value || ""
    );
    const [loading, setLoading] = useState(false);
    const [invoices, setInvoices] = useState([]);
    const [invoiceItems, setInvoiceItems] = useState([]);
    const [returnsData, setReturnsData] = useState([]);
    const [error, setError] = useState("");
    const [lastLoadedAt, setLastLoadedAt] = useState(null);

    const money = (value) =>
        Number(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const range = useMemo(() => {
        if (reportMode === "monthly") {
            return getMonthlyRange(selectedMonth || monthOptions[0]?.value || "");
        }
        return getDailyRange();
    }, [reportMode, selectedMonth, monthOptions]);

    const loadReportData = async () => {
        if (!range.start || !range.end) return;

        setLoading(true);
        setError("");

        try {
            const [invoiceRes, returnsRes] = await Promise.all([
                supabase
                    .from("invoices")
                    .select("*")
                    .gte("created_at", range.start)
                    .lt("created_at", range.end)
                    .order("created_at", { ascending: false }),

                supabase
                    .from("returns")
                    .select(
                        "id, invoice_code, barcode, product_name, quantity, refund_amount, status, created_at, reason, rejection_reason, customer_name, phone_number, invoice_date, processed_by, add_to_inventory, replacement_type, replacement_barcode, replacement_product_name, replacement_quantity, replacement_product_id, replacement_done"
                    )
                    .gte("created_at", range.start)
                    .lt("created_at", range.end)
                    .order("created_at", { ascending: false }),
            ]);

            if (invoiceRes.error) throw invoiceRes.error;
            if (returnsRes.error) throw returnsRes.error;

            const safeInvoices = invoiceRes.data || [];
            const safeReturns = returnsRes.data || [];

            setInvoices(safeInvoices);
            setReturnsData(safeReturns);

            const invoiceIds = safeInvoices.map((inv) => inv.id);

            if (invoiceIds.length === 0) {
                setInvoiceItems([]);
                setLastLoadedAt(new Date());
                return;
            }

            const { data: itemsData, error: itemsError } = await supabase
                .from("invoice_items")
                .select(
                    "id, invoice_id, product_id, quantity, price, subtotal, barcode, product_name, brand"
                )
                .in("invoice_id", invoiceIds);

            if (itemsError) throw itemsError;

            setInvoiceItems(itemsData || []);
            setLastLoadedAt(new Date());
        } catch (err) {
            console.error(err);
            setError(err?.message || "Failed to load report data.");
            setInvoices([]);
            setInvoiceItems([]);
            setReturnsData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReportData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportMode, selectedMonth]);

    const reportStats = useMemo(() => {
        const totalBills = invoices.length;

        const grossIncome = invoices.reduce((sum, inv) => sum + Number(inv.final_amount || 0), 0);
        const totalDiscount = invoices.reduce((sum, inv) => sum + Number(inv.discount_amount || 0), 0);
        const grossItems = invoices.reduce((sum, inv) => sum + Number(inv.total_items || 0), 0);

        const paidBills = invoices.filter((inv) => inv.payment_status === "Paid").length;
        const pendingBills = invoices.filter((inv) => inv.payment_status !== "Paid").length;

        const acceptedReturns = returnsData.filter(isAcceptedReturn);
        const replacementReturns = returnsData.filter(isReplacementReturn);
        const rejectedReturns = returnsData.filter(isRejectedReturn);

        const acceptedReturnRefund = acceptedReturns.reduce((sum, row) => sum + Number(row.refund_amount || 0), 0);
        const acceptedReturnQty = acceptedReturns.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        const replacementQty = replacementReturns.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        const replacementProductQty = replacementReturns.reduce((sum, row) => sum + Number(row.replacement_quantity || 0), 0);

        const totalIncome = Math.max(grossIncome - acceptedReturnRefund, 0);
        const totalItems = Math.max(grossItems - acceptedReturnQty, 0);
        const avgBill = totalBills > 0 ? totalIncome / totalBills : 0;
        const grossAvgBill = totalBills > 0 ? grossIncome / totalBills : 0;

        const paymentCounts = invoices.reduce((acc, inv) => {
            const key = inv.payment_mode || "Unknown";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const paymentAmount = invoices.reduce((acc, inv) => {
            const key = inv.payment_mode || "Unknown";
            acc[key] = (acc[key] || 0) + Number(inv.final_amount || 0);
            return acc;
        }, {});

        const productMap = new Map();
        const brandMap = new Map();
        const barcodeBrandMap = new Map();
        const returnQtyByBarcode = new Map();
        const returnRefundByBarcode = new Map();

        invoiceItems.forEach((item) => {
            const productKey = String(item.product_id || `${item.barcode || "-"}-${item.product_name || "-"}`);
            const productName = item.product_name || "Product";
            const brandName = item.brand || "Unknown";
            const barcode = item.barcode || "-";
            const qty = Number(item.quantity || 0);
            const amount = Number(item.subtotal || 0);

            if (barcode && barcode !== "-") {
                barcodeBrandMap.set(barcode, brandName);
            }

            const productExisting = productMap.get(productKey) || {
                barcode,
                product_name: productName,
                brand: brandName,
                qty: 0,
                amount: 0,
            };

            productExisting.qty += qty;
            productExisting.amount += amount;
            productMap.set(productKey, productExisting);

            const brandExisting = brandMap.get(brandName) || {
                brand: brandName,
                qty: 0,
                amount: 0,
            };

            brandExisting.qty += qty;
            brandExisting.amount += amount;
            brandMap.set(brandName, brandExisting);
        });

        acceptedReturns.forEach((row) => {
            const barcode = row.barcode || "-";
            if (!barcode || barcode === "-") return;

            returnQtyByBarcode.set(barcode, (returnQtyByBarcode.get(barcode) || 0) + Number(row.quantity || 0));
            returnRefundByBarcode.set(barcode, (returnRefundByBarcode.get(barcode) || 0) + Number(row.refund_amount || 0));
        });

        const adjustedProducts = [...productMap.values()].map((item) => {
            const returnedQty = Number(returnQtyByBarcode.get(item.barcode) || 0);
            const returnedRefund = Number(returnRefundByBarcode.get(item.barcode) || 0);

            return {
                ...item,
                qty: Math.max(Number(item.qty || 0) - returnedQty, 0),
                amount: Math.max(Number(item.amount || 0) - returnedRefund, 0),
            };
        });

        const adjustedBrandMap = new Map();
        brandMap.forEach((item, brandName) => {
            adjustedBrandMap.set(brandName, {
                brand: brandName,
                qty: Number(item.qty || 0),
                amount: Number(item.amount || 0),
            });
        });

        acceptedReturns.forEach((row) => {
            const barcode = row.barcode || "-";
            const brandName = barcodeBrandMap.get(barcode) || "Unknown";
            const entry = adjustedBrandMap.get(brandName) || { brand: brandName, qty: 0, amount: 0 };

            entry.qty = Math.max(entry.qty - Number(row.quantity || 0), 0);
            entry.amount = Math.max(entry.amount - Number(row.refund_amount || 0), 0);
            adjustedBrandMap.set(brandName, entry);
        });

        const topProducts = adjustedProducts
            .sort((a, b) => b.qty - a.qty)
            .filter((item) => item.qty > 0 || item.amount > 0);

        const brandSummary = [...adjustedBrandMap.values()]
            .sort((a, b) => b.amount - a.amount)
            .filter((item) => item.qty > 0 || item.amount > 0);

        const recentInvoices = [...invoices].sort(
            (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );

        const replacementSummary = replacementReturns.map((row) => ({
            id: row.id,
            invoice_code: row.invoice_code || "-",
            barcode: row.barcode || "-",
            product_name: row.product_name || "-",
            replacement_product_name: row.replacement_product_name || "-",
            replacement_barcode: row.replacement_barcode || "-",
            quantity: Number(row.quantity || 0),
            replacement_quantity: Number(row.replacement_quantity || 0),
            status: row.status || "-",
            created_at: row.created_at || null,
            reason: row.reason || row.rejection_reason || "-",
        }));

        return {
            totalBills,
            totalIncome,
            grossIncome,
            acceptedReturnRefund,
            acceptedReturnQty,
            replacementQty,
            replacementProductQty,
            totalDiscount,
            totalItems,
            grossItems,
            paidBills,
            pendingBills,
            avgBill,
            grossAvgBill,
            paymentCounts,
            paymentAmount,
            topProducts,
            brandSummary,
            recentInvoices,
            acceptedReturnsCount: acceptedReturns.length,
            replacementReturnsCount: replacementReturns.length,
            rejectedReturnsCount: rejectedReturns.length,
            replacementSummary,
        };
    }, [invoices, invoiceItems, returnsData]);
    const downloadPDF = () => {
        try {
            const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
            const today = new Date();
            const fileDate = today.toISOString().slice(0, 10);
            const title = reportMode === "monthly" ? "Monthly Sales Report" : "Daily Sales Report";

            const infoLeft = [
                `Period: ${range.label}`,
            ];
            const infoRight = [
                `Report Type: ${title}`,
            ];

            const summaryCards = [
                { label: "Total Bills", value: reportStats.totalBills },
                { label: "Net Income", value: `₹${money(reportStats.totalIncome)}` },
                { label: "Total Items Sold", value: reportStats.totalItems },
                { label: "Average Bill", value: `₹${money(reportStats.avgBill)}` },
                { label: "Paid Bills", value: reportStats.paidBills },
                { label: "Pending Bills", value: reportStats.pendingBills },
                { label: "Accepted Returns", value: reportStats.acceptedReturnsCount },
                { label: "Replacement Returns", value: reportStats.replacementReturnsCount },
            ];

            const cardsEndY = drawSummaryCards(doc, summaryCards, 48);

            autoTable(doc, {
                ...standardTableOpts,
                startY: cardsEndY + 4,
                head: [["Invoice", "Time", "Customer ID", "Items", "Payment", "Status", "Total"]],
                body: reportStats.recentInvoices.map((inv) => [
                    inv.invoice_code || "-",
                    inv.created_at ? new Date(inv.created_at).toLocaleString() : "-",
                    inv.customer_id || "-",
                    inv.total_items || 0,
                    inv.payment_mode || "-",
                    inv.payment_status || "-",
                    `₹${money(inv.final_amount)}`,
                ]),
                columnStyles: {
                    0: { halign: "left" }, // Invoice
                    1: { halign: "left" }, // Time
                    2: { halign: "center" }, // Customer ID
                    3: { halign: "right" }, // Items
                    4: { halign: "left" }, // Payment
                    5: { halign: "center" }, // Status
                    6: { halign: "right" }, // Total
                }
            });

            let afterY = doc.lastAutoTable.finalY + 8;

            autoTable(doc, {
                ...standardTableOpts,
                startY: afterY,
                head: [["Brand", "Qty Sold", "Amount"]],
                body: reportStats.brandSummary.map((row) => [
                    row.brand,
                    row.qty,
                    `₹${money(row.amount)}`,
                ]),
                columnStyles: {
                    0: { halign: "left" }, // Brand
                    1: { halign: "right" }, // Qty Sold
                    2: { halign: "right" }, // Amount
                }
            });

            afterY = doc.lastAutoTable.finalY + 8;

            autoTable(doc, {
                ...standardTableOpts,
                startY: afterY,
                head: [["Barcode", "Product", "Brand", "Qty Sold", "Amount"]],
                body: reportStats.topProducts.map((item) => [
                    item.barcode,
                    item.product_name,
                    item.brand,
                    item.qty,
                    `₹${money(item.amount)}`,
                ]),
                columnStyles: {
                    0: { halign: "center" }, // Barcode
                    1: { halign: "left" }, // Product
                    2: { halign: "left" }, // Brand
                    3: { halign: "right" }, // Qty Sold
                    4: { halign: "right" }, // Amount
                }
            });

            if (reportStats.replacementSummary.length > 0) {
                afterY = doc.lastAutoTable.finalY + 8;
                autoTable(doc, {
                    ...standardTableOpts,
                    startY: afterY,
                    head: [["Invoice", "Returned Item", "Replacement Item", "Qty", "Replacement Qty", "Status"]],
                    body: reportStats.replacementSummary.map((row) => [
                        row.invoice_code,
                        `${row.product_name} (${row.barcode})`,
                        `${row.replacement_product_name} (${row.replacement_barcode})`,
                        row.quantity,
                        row.replacement_quantity,
                        row.status,
                    ]),
                    columnStyles: {
                        0: { halign: "left" }, // Invoice
                        1: { halign: "left" }, // Returned Item
                        2: { halign: "left" }, // Replacement Item
                        3: { halign: "right" }, // Qty
                        4: { halign: "right" }, // Replacement Qty
                        5: { halign: "center" }, // Status
                    }
                });
            }

            finalizePDF(doc, title, infoLeft, infoRight);

            doc.save(`SVS-${reportMode}-report-${fileDate}.pdf`);
        } catch (err) {
            console.error(err);
            alert("Could not generate PDF report.");
        }
    };
    const cardClass =
        "stat-card animate-card-entrance rounded-3xl border border-white/[0.08] shadow-xl p-5 lg:p-6";
    const cardBg = "linear-gradient(145deg, #0f1e3a 0%, #0a1428 100%)";

    /* Ripple helper */
    const addRipple = (e) => {
        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        const r = document.createElement('span');
        r.className = 'ripple-circle';
        Object.assign(r.style, { width: `${size}px`, height: `${size}px`, left: `${x}px`, top: `${y}px` });
        btn.appendChild(r);
        r.addEventListener('animationend', () => r.remove());
    };

    const currentMonthLabel =
        monthOptions.find((m) => m.value === selectedMonth)?.label || "Select Month";

    return (
        <div
            className="min-h-screen text-white p-4 lg:p-6 animate-fade-in-up"
            style={{ background: "linear-gradient(135deg, #061b4d 0%, #071533 100%)" }}
        >
            <div className="max-w-[1600px] mx-auto">
                <div className="mb-7">
                    <h1 className="text-3xl font-bold tracking-tight text-white">Reports</h1>
                    <p className="text-white/40 mt-1 text-sm font-medium">
                        Daily and monthly sales, brand summary, top products, and PDF export.
                    </p>
                </div>

                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex flex-wrap gap-2.5">
                        <button
                            onClick={() => setReportMode("daily")}
                            className={`btn-ripple px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                reportMode === "daily"
                                    ? "bg-blue-600 shadow-[0_6px_18px_rgba(37,99,235,0.4)]"
                                    : "bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08]"
                            }`}
                            onClick={(e) => { addRipple(e); setReportMode("daily"); }}
                        >
                            Daily
                        </button>

                        <button
                            className={`btn-ripple px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                reportMode === "monthly"
                                    ? "bg-blue-600 shadow-[0_6px_18px_rgba(37,99,235,0.4)]"
                                    : "bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08]"
                            }`}
                            onClick={(e) => { addRipple(e); setReportMode("monthly"); }}
                        >
                            Monthly
                        </button>

                        {reportMode === "monthly" ? (
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="text-white/40 text-xs font-semibold uppercase tracking-wider">Select Month</div>
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="bg-white/[0.06] border border-white/[0.10] rounded-xl px-4 py-2.5 text-white text-sm"
                                >
                                    {monthOptions.map((month) => (
                                        <option key={month.value} value={month.value}>
                                            {month.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="text-white/35 text-xs font-medium">
                                    Showing: {currentMonthLabel}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="flex gap-2.5 ml-0 lg:ml-auto justify-start lg:justify-end">
                        <button
                            onClick={(e) => { addRipple(e); loadReportData(); }}
                            disabled={loading}
                            className="btn-ripple flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] disabled:opacity-50"
                        >
                            {loading ? (
                                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin-smooth" />
                            ) : null}
                            {loading ? "Loading…" : "Refresh"}
                        </button>

                        <button
                            onClick={(e) => { addRipple(e); downloadPDF(); }}
                            className="btn-ripple flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
                            style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 6px 18px rgba(16,185,129,0.4)" }}
                        >
                            Download PDF
                        </button>
                    </div>
                </div>

                {error ? <div className={`${cardClass} mb-6 text-red-300`}>{error}</div> : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                    {[
                        { label: "Total Bills", value: reportStats.totalBills, sub: null, stagger: 1 },
                        { label: "Net Income", value: `₹${money(reportStats.totalIncome)}`, sub: `Gross ₹${money(reportStats.grossIncome)} − Returns ₹${money(reportStats.acceptedReturnRefund)}`, stagger: 2 },
                        { label: "Total Items Sold", value: reportStats.totalItems, sub: null, stagger: 3 },
                        { label: "Average Bill", value: `₹${money(reportStats.avgBill)}`, sub: null, stagger: 4 },
                    ].map(({ label, value, sub, stagger }) => (
                        <div
                            key={label}
                            className={`stat-card animate-card-entrance stagger-${stagger} rounded-3xl border border-white/[0.08] p-5 shadow-lg bg-white/[0.04]`}
                        >
                            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{label}</div>
                            <div className="mt-2.5 text-3xl font-bold tracking-tight text-white tabular-nums">{value}</div>
                            {sub ? <div className="mt-2 text-[11px] text-white/35 font-medium">{sub}</div> : null}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                    {[
                        { label: "Paid Bills", value: reportStats.paidBills, color: "emerald" },
                        { label: "Pending Bills", value: reportStats.pendingBills, color: "amber" },
                        { label: "Accepted Returns", value: reportStats.acceptedReturnsCount, color: "blue" },
                        { label: "Replacement Returns", value: reportStats.replacementReturnsCount, color: "red" },
                    ].map(({ label, value, color }, i) => (
                        <div
                            key={label}
                            className={`stat-card animate-card-entrance stagger-${i + 1} rounded-3xl border border-white/[0.08] p-5 bg-white/[0.03]`}
                        >
                            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{label}</div>
                            <div className={`mt-2.5 text-2xl font-bold text-${color}-300`}>{value}</div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                    <div className={cardClass}>
                        <div className="text-white/60 text-sm">Accepted Return Qty</div>
                        <div className="text-2xl font-bold mt-2">{reportStats.acceptedReturnQty}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/60 text-sm">Replacement Qty</div>
                        <div className="text-2xl font-bold mt-2">{reportStats.replacementQty}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/60 text-sm">Replacement Product Qty</div>
                        <div className="text-2xl font-bold mt-2">{reportStats.replacementProductQty}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/60 text-sm">Total Discount</div>
                        <div className="text-2xl font-bold mt-2">
                            ₹{money(reportStats.totalDiscount)}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                    <div className={cardClass}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold">Top Products</h2>
                            <span className="text-white/50 text-sm">
                                {reportStats.topProducts.length} items
                            </span>
                        </div>

                        {reportStats.topProducts.length === 0 ? (
                            <div className="text-white/50 bg-white/5 rounded-2xl p-4">
                                No sold products for this period.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left border-b border-white/10 text-white/70">
                                            <th className="py-3 pr-4">Barcode</th>
                                            <th className="py-3 pr-4">Product</th>
                                            <th className="py-3 pr-4">Brand</th>
                                            <th className="py-3 pr-4">Qty</th>
                                            <th className="py-3 pr-4">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportStats.topProducts.slice(0, 10).map((item) => (
                <tr key={`${item.barcode}-${item.product_name}`} className="table-row-hover border-b border-white/[0.05]">
                                                    <td className="py-3 pr-4 font-mono text-xs text-white/70">{item.barcode}</td>
                                                    <td className="py-3 pr-4 text-sm font-semibold">{item.product_name}</td>
                                                    <td className="py-3 pr-4 text-white/60 text-sm">{item.brand}</td>
                                                    <td className="py-3 pr-4">
                                                        <span className="inline-flex items-center justify-center rounded-lg bg-blue-500/15 text-blue-300 px-2 py-0.5 text-xs font-bold">{item.qty}</span>
                                                    </td>
                                                    <td className="py-3 pr-4 font-semibold text-white/80">₹{money(item.amount)}</td>
                                                </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className={cardClass}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold">Brand Summary</h2>
                            <span className="text-white/50 text-sm">
                                {reportStats.brandSummary.length} brands
                            </span>
                        </div>

                        {reportStats.brandSummary.length === 0 ? (
                            <div className="text-white/50 bg-white/5 rounded-2xl p-4">
                                No brand data for this period.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left border-b border-white/10 text-white/70">
                                            <th className="py-3 pr-4">Brand</th>
                                            <th className="py-3 pr-4">Qty Sold</th>
                                            <th className="py-3 pr-4">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportStats.brandSummary.map((row) => (
                                            <tr key={row.brand} className="table-row-hover border-b border-white/[0.05]">
                                                <td className="py-3 pr-4 font-semibold text-sm">{row.brand}</td>
                                                <td className="py-3 pr-4">
                                                    <span className="inline-flex items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-xs font-bold">{row.qty}</span>
                                                </td>
                                                <td className="py-3 pr-4 font-semibold text-white/80">₹{money(row.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <div className={`${cardClass} mb-6`}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-2xl font-bold">
                                {reportMode === "monthly" ? "Monthly" : "Daily"} Invoice List
                            </h2>
                            <p className="text-white/50 text-sm mt-1">Period: {range.label}</p>
                        </div>

                        <p className="text-white/50 text-sm">
                            Last updated: {lastLoadedAt ? lastLoadedAt.toLocaleString() : "—"}
                        </p>
                    </div>

                    {reportStats.recentInvoices.length === 0 ? (
                        <div className="text-white/50 bg-white/5 rounded-2xl p-4">
                            No invoices found for this period.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b border-white/10 text-white/70">
                                        <th className="py-3 pr-4">Invoice</th>
                                        <th className="py-3 pr-4">Time</th>
                                        <th className="py-3 pr-4">Customer ID</th>
                                        <th className="py-3 pr-4">Items</th>
                                        <th className="py-3 pr-4">Payment</th>
                                        <th className="py-3 pr-4">Status</th>
                                        <th className="py-3 pr-4">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportStats.recentInvoices.map((inv) => {
                                        const status = String(inv.payment_status || "").toLowerCase();
                                        const badgeCls = status === "paid"
                                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                                            : status === "credit"
                                            ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
                                            : "bg-red-500/15 text-red-300 border-red-500/25";
                                        return (
                                        <tr key={inv.id} className="table-row-hover border-b border-white/[0.05]">
                                            <td className="py-3 pr-4 font-mono text-xs text-white/80">{inv.invoice_code}</td>
                                            <td className="py-3 pr-4 text-xs text-white/55">
                                                {inv.created_at ? new Date(inv.created_at).toLocaleString() : "-"}
                                            </td>
                                            <td className="py-3 pr-4 text-xs text-white/60">{inv.customer_id || "-"}</td>
                                            <td className="py-3 pr-4 text-sm">{inv.total_items || 0}</td>
                                            <td className="py-3 pr-4 text-xs text-white/60">{inv.payment_mode || "-"}</td>
                                            <td className="py-3 pr-4">
                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeCls}`}>
                                                    {inv.payment_status || "-"}
                                                </span>
                                            </td>
                                            <td className="py-3 pr-4 font-bold text-sm">₹{money(inv.final_amount)}</td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className={cardClass}>
                    <h2 className="text-2xl font-bold mb-4">Payment Breakdown</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {Object.entries(reportStats.paymentCounts).length === 0 ? (
                            <div className="text-white/40 bg-white/[0.04] rounded-xl p-4 text-sm font-medium">
                                No payment data for this period.
                            </div>
                        ) : (
                            Object.entries(reportStats.paymentCounts).map(([mode, count]) => (
                                <div key={mode} className="quick-action-card rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                                    <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{mode}</div>
                                    <div className="text-2xl font-bold mt-1.5 text-white">{count} bills</div>
                                    <div className="text-sm text-white/60 mt-1 font-medium">
                                        ₹{money(reportStats.paymentAmount[mode] || 0)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}