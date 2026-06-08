import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../context/ThemeContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function money(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "").trim();
}

function parseDbDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;

    const raw = String(dateValue).trim();
    if (!raw) return null;

    if (/[zZ]$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) {
        return new Date(raw.replace(" ", "T"));
    }

    const normalized = raw.includes("T")
        ? `${raw}Z`
        : `${raw.replace(" ", "T")}Z`;
    return new Date(normalized);
}

function formatIST(dateValue) {
    const date = parseDbDate(dateValue);
    if (!date || Number.isNaN(date.getTime())) return "-";

    return date.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
}

function getTodayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return {
        start: start.toISOString(),
        end: end.toISOString(),
    };
}

function buildInvoiceCode(prefix = "SVS") {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
        now.getDate()
    ).padStart(2, "0")}`;
    const randomPart = String(Math.floor(Math.random() * 9000) + 1000);
    return `${prefix}-${datePart}-${randomPart}`;
}

export default function Billing() {
    const { settings } = useTheme();

    const defaultPaymentMode = useMemo(() => {
        const mode = settings.default_payment_mode || "Cash";
        if (mode === "Credit" && !settings.credit_billing) return "Cash";
        return mode;
    }, [settings.default_payment_mode, settings.credit_billing]);

    const defaultDiscountType = useMemo(() => {
        return settings.default_discount_type === "%" ? "percent" : "amount";
    }, [settings.default_discount_type]);

    const invoicePrefix = useMemo(() => {
        return settings.invoice_prefix?.trim() || "SVS";
    }, [settings.invoice_prefix]);

    const lowStockThreshold = useMemo(() => {
        const value = Number(settings.low_stock_threshold);
        return Number.isFinite(value) ? value : 5;
    }, [settings.low_stock_threshold]);

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const [cart, setCart] = useState([]);

    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [customerEmail, setCustomerEmail] = useState("");

    const [paymentMode, setPaymentMode] = useState(defaultPaymentMode);
    const [markAsPaid, setMarkAsPaid] = useState(true);

    const [billDiscountType, setBillDiscountType] = useState(defaultDiscountType);
    const [billDiscountValue, setBillDiscountValue] = useState("");

    const [manualInvoiceCode, setManualInvoiceCode] = useState("");

    const [saving, setSaving] = useState(false);
    const [successInvoice, setSuccessInvoice] = useState(null);
    const [lastInvoice, setLastInvoice] = useState(null);

    const [historyLoading, setHistoryLoading] = useState(false);
    const [todayInvoices, setTodayInvoices] = useState([]);
    const [message, setMessage] = useState("");

    const [printInvoice, setPrintInvoice] = useState(null);

    const [liveTime, setLiveTime] = useState(
        new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        })
    );

    useEffect(() => {
        const timer = setInterval(() => {
            setLiveTime(
                new Date().toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                })
            );
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        setPaymentMode(defaultPaymentMode);
    }, [defaultPaymentMode]);

    useEffect(() => {
        setBillDiscountType(defaultDiscountType);
    }, [defaultDiscountType]);

    useEffect(() => {
        if (paymentMode === "Credit") {
            setMarkAsPaid(false);
        }
    }, [paymentMode]);

    useEffect(() => {
        if (!settings.credit_billing && paymentMode === "Credit") {
            setPaymentMode(defaultPaymentMode);
        }
    }, [settings.credit_billing, paymentMode, defaultPaymentMode]);

    useEffect(() => {
        if (settings.auto_invoice) {
            setManualInvoiceCode("");
        }
    }, [settings.auto_invoice]);

    useEffect(() => {
        const handleAfterPrint = () => {
            setPrintInvoice(null);
        };

        window.addEventListener("afterprint", handleAfterPrint);
        return () => window.removeEventListener("afterprint", handleAfterPrint);
    }, []);

    useEffect(() => {
        if (!printInvoice) return;

        const timer = setTimeout(() => {
            window.print();
        }, 400);

        return () => clearTimeout(timer);
    }, [printInvoice]);

    const getLineGross = (item) => {
        return Number(item.quantity || 0) * Number(item.mrp || 0);
    };

    const getLineDiscountAmount = (item) => {
        const gross = getLineGross(item);
        const value = Number(item.discountValue || 0);

        if (!value || gross <= 0) return 0;

        if (item.discountType === "percent") {
            const percent = Math.min(Math.max(value, 0), 100);
            return (gross * percent) / 100;
        }

        return Math.min(Math.max(value, 0), gross);
    };

    const getLineNet = (item) => {
        return Math.max(getLineGross(item) - getLineDiscountAmount(item), 0);
    };

    const getUnitNetPrice = (item) => {
        const qty = Number(item.quantity || 0);
        if (qty <= 0) return 0;
        return getLineNet(item) / qty;
    };

    const itemsGrossTotal = useMemo(() => {
        return cart.reduce(
            (sum, item) => sum + Number(item.quantity || 0) * Number(item.mrp || 0),
            0
        );
    }, [cart]);

    const itemDiscountTotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + getLineDiscountAmount(item), 0);
    }, [cart]);

    const itemsNetTotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + getLineNet(item), 0);
    }, [cart]);

    const billDiscountAmount = useMemo(() => {
        const value = Number(billDiscountValue || 0);
        if (!value) return 0;

        if (billDiscountType === "percent") {
            const percent = Math.min(Math.max(value, 0), 100);
            return (itemsNetTotal * percent) / 100;
        }

        return Math.min(Math.max(value, 0), itemsNetTotal);
    }, [billDiscountType, billDiscountValue, itemsNetTotal]);

    const totalDiscountAmount = itemDiscountTotal + billDiscountAmount;
    const finalTotal = Math.max(itemsNetTotal - billDiscountAmount, 0);

    const paymentStatus = useMemo(() => {
        if (paymentMode === "Credit") return "Pending";
        return markAsPaid ? "Paid" : "Pending";
    }, [markAsPaid, paymentMode]);

    const totalItems = useMemo(() => {
        return cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    }, [cart]);

    const openWhatsAppReceipt = (phone, text) => {
        const digits = normalizePhone(phone);
        if (!digits) return;

        const normalized = digits.length === 10 ? `91${digits}` : digits;
        const url = `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const openEmailReceipt = (email, subject, body) => {
        const mailTo = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
            subject
        )}&body=${encodeURIComponent(body)}`;
        window.open(mailTo, "_blank", "noopener,noreferrer");
    };

    const clearBill = () => {
        setSearchQuery("");
        setSearchResults([]);
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setCustomerEmail("");
        setBillDiscountValue("");
        setManualInvoiceCode("");
        setPaymentMode(defaultPaymentMode);
        setBillDiscountType(defaultDiscountType);
        setMarkAsPaid(true);
        setSuccessInvoice(null);
        setMessage("");
        setPrintInvoice(null);
    };

    const addToCart = (product) => {
        setCart((prev) => {
            const existing = prev.find((item) => item.id === product.id);
            const stock = Number(product.quantity || 0);

            if (stock <= 0) {
                alert("Product is not available.");
                return prev;
            }

            if (existing) {
                if (existing.quantity >= stock) {
                    alert("No more stock available for this product.");
                    return prev;
                }

                return prev.map((item) =>
                    item.id === product.id
                        ? { ...item, quantity: Math.min(item.quantity + 1, stock) }
                        : item
                );
            }

            return [
                ...prev,
                {
                    id: product.id,
                    barcode: product.barcode || "-",
                    product_name: product.product_code || "Product",
                    brand: product.brand || "",
                    size: product.size || "",
                    product_code: product.product_code || "",
                    style_code: product.style_code || "",
                    mrp: Number(product.mrp ?? 0),
                    stock,
                    quantity: 1,
                    discountType: defaultDiscountType,
                    discountValue: "",
                    originalProduct: {
                        barcode: product.barcode || "",
                        date: product.date || "",
                        style_code: product.style_code || "",
                        size: product.size || "",
                        product_code: product.product_code || "",
                        quantity: Number(product.quantity || 0),
                        mrp: Number(product.mrp || 0),
                        brand: product.brand || "",
                    },
                },
            ];
        });

        setSearchQuery("");
        setSearchResults([]);
    };

    const updateCartQty = (id, newQty) => {
        const qty = Number(newQty || 0);

        setCart((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;
                const safeQty = Math.min(Math.max(qty, 1), item.stock);
                return { ...item, quantity: safeQty };
            })
        );
    };

    const updateCartDiscount = (id, field, value) => {
        setCart((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;

                if (field === "discountType") {
                    return { ...item, discountType: value };
                }

                if (field === "discountValue") {
                    return { ...item, discountValue: value };
                }

                return item;
            })
        );
    };

    const removeFromCart = (id) => {
        setCart((prev) => prev.filter((item) => item.id !== id));
    };

    const fetchProducts = async (query, { exactAdd = false } = {}) => {
        const q = String(query || "").trim();

        if (!q) {
            setSearchResults([]);
            return;
        }

        setSearching(true);

        try {
            if (exactAdd) {
                const { data: exactProduct, error: exactError } = await supabase
                    .from("products")
                    .select("*")
                    .eq("barcode", q)
                    .maybeSingle();

                if (exactError) throw exactError;

                if (exactProduct) {
                    addToCart(exactProduct);
                    setSearching(false);
                    return;
                }
            }

            const { data, error } = await supabase
                .from("products")
                .select("*")
                .or(`barcode.ilike.%${q}%,product_code.ilike.%${q}%,style_code.ilike.%${q}%`)
                .order("created_at", { ascending: false })
                .limit(12);

            if (error) throw error;

            setSearchResults(data || []);
        } catch (err) {
            console.error(err);
            alert(err?.message || "Search failed.");
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    useEffect(() => {
        const q = searchQuery.trim();

        if (!q) {
            setSearchResults([]);
            return;
        }

        const timer = setTimeout(() => {
            fetchProducts(q, { exactAdd: false });
        }, 250);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const onSearchKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            fetchProducts(searchQuery, { exactAdd: true });
        }
    };

    const loadTodayInvoices = async () => {
        setHistoryLoading(true);

        try {
            const { start, end } = getTodayRange();

            const [invoiceRes, returnsRes] = await Promise.all([
                supabase
                    .from("invoices")
                    .select("id, invoice_code, total_items, final_amount, payment_status, created_at")
                    .gte("created_at", start)
                    .lte("created_at", end)
                    .order("created_at", { ascending: false }),

                supabase
                    .from("returns")
                    .select("invoice_code, created_at, status")
                    .eq("status", "Accepted")
                    .gte("created_at", start)
                    .lte("created_at", end),
            ]);

            if (invoiceRes.error) throw invoiceRes.error;
            if (returnsRes.error) throw returnsRes.error;

            const invoiceList = invoiceRes.data || [];
            const returnedInvoiceCodes = new Set(
                (returnsRes.data || []).map((r) => String(r.invoice_code || ""))
            );

            const updatedInvoices = invoiceList.map((invoice) => ({
                ...invoice,
                isReturnedToday: returnedInvoiceCodes.has(String(invoice.invoice_code || "")),
            }));

            setTodayInvoices(updatedInvoices);
        } catch (err) {
            console.error(err);
            alert(err?.message || "Could not load today's invoices.");
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        loadTodayInvoices();
    }, []);

    const getTodaySalesReportData = async () => {
        const { start, end } = getTodayRange();

        const [invoiceRes, returnsRes] = await Promise.all([
            supabase
                .from("invoices")
                .select(
                    "id, invoice_code, subtotal, discount_amount, final_amount, payment_mode, payment_status, total_items, created_at"
                )
                .gte("created_at", start)
                .lte("created_at", end)
                .order("created_at", { ascending: true }),

            supabase
                .from("returns")
                .select("invoice_code, quantity, refund_amount, status, created_at")
                .eq("status", "Accepted")
                .gte("created_at", start)
                .lte("created_at", end),
        ]);

        if (invoiceRes.error) throw invoiceRes.error;
        if (returnsRes.error) throw returnsRes.error;

        const invoiceList = invoiceRes.data || [];
        const returnedInvoiceCodes = new Set(
            (returnsRes.data || []).map((r) => String(r.invoice_code || ""))
        );

        const updatedInvoices = invoiceList.map((invoice) => ({
            ...invoice,
            isReturnedToday: returnedInvoiceCodes.has(String(invoice.invoice_code || "")),
        }));

        const returnedRefundTotal = (returnsRes.data || []).reduce(
            (sum, row) => sum + Number(row.refund_amount || 0),
            0
        );

        return {
            invoiceList: updatedInvoices,
            returnedRefundTotal,
        };
    };

    const downloadDailyReportPDF = async () => {
        setHistoryLoading(true);

        try {
            const { invoiceList, returnedRefundTotal } = await getTodaySalesReportData();

            const totalGrossIncome = invoiceList.reduce(
                (sum, inv) => sum + Number(inv.final_amount || 0),
                0
            );

            const totalDiscount = invoiceList.reduce(
                (sum, inv) => sum + Number(inv.discount_amount || 0),
                0
            );

            const totalBills = invoiceList.length;

            const totalItemsSold = invoiceList.reduce(
                (sum, inv) => sum + Number(inv.total_items || 0),
                0
            );

            const totalIncome = Math.max(totalGrossIncome - returnedRefundTotal, 0);

            const { data: invoiceItems, error: itemsError } = await supabase
                .from("invoice_items")
                .select("*")
                .in("invoice_id", invoiceList.map((inv) => inv.id));

            if (itemsError) throw itemsError;

            const soldMap = new Map();

            (invoiceItems || []).forEach((item) => {
                const key = String(item.product_id || `${item.barcode}-${item.product_name}`);
                const existing = soldMap.get(key) || {
                    barcode: item.barcode || "-",
                    product_name: item.product_name || "-",
                    brand: item.brand || "-",
                    qty: 0,
                    amount: 0,
                };

                existing.qty += Number(item.quantity || 0);
                existing.amount += Number(item.subtotal || 0);

                soldMap.set(key, existing);
            });

            const soldRows = [...soldMap.values()].sort((a, b) => b.qty - a.qty);

            const doc = new jsPDF({
                orientation: "landscape",
                unit: "mm",
                format: "a4",
            });

            const todayText = new Date().toLocaleDateString();
            const fileDate = new Date().toISOString().slice(0, 10);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(18);
            doc.text("SVS TRADERS - Daily Sales Report", 14, 16);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Date: ${todayText}`, 14, 23);
            doc.text(`Total Bills: ${totalBills}`, 14, 29);
            doc.text(`Total Items Sold: ${totalItemsSold}`, 14, 35);
            doc.text(`Total Discount: ₹${money(totalDiscount)}`, 14, 41);
            doc.text(`Gross Income: ₹${money(totalGrossIncome)}`, 14, 47);
            doc.text(`Returned Today: ₹${money(returnedRefundTotal)}`, 14, 53);
            doc.text(`Net Income: ₹${money(totalIncome)}`, 14, 59);

            autoTable(doc, {
                startY: 67,
                head: [["Invoice", "Time", "Items", "Payment", "Status", "Total"]],
                body: invoiceList.map((inv) => [
                    inv.invoice_code || "-",
                    formatIST(inv.created_at),
                    inv.total_items || 0,
                    inv.payment_mode || "-",
                    inv.isReturnedToday ? "Returned" : inv.payment_status || "-",
                    `₹${money(inv.final_amount)}`,
                ]),
                styles: {
                    fontSize: 8,
                    cellPadding: 2,
                },
                headStyles: {
                    fillColor: [10, 32, 83],
                    textColor: [255, 255, 255],
                },
                alternateRowStyles: {
                    fillColor: [245, 247, 255],
                },
                margin: { left: 14, right: 14 },
            });

            const afterInvoicesY = doc.lastAutoTable.finalY + 10;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("Stock Sold Summary", 14, afterInvoicesY);

            autoTable(doc, {
                startY: afterInvoicesY + 4,
                head: [["Barcode", "Product", "Brand", "Qty Sold", "Amount"]],
                body: soldRows.map((item) => [
                    item.barcode,
                    item.product_name,
                    item.brand,
                    item.qty,
                    `₹${money(item.amount)}`,
                ]),
                styles: {
                    fontSize: 8,
                    cellPadding: 2,
                },
                headStyles: {
                    fillColor: [10, 32, 83],
                    textColor: [255, 255, 255],
                },
                alternateRowStyles: {
                    fillColor: [245, 247, 255],
                },
                margin: { left: 14, right: 14 },
            });

            doc.save(`SVS-Daily-Report-${fileDate}.pdf`);
        } catch (err) {
            console.error(err);
            alert(err?.message || "Could not create daily PDF report.");
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleGenerateBill = async () => {
        if (!customerName.trim() || !customerPhone.trim()) {
            setMessage("Customer name and phone number are required before saving the bill.");
            return;
        }

        if (!cart.length) {
            alert("Add at least one product to the bill.");
            return;
        }

        if (paymentMode === "Credit" && !settings.credit_billing) {
            alert("Credit billing is disabled in settings.");
            return;
        }

        const invoiceCode = settings.auto_invoice
            ? buildInvoiceCode(invoicePrefix)
            : manualInvoiceCode.trim();

        if (!invoiceCode) {
            alert("Enter invoice code.");
            return;
        }

        setSaving(true);

        let customerId = null;
        let createdInvoice = null;
        const deductedProducts = [];
        const printableItems = cart.map((item) => ({ ...item }));

        try {
            for (const item of cart) {
                const { data: latestProduct, error: latestError } = await supabase
                    .from("products")
                    .select("*")
                    .eq("id", item.id)
                    .maybeSingle();

                if (latestError) throw latestError;

                if (!latestProduct) {
                    throw new Error(`Product not found: ${item.product_name}`);
                }

                if (Number(latestProduct.quantity || 0) < item.quantity) {
                    throw new Error(
                        `Not enough stock for ${item.product_name}. Available: ${latestProduct.quantity}`
                    );
                }
            }

            const normalizedPhone = normalizePhone(customerPhone);
            const hasCustomerInfo =
                customerName.trim() || normalizedPhone || customerEmail.trim();

            if (hasCustomerInfo) {
                if (normalizedPhone) {
                    const { data: existingCustomer, error: customerLookupError } =
                        await supabase
                            .from("customers")
                            .select("*")
                            .eq("phone_number", normalizedPhone)
                            .maybeSingle();

                    if (customerLookupError) throw customerLookupError;

                    if (existingCustomer) {
                        customerId = existingCustomer.id;

                        const { error: customerUpdateError } = await supabase
                            .from("customers")
                            .update({
                                customer_name:
                                    customerName.trim() || existingCustomer.customer_name,
                                email: customerEmail.trim() || existingCustomer.email,
                            })
                            .eq("id", customerId);

                        if (customerUpdateError) throw customerUpdateError;
                    } else {
                        const { data: newCustomer, error: customerInsertError } =
                            await supabase
                                .from("customers")
                                .insert([
                                    {
                                        customer_name:
                                            customerName.trim() || "Walk-in Customer",
                                        phone_number: normalizedPhone,
                                        email: customerEmail.trim() || null,
                                    },
                                ])
                                .select("*")
                                .single();

                        if (customerInsertError) throw customerInsertError;
                        customerId = newCustomer.id;
                    }
                } else {
                    const { data: newCustomer, error: customerInsertError } =
                        await supabase
                            .from("customers")
                            .insert([
                                {
                                    customer_name:
                                        customerName.trim() || "Walk-in Customer",
                                    phone_number: null,
                                    email: customerEmail.trim() || null,
                                },
                            ])
                            .select("*")
                            .single();

                    if (customerInsertError) throw customerInsertError;
                    customerId = newCustomer.id;
                }
            }

            const { data: invoiceRow, error: invoiceError } = await supabase
                .from("invoices")
                .insert([
                    {
                        invoice_code: invoiceCode,
                        customer_id: customerId,
                        subtotal: itemsGrossTotal,
                        discount_amount: totalDiscountAmount,
                        final_amount: finalTotal,
                        payment_mode: paymentMode,
                        payment_status: paymentStatus,
                        total_items: totalItems,
                    },
                ])
                .select("*")
                .single();

            if (invoiceError) throw invoiceError;

            createdInvoice = invoiceRow;

            const invoiceItemsPayload = cart.map((item) => ({
                invoice_id: invoiceRow.id,
                product_id: item.id,
                quantity: item.quantity,
                price: Number(getUnitNetPrice(item)),
                subtotal: Number(getLineNet(item)),
                barcode: item.barcode,
                product_name: item.product_name || item.product_code || item.style_code || "Product",
                brand: item.brand,
            }));

            const { error: itemsError } = await supabase.from("invoice_items").insert(invoiceItemsPayload);
            if (itemsError) throw itemsError;

            for (const item of cart) {
                const { data: latestProduct, error: latestError } = await supabase
                    .from("products")
                    .select("*")
                    .eq("id", item.id)
                    .maybeSingle();

                if (latestError) throw latestError;

                const currentQty = Number(latestProduct?.quantity || 0);
                const soldQty = Number(item.quantity || 0);
                const newQty = currentQty - soldQty;

                let updateError = null;

                if (newQty <= 0) {
                    const { error } = await supabase
                        .from("products")
                        .delete()
                        .eq("id", item.id);

                    updateError = error;
                } else {
                    const { error } = await supabase
                        .from("products")
                        .update({
                            quantity: newQty,
                        })
                        .eq("id", item.id);

                    updateError = error;
                }

                if (updateError) throw updateError;

                deductedProducts.push({
                    id: item.id,
                    quantity: item.quantity,
                    originalProduct: item.originalProduct || {
                        barcode: item.barcode || "",
                        date: "",
                        style_code: item.style_code || "",
                        size: item.size || "",
                        product_code: item.product_code || "",
                        quantity: 0,
                        mrp: item.mrp || 0,
                        brand: item.brand || "",
                    },
                });
            }

            const receiptLines = printableItems
                .map((item, index) => {
                    const lineGross = getLineGross(item);
                    const lineDiscount = getLineDiscountAmount(item);
                    const lineNet = getLineNet(item);

                    const discountText =
                        Number(item.discountValue || 0) > 0
                            ? item.discountType === "percent"
                                ? `${money(item.discountValue)}% Off`
                                : `₹${money(item.discountValue)} Off`
                            : "No Discount";

                    return `${index + 1}x ${item.product_name} — ₹${money(
                        lineNet
                    )} (MRP: ₹${money(lineGross)} | ${discountText})`;
                })
                .join("\n");

            const receiptText = `Hello ${customerName.trim() || "Customer"},

Thank you for shopping with ${settings.business_name || "2DudesBevdass (SVS TRADERS)"}

Invoice Details:

Invoice No: ${invoiceCode}

Payment Mode: ${paymentMode}

Status: ${paymentStatus}

Order Summary:

${receiptLines}

Items Total: ₹${money(itemsGrossTotal)}

Total Discount: ₹${money(totalDiscountAmount)}

Final Amount Paid: ₹${money(finalTotal)}

Thank you for your purchase! Please visit again.`;

            if (settings.whatsapp_receipt && normalizePhone(customerPhone)) {
                openWhatsAppReceipt(customerPhone, receiptText);
            }

            if (settings.email_receipt && customerEmail.trim()) {
                openEmailReceipt(
                    customerEmail.trim(),
                    `${settings.business_name || "SVS TRADERS"} - Invoice ${invoiceCode}`,
                    receiptText
                );
            }

            setLastInvoice({
                invoiceId: invoiceRow.id,
                invoiceCode,
                customerId,
                customerName: customerName.trim(),
                phone: normalizePhone(customerPhone),
                email: customerEmail.trim() || "",
                items: printableItems,
                itemsGrossTotal,
                itemDiscountTotal,
                billDiscountAmount,
                finalTotal,
                paymentMode,
                paymentStatus,
            });

            setSuccessInvoice({
                invoiceCode,
                finalTotal,
                itemsGrossTotal,
                itemDiscountTotal,
                billDiscountAmount,
                paymentMode,
                paymentStatus,
                customerName: customerName.trim(),
                phone: normalizePhone(customerPhone),
            });

            setPrintInvoice({
                invoiceCode,
                customerName: customerName.trim(),
                items: printableItems,
                itemsGrossTotal,
                itemDiscountTotal,
                billDiscountAmount,
                finalTotal,
                paymentMode,
                paymentStatus,
                invoiceDate: new Date().toLocaleString("en-IN"),
            });

            setCart([]);
            setSearchQuery("");
            setSearchResults([]);
            setBillDiscountValue("");
            setManualInvoiceCode("");
            setCustomerName("");
            setCustomerPhone("");
            setCustomerEmail("");
            setPaymentMode(defaultPaymentMode);
            setBillDiscountType(defaultDiscountType);
            setMarkAsPaid(true);

            await loadTodayInvoices();

            setMessage(`Invoice ${invoiceCode} saved successfully.`);
        } catch (err) {
            console.error(err);

            try {
                if (createdInvoice?.id) {
                    await supabase.from("invoice_items").delete().eq("invoice_id", createdInvoice.id);
                    await supabase.from("invoices").delete().eq("id", createdInvoice.id);
                }

                for (const item of deductedProducts) {
                    const original = item.originalProduct || null;

                    if (!original) continue;

                    const { data: existingProduct, error: productFetchError } = await supabase
                        .from("products")
                        .select("*")
                        .eq("id", item.id)
                        .maybeSingle();

                    if (productFetchError) throw productFetchError;

                    if (existingProduct) {
                        const restoredQty =
                            Number(existingProduct.quantity || 0) + Number(item.quantity || 0);

                        const { error: restoreError } = await supabase
                            .from("products")
                            .update({
                                quantity: restoredQty,
                            })
                            .eq("id", item.id);

                        if (restoreError) throw restoreError;
                    } else {
                        const { error: insertError } = await supabase.from("products").insert([
                            {
                                id: item.id,
                                barcode: original.barcode || "",
                                date: original.date || "",
                                style_code: original.style_code || "",
                                size: original.size || "",
                                product_code: original.product_code || "",
                                quantity: Number(item.quantity || 0),
                                mrp: Number(original.mrp || 0),
                                brand: original.brand || "",
                            },
                        ]);

                        if (insertError) throw insertError;
                    }
                }
            } catch (rollbackError) {
                console.error("Rollback failed:", rollbackError);
            }

            alert(err?.message || "Failed to generate bill.");
        } finally {
            setSaving(false);
        }
    };

    const undoLastInvoice = async () => {
        if (!lastInvoice) {
            alert("No invoice to undo.");
            return;
        }

        if (!window.confirm("Undo the last invoice? Stock will be restored.")) {
            return;
        }

        setSaving(true);

        try {
            for (const item of lastInvoice.items) {
                const { data: product, error: productError } = await supabase
                    .from("products")
                    .select("*")
                    .eq("id", item.id)
                    .maybeSingle();

                if (productError) throw productError;

                const original = item.originalProduct || {
                    barcode: item.barcode || "",
                    date: "",
                    style_code: item.style_code || "",
                    size: item.size || "",
                    product_code: item.product_code || "",
                    quantity: 0,
                    mrp: item.mrp || 0,
                    brand: item.brand || "",
                };

                if (product) {
                    const restoredQty = Number(product.quantity || 0) + Number(item.quantity || 0);

                    await supabase
                        .from("products")
                        .update({
                            quantity: restoredQty,
                        })
                        .eq("id", item.id);
                } else {
                    await supabase.from("products").insert([
                        {
                            id: item.id,
                            barcode: original.barcode || "",
                            date: original.date || "",
                            style_code: original.style_code || "",
                            size: original.size || "",
                            product_code: original.product_code || "",
                            quantity: Number(item.quantity || 0),
                            mrp: Number(original.mrp || 0),
                            brand: original.brand || "",
                        },
                    ]);
                }
            }

            await supabase.from("invoice_items").delete().eq("invoice_id", lastInvoice.invoiceId);
            await supabase.from("invoices").delete().eq("id", lastInvoice.invoiceId);

            setLastInvoice(null);
            setSuccessInvoice(null);

            await loadTodayInvoices();

            alert("Last invoice undone successfully.");
        } catch (err) {
            console.error(err);
            alert(err?.message || "Could not undo invoice.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#061b4d] text-white p-4 lg:p-6">
            <style>{`
                @media print {
                    body * {
                        visibility: hidden !important;
                    }

                    #thermal-bill,
                    #thermal-bill * {
                        visibility: visible !important;
                    }

                    #thermal-bill {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 80mm !important;
                        padding: 6mm !important;
                        font-family: monospace !important;
                        color: #000 !important;
                        background: #fff !important;
                    }

                    @page {
                        size: 80mm auto;
                        margin: 0;
                    }
                }
            `}</style>

            <div className="mx-auto max-w-[1600px]">
                <div className="mb-6 lg:mb-8">
                    <h1 className="text-4xl lg:text-5xl font-bold">Billing</h1>
                    <p className="text-white/70 mt-2">
                        Fast POS billing with barcode search, cart, invoice save, and WhatsApp receipt.
                    </p>
                    <p className="text-sm text-cyan-300 mt-2">Live Time: {liveTime}</p>
                </div>

                {message ? (
                    <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                        {message}
                    </div>
                ) : null}

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    <div className="xl:col-span-8 space-y-6">
                        <div className="bg-[#1d1d2e] rounded-3xl p-5 lg:p-6 shadow-xl border border-white/10">
                            <h2 className="text-2xl font-bold mb-4">Search Product</h2>

                            <div className="flex flex-col lg:flex-row gap-3 items-start">
                                <div className="w-full max-w-xl">
                                    <input
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={onSearchKeyDown}
                                        placeholder="Scan or type barcode / product code / style code"
                                        className="w-full bg-[#101725] border border-white/10 rounded-2xl px-4 py-3 outline-none text-white placeholder:text-white/40"
                                    />
                                </div>

                                <button
                                    onClick={() => fetchProducts(searchQuery, { exactAdd: true })}
                                    disabled={searching}
                                    className="bg-blue-600 hover:bg-blue-700 transition rounded-2xl px-6 py-3 font-semibold min-w-[120px]"
                                >
                                    {searching ? "Searching..." : "Search"}
                                </button>
                            </div>

                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm max-w-3xl">
                                <div className="rounded-2xl bg-white/5 border border-white/5 p-3">
                                    <div className="text-white/50">Cart Items</div>
                                    <div className="text-xl font-semibold mt-1">{cart.length}</div>
                                </div>
                                <div className="rounded-2xl bg-white/5 border border-white/5 p-3">
                                    <div className="text-white/50">Items Total</div>
                                    <div className="text-xl font-semibold mt-1">₹{money(itemsGrossTotal)}</div>
                                </div>
                                <div className="rounded-2xl bg-white/5 border border-white/5 p-3">
                                    <div className="text-white/50">Final Total</div>
                                    <div className="text-xl font-semibold mt-1">₹{money(finalTotal)}</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#1d1d2e] rounded-3xl p-5 lg:p-6 shadow-xl border border-white/10">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-2xl font-bold">Search Results</h2>
                                <span className="text-white/50 text-sm">{searchResults.length} found</span>
                            </div>

                            {searchResults.length === 0 ? (
                                <div className="text-white/50 py-14 text-center rounded-2xl bg-white/5 border border-white/5">
                                    Search products to see results here.
                                </div>
                            ) : (
                                <div className="grid sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
                                    {searchResults.map((product) => {
                                        const stock = Number(product.quantity || 0);
                                        const isLowStock = stock <= lowStockThreshold;

                                        return (
                                            <div
                                                key={product.id}
                                                className="rounded-3xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="font-bold text-lg leading-tight">
                                                            {product.product_code || "Product"}
                                                        </div>
                                                        <div className="text-white/50 text-sm mt-1">
                                                            {product.barcode}
                                                        </div>
                                                    </div>

                                                    <div className="text-right text-sm text-white/60">
                                                        <div>{product.brand || "-"}</div>
                                                        <div>{product.size || "-"}</div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                                                    <div className="rounded-2xl bg-black/20 p-3">
                                                        <div className="text-white/40">Stock</div>
                                                        <div
                                                            className={`text-lg font-semibold ${isLowStock ? "text-red-400" : ""
                                                                }`}
                                                        >
                                                            {stock}
                                                        </div>
                                                    </div>
                                                    <div className="rounded-2xl bg-black/20 p-3">
                                                        <div className="text-white/40">MRP</div>
                                                        <div className="text-lg font-semibold">
                                                            ₹{money(product.mrp)}
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => addToCart(product)}
                                                    className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 transition rounded-2xl px-4 py-3 font-semibold"
                                                >
                                                    Add to Cart
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="bg-[#1d1d2e] rounded-3xl p-5 lg:p-6 shadow-xl border border-white/10">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
                                <div>
                                    <h2 className="text-2xl font-bold">Today's Sales Report</h2>
                                    <p className="text-white/50 text-sm mt-1">
                                        One PDF for today's income, invoices, and stock sold.
                                    </p>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={loadTodayInvoices}
                                        disabled={historyLoading}
                                        className="bg-white/10 hover:bg-white/15 disabled:opacity-50 transition rounded-2xl px-4 py-3 font-semibold"
                                    >
                                        {historyLoading ? "Loading..." : "Refresh"}
                                    </button>
                                    <button
                                        onClick={downloadDailyReportPDF}
                                        disabled={historyLoading}
                                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition rounded-2xl px-4 py-3 font-semibold"
                                    >
                                        {historyLoading ? "Generating..." : "Download Daily PDF"}
                                    </button>
                                </div>
                            </div>

                            {todayInvoices.length === 0 ? (
                                <div className="text-white/50 rounded-2xl bg-white/5 border border-white/5 p-4">
                                    No invoices created today.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left border-b border-white/10 text-white/70">
                                                <th className="py-3 pr-4">Invoice</th>
                                                <th className="py-3 pr-4">Time</th>
                                                <th className="py-3 pr-4">Items</th>
                                                <th className="py-3 pr-4">Total</th>
                                                <th className="py-3 pr-4">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {todayInvoices.map((inv) => (
                                                <tr key={inv.id} className="border-b border-white/5">
                                                    <td className="py-3 pr-4">{inv.invoice_code}</td>
                                                    <td className="py-3 pr-4">{formatIST(inv.created_at)}</td>
                                                    <td className="py-3 pr-4">{inv.total_items || 0}</td>
                                                    <td className="py-3 pr-4">₹{money(inv.final_amount)}</td>
                                                    <td className="py-3 pr-4">
                                                        {inv.isReturnedToday ? (
                                                            <span className="font-semibold text-red-300">
                                                                Returned
                                                            </span>
                                                        ) : (
                                                            inv.payment_status
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="xl:col-span-4 space-y-6 xl:sticky xl:top-6 self-start">
                        <div className="bg-[#1d1d2e] rounded-3xl p-5 lg:p-6 shadow-xl border border-white/10">
                            <h2 className="text-2xl font-bold mb-4">Customer Details</h2>

                            <div className="space-y-4">
                                <input
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="Customer name"
                                    className="w-full bg-[#101725] border border-white/10 rounded-2xl px-4 py-3 outline-none text-white placeholder:text-white/40"
                                />
                                <input
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                    placeholder="Phone number"
                                    className="w-full bg-[#101725] border border-white/10 rounded-2xl px-4 py-3 outline-none text-white placeholder:text-white/40"
                                />
                                <input
                                    value={customerEmail}
                                    onChange={(e) => setCustomerEmail(e.target.value)}
                                    placeholder="Email (optional)"
                                    className="w-full bg-[#101725] border border-white/10 rounded-2xl px-4 py-3 outline-none text-white placeholder:text-white/40"
                                />

                                {!settings.auto_invoice ? (
                                    <input
                                        value={manualInvoiceCode}
                                        onChange={(e) => setManualInvoiceCode(e.target.value)}
                                        placeholder="Invoice code"
                                        className="w-full bg-[#101725] border border-white/10 rounded-2xl px-4 py-3 outline-none text-white placeholder:text-white/40"
                                    />
                                ) : null}

                                <div className="grid grid-cols-2 gap-3">
                                    <select
                                        value={paymentMode}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setPaymentMode(value);
                                            if (value === "Credit") setMarkAsPaid(false);
                                        }}
                                        className="bg-[#101725] border border-white/10 rounded-2xl px-4 py-3 outline-none text-white"
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI</option>
                                        <option value="Card">Card</option>
                                        <option value="Cash & UPI">Cash & UPI</option>
                                        <option value="Card & UPI">Card & UPI</option>
                                        <option value="Card & Cash">Card & Cash</option>
                                        {settings.credit_billing ? <option value="Credit">Credit</option> : null}
                                    </select>

                                    <select
                                        value={billDiscountType}
                                        onChange={(e) => setBillDiscountType(e.target.value)}
                                        className="bg-[#101725] border border-white/10 rounded-2xl px-4 py-3 outline-none text-white"
                                    >
                                        <option value="amount">₹ Discount</option>
                                        <option value="percent">% Discount</option>
                                    </select>
                                </div>

                                <input
                                    type="number"
                                    value={billDiscountValue}
                                    onChange={(e) => setBillDiscountValue(e.target.value)}
                                    placeholder={
                                        billDiscountType === "amount"
                                            ? "Bill discount amount"
                                            : "Bill discount percent"
                                    }
                                    className="w-full bg-[#101725] border border-white/10 rounded-2xl px-4 py-3 outline-none text-white placeholder:text-white/40"
                                />

                                <label className="flex items-center gap-3 text-sm text-white/80 bg-white/5 rounded-2xl px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={markAsPaid}
                                        onChange={(e) => setMarkAsPaid(e.target.checked)}
                                        disabled={paymentMode === "Credit"}
                                        className="h-4 w-4"
                                    />
                                    Mark as Paid
                                </label>
                            </div>
                        </div>

                        <div className="bg-[#1d1d2e] rounded-3xl p-5 lg:p-6 shadow-xl border border-white/10">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-2xl font-bold">Cart</h2>
                                <span className="text-white/50 text-sm">{cart.length} items</span>
                            </div>

                            {cart.length === 0 ? (
                                <div className="text-white/50 py-12 text-center rounded-2xl bg-white/5 border border-white/5">
                                    No products added yet.
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                                    {cart.map((item) => {
                                        const isLowStock = Number(item.stock || 0) <= lowStockThreshold;
                                        const lineGross = getLineGross(item);
                                        const lineDiscount = getLineDiscountAmount(item);
                                        const lineNet = getLineNet(item);

                                        return (
                                            <div
                                                key={item.id}
                                                className="rounded-2xl bg-white/5 p-4 border border-white/5"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="font-semibold">{item.product_name}</div>
                                                        <div className="text-sm text-white/50">
                                                            {item.barcode} • {item.brand} • {item.size || "-"}
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => removeFromCart(item.id)}
                                                        className="text-red-300 hover:text-red-200 text-sm"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>

                                                <div className="mt-4 flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => updateCartQty(item.id, item.quantity - 1)}
                                                            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/15"
                                                        >
                                                            -
                                                        </button>

                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={item.stock}
                                                            value={item.quantity}
                                                            onChange={(e) => updateCartQty(item.id, e.target.value)}
                                                            className="w-20 bg-[#101725] border border-white/10 rounded-xl px-3 py-2 text-center outline-none"
                                                        />

                                                        <button
                                                            onClick={() => updateCartQty(item.id, item.quantity + 1)}
                                                            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/15"
                                                        >
                                                            +
                                                        </button>
                                                    </div>

                                                    <div className="text-right">
                                                        <div
                                                            className={`text-sm ${isLowStock ? "text-red-300" : "text-white/50"
                                                                }`}
                                                        >
                                                            Stock: {item.stock}
                                                        </div>
                                                        <div className="font-semibold">₹{money(lineNet)}</div>
                                                    </div>
                                                </div>

                                                <div className="mt-4 grid grid-cols-2 gap-3">
                                                    <select
                                                        value={item.discountType}
                                                        onChange={(e) =>
                                                            updateCartDiscount(
                                                                item.id,
                                                                "discountType",
                                                                e.target.value
                                                            )
                                                        }
                                                        className="bg-[#101725] border border-white/10 rounded-xl px-3 py-2 outline-none text-white text-sm"
                                                    >
                                                        <option value="amount">₹ Discount</option>
                                                        <option value="percent">% Discount</option>
                                                    </select>

                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.discountValue}
                                                        onChange={(e) =>
                                                            updateCartDiscount(
                                                                item.id,
                                                                "discountValue",
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder="Discount"
                                                        className="bg-[#101725] border border-white/10 rounded-xl px-3 py-2 outline-none text-white text-sm"
                                                    />
                                                </div>

                                                <div className="mt-3 text-xs text-white/55 flex justify-between gap-2">
                                                    <span>MRP: ₹{money(item.mrp)}</span>
                                                    <span>Gross: ₹{money(lineGross)}</span>
                                                    <span>Discount: ₹{money(lineDiscount)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="bg-[#1d1d2e] rounded-3xl p-5 lg:p-6 shadow-xl border border-white/10">
                            <h2 className="text-2xl font-bold mb-4">Bill Summary</h2>

                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-white/60">Items Total</span>
                                    <span>₹{money(itemsGrossTotal)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white/60">Item Discounts</span>
                                    <span>- ₹{money(itemDiscountTotal)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white/60">Bill Discount</span>
                                    <span>- ₹{money(billDiscountAmount)}</span>
                                </div>
                                <div className="flex justify-between text-lg font-bold pt-2 border-t border-white/10">
                                    <span>Grand Total</span>
                                    <span>₹{money(finalTotal)}</span>
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateBill}
                                disabled={saving || cart.length === 0}
                                className="w-full mt-5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition rounded-2xl py-3 font-semibold"
                            >
                                {saving ? "Saving..." : "Generate & Save Bill"}
                            </button>

                            <button
                                onClick={undoLastInvoice}
                                disabled={saving || !lastInvoice}
                                className="w-full mt-3 bg-white/10 hover:bg-white/15 disabled:opacity-50 transition rounded-2xl py-3 font-semibold"
                            >
                                Undo Last Invoice
                            </button>

                            <button
                                onClick={clearBill}
                                className="w-full mt-3 bg-white/10 hover:bg-white/15 transition rounded-2xl py-3 font-semibold"
                            >
                                Clear Bill
                            </button>

                            {successInvoice ? (
                                <div className="mt-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm">
                                    <div className="font-bold text-emerald-300">
                                        Invoice saved successfully
                                    </div>
                                    <div className="mt-2 text-white/80">
                                        {successInvoice.invoiceCode}
                                    </div>
                                    <div className="mt-1 text-white/70">
                                        Total: ₹{money(successInvoice.finalTotal)}
                                    </div>
                                    <div className="mt-1 text-white/70">
                                        Status: {successInvoice.paymentStatus}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            {printInvoice ? (
                <div id="thermal-bill" style={{ position: "absolute", left: "-9999px", top: 0 }}>
                    <div style={{ textAlign: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: 18, fontWeight: "bold" }}>SVS TRADERS</div>
                        <div style={{ fontSize: 12 }}>2Dudes Bevdass</div>
                        <div style={{ fontSize: 11, marginTop: 2 }}>Thank You For Shopping</div>
                    </div>

                    <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

                    <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                        <div><strong>Invoice:</strong> {printInvoice.invoiceCode}</div>
                        <div><strong>Date:</strong> {printInvoice.invoiceDate}</div>
                        <div><strong>Customer:</strong> {printInvoice.customerName || "Walk-in"}</div>
                    </div>

                    <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

                    <div style={{ fontSize: 11 }}>
                        {printInvoice.items.map((item, index) => {
                            const lineGross = getLineGross(item);
                            const lineDiscount = getLineDiscountAmount(item);
                            const lineNet = getLineNet(item);

                            const discountText =
                                Number(item.discountValue || 0) > 0
                                    ? item.discountType === "percent"
                                        ? `${Number(item.discountValue)}% Off`
                                        : `₹${money(item.discountValue)} Off`
                                    : "No Discount";

                            return (
                                <div key={`${item.id}-${index}`} style={{ marginBottom: 8 }}>
                                    <div style={{ fontWeight: "bold" }}>
                                        {index + 1}x {item.product_name}
                                    </div>
                                    <div>Qty: {item.quantity}</div>
                                    <div>MRP: ₹{money(item.mrp)}</div>
                                    <div>Gross: ₹{money(lineGross)}</div>
                                    <div>Discount: {discountText}</div>
                                    <div>Line Discount: ₹{money(lineDiscount)}</div>
                                    <div>Final: ₹{money(lineNet)}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

                    <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                        <div><strong>Items Total:</strong> ₹{money(printInvoice.itemsGrossTotal)}</div>
                        <div><strong>Total Discount:</strong> ₹{money(printInvoice.itemDiscountTotal + printInvoice.billDiscountAmount)}</div>
                        <div><strong>Final Amount Paid:</strong> ₹{money(printInvoice.finalTotal)}</div>
                        <div><strong>Payment Mode:</strong> {printInvoice.paymentMode}</div>
                        <div><strong>Status:</strong> {printInvoice.paymentStatus}</div>
                    </div>

                    <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

                    <div style={{ textAlign: "center", fontSize: 11 }}>
                        Thank You 😊<br />
                        Visit Again
                    </div>
                </div>
            ) : null}
        </div>
    );
}