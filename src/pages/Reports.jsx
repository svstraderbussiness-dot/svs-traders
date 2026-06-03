import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

export default function Reports() {
    const monthOptions = useMemo(() => getMonthOptions(12), []);
    const [reportMode, setReportMode] = useState("daily");
    const [selectedMonth, setSelectedMonth] = useState(() => monthOptions[0]?.value || "");
    const [loading, setLoading] = useState(false);
    const [invoices, setInvoices] = useState([]);
    const [invoiceItems, setInvoiceItems] = useState([]);
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
            const { data: invoiceData, error: invoiceError } = await supabase
                .from("invoices")
                .select("*")
                .gte("created_at", range.start)
                .lt("created_at", range.end)
                .order("created_at", { ascending: false });

            if (invoiceError) throw invoiceError;

            const safeInvoices = invoiceData || [];
            setInvoices(safeInvoices);

            const invoiceIds = safeInvoices.map((inv) => inv.id);

            if (invoiceIds.length === 0) {
                setInvoiceItems([]);
                setLastLoadedAt(new Date());
                return;
            }

            const { data: itemsData, error: itemsError } = await supabase
                .from("invoice_items")
                .select("*")
                .in("invoice_id", invoiceIds);

            if (itemsError) throw itemsError;

            setInvoiceItems(itemsData || []);
            setLastLoadedAt(new Date());
        } catch (err) {
            console.error(err);
            setError(err?.message || "Failed to load report data.");
            setInvoices([]);
            setInvoiceItems([]);
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
        const totalIncome = invoices.reduce(
            (sum, inv) => sum + Number(inv.final_amount || 0),
            0
        );
        const totalDiscount = invoices.reduce(
            (sum, inv) => sum + Number(inv.discount_amount || 0),
            0
        );
        const totalItems = invoices.reduce(
            (sum, inv) => sum + Number(inv.total_items || 0),
            0
        );
        const paidBills = invoices.filter((inv) => inv.payment_status === "Paid").length;
        const pendingBills = invoices.filter((inv) => inv.payment_status !== "Paid").length;
        const avgBill = totalBills > 0 ? totalIncome / totalBills : 0;

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

        invoiceItems.forEach((item) => {
            const productKey = String(
                item.product_id || `${item.barcode || "-"}-${item.product_name || "-"}`
            );
            const productName = item.product_name || item.product_code || "Product";
            const brandName = item.brand || "Unknown";
            const qty = Number(item.quantity || 0);
            const amount = Number(item.subtotal || 0);

            const productExisting = productMap.get(productKey) || {
                barcode: item.barcode || "-",
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

        const topProducts = [...productMap.values()].sort((a, b) => b.qty - a.qty);
        const brandSummary = [...brandMap.values()].sort((a, b) => b.amount - a.amount);
        const recentInvoices = [...invoices].sort(
            (a, b) =>
                new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );

        return {
            totalBills,
            totalIncome,
            totalDiscount,
            totalItems,
            paidBills,
            pendingBills,
            avgBill,
            paymentCounts,
            paymentAmount,
            topProducts,
            brandSummary,
            recentInvoices,
        };
    }, [invoices, invoiceItems]);

    const downloadPDF = () => {
        try {
            const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
            const today = new Date();
            const fileDate = today.toISOString().slice(0, 10);
            const title =
                reportMode === "monthly" ? "Monthly Sales Report" : "Daily Sales Report";

            doc.setFont("helvetica", "bold");
            doc.setFontSize(18);
            doc.text(`SVS TRADERS - ${title}`, 14, 16);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Period: ${range.label}`, 14, 23);
            doc.text(`Generated At: ${today.toLocaleString()}`, 14, 29);
            doc.text(`Total Bills: ${reportStats.totalBills}`, 14, 35);
            doc.text(`Total Items Sold: ${reportStats.totalItems}`, 14, 41);
            doc.text(`Paid Bills: ${reportStats.paidBills}`, 14, 47);
            doc.text(`Pending Bills: ${reportStats.pendingBills}`, 14, 53);
            doc.text(`Total Discount: ₹${money(reportStats.totalDiscount)}`, 14, 59);
            doc.text(`Total Income: ₹${money(reportStats.totalIncome)}`, 14, 65);

            autoTable(doc, {
                startY: 72,
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
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [10, 32, 83], textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [245, 247, 255] },
                margin: { left: 14, right: 14 },
            });

            const afterInvoicesY = doc.lastAutoTable.finalY + 10;

            autoTable(doc, {
                startY: afterInvoicesY,
                head: [["Brand", "Qty Sold", "Amount"]],
                body: reportStats.brandSummary.map((row) => [
                    row.brand,
                    row.qty,
                    `₹${money(row.amount)}`,
                ]),
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [10, 32, 83], textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [245, 247, 255] },
                margin: { left: 14, right: 14 },
            });

            const afterBrandY = doc.lastAutoTable.finalY + 10;

            autoTable(doc, {
                startY: afterBrandY,
                head: [["Barcode", "Product", "Brand", "Qty Sold", "Amount"]],
                body: reportStats.topProducts.map((item) => [
                    item.barcode,
                    item.product_name,
                    item.brand,
                    item.qty,
                    `₹${money(item.amount)}`,
                ]),
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [10, 32, 83], textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [245, 247, 255] },
                margin: { left: 14, right: 14 },
            });

            doc.save(`SVS-${reportMode}-report-${fileDate}.pdf`);
        } catch (err) {
            console.error(err);
            alert("Could not generate PDF report.");
        }
    };

    const cardClass =
        "rounded-3xl bg-[#1d1d2e] border border-white/10 shadow-xl p-5 lg:p-6";

    const currentMonthLabel =
        monthOptions.find((m) => m.value === selectedMonth)?.label || "Select Month";

    return (
        <div className="min-h-screen bg-[#061b4d] text-white p-4 lg:p-6">
            <div className="max-w-[1600px] mx-auto">
                <div className="mb-6 lg:mb-8">
                    <h1 className="text-4xl lg:text-5xl font-bold">Reports</h1>
                    <p className="text-white/70 mt-2">
                        Daily and monthly sales, brand summary, top products, and PDF export.
                    </p>
                </div>

                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => setReportMode("daily")}
                            className={`px-5 py-3 rounded-2xl font-semibold transition ${reportMode === "daily"
                                    ? "bg-blue-600"
                                    : "bg-white/10 hover:bg-white/15"
                                }`}
                        >
                            Daily
                        </button>

                        <button
                            onClick={() => setReportMode("monthly")}
                            className={`px-5 py-3 rounded-2xl font-semibold transition ${reportMode === "monthly"
                                    ? "bg-blue-600"
                                    : "bg-white/10 hover:bg-white/15"
                                }`}
                        >
                            Monthly
                        </button>

                        {reportMode === "monthly" ? (
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="text-white/60 text-sm">Select Month</div>
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="bg-[#111827] border border-white/10 rounded-2xl px-4 py-3 text-white outline-none"
                                >
                                    {monthOptions.map((month) => (
                                        <option key={month.value} value={month.value}>
                                            {month.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="text-white/40 text-sm">
                                    Showing: {currentMonthLabel}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="flex gap-3 ml-0 lg:ml-auto justify-start lg:justify-end">
                        <button
                            onClick={loadReportData}
                            disabled={loading}
                            className="px-5 py-3 rounded-2xl font-semibold bg-white/10 hover:bg-white/15 disabled:opacity-50 transition"
                        >
                            {loading ? "Loading..." : "Refresh"}
                        </button>

                        <button
                            onClick={downloadPDF}
                            className="px-5 py-3 rounded-2xl font-semibold bg-emerald-600 hover:bg-emerald-700 transition"
                        >
                            Download PDF
                        </button>
                    </div>
                </div>

                {error ? (
                    <div className={`${cardClass} mb-6 text-red-300`}>{error}</div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Total Bills</div>
                        <div className="text-3xl font-bold mt-2">{reportStats.totalBills}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Total Income</div>
                        <div className="text-3xl font-bold mt-2">₹{money(reportStats.totalIncome)}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Total Items Sold</div>
                        <div className="text-3xl font-bold mt-2">{reportStats.totalItems}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/50 text-sm">Average Bill</div>
                        <div className="text-3xl font-bold mt-2">₹{money(reportStats.avgBill)}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6 mb-6">
                    <div className={cardClass}>
                        <div className="text-white/60 text-sm">Paid Bills</div>
                        <div className="text-2xl font-bold mt-2">{reportStats.paidBills}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/60 text-sm">Pending Bills</div>
                        <div className="text-2xl font-bold mt-2">{reportStats.pendingBills}</div>
                    </div>

                    <div className={cardClass}>
                        <div className="text-white/60 text-sm">Total Discount</div>
                        <div className="text-2xl font-bold mt-2">₹{money(reportStats.totalDiscount)}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                    <div className={cardClass}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold">Top Products</h2>
                            <span className="text-white/50 text-sm">{reportStats.topProducts.length} items</span>
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
                                            <tr
                                                key={`${item.barcode}-${item.product_name}`}
                                                className="border-b border-white/5"
                                            >
                                                <td className="py-3 pr-4">{item.barcode}</td>
                                                <td className="py-3 pr-4">{item.product_name}</td>
                                                <td className="py-3 pr-4">{item.brand}</td>
                                                <td className="py-3 pr-4">{item.qty}</td>
                                                <td className="py-3 pr-4">₹{money(item.amount)}</td>
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
                            <span className="text-white/50 text-sm">{reportStats.brandSummary.length} brands</span>
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
                                            <tr key={row.brand} className="border-b border-white/5">
                                                <td className="py-3 pr-4">{row.brand}</td>
                                                <td className="py-3 pr-4">{row.qty}</td>
                                                <td className="py-3 pr-4">₹{money(row.amount)}</td>
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
                            <p className="text-white/50 text-sm mt-1">
                                Period: {range.label}
                            </p>
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
                                    {reportStats.recentInvoices.map((inv) => (
                                        <tr key={inv.id} className="border-b border-white/5">
                                            <td className="py-3 pr-4">{inv.invoice_code}</td>
                                            <td className="py-3 pr-4">
                                                {inv.created_at
                                                    ? new Date(inv.created_at).toLocaleString()
                                                    : "-"}
                                            </td>
                                            <td className="py-3 pr-4">{inv.customer_id || "-"}</td>
                                            <td className="py-3 pr-4">{inv.total_items || 0}</td>
                                            <td className="py-3 pr-4">{inv.payment_mode || "-"}</td>
                                            <td className="py-3 pr-4">{inv.payment_status || "-"}</td>
                                            <td className="py-3 pr-4">₹{money(inv.final_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className={cardClass}>
                    <h2 className="text-2xl font-bold mb-4">Payment Breakdown</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {Object.entries(reportStats.paymentCounts).length === 0 ? (
                            <div className="text-white/50 bg-white/5 rounded-2xl p-4">
                                No payment data for this period.
                            </div>
                        ) : (
                            Object.entries(reportStats.paymentCounts).map(([mode, count]) => (
                                <div key={mode} className="rounded-2xl bg-white/5 p-4 border border-white/5">
                                    <div className="text-white/50 text-sm">{mode}</div>
                                    <div className="text-2xl font-bold mt-1">{count} bills</div>
                                    <div className="text-white/70 mt-1">
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