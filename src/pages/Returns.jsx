import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../context/ThemeContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const RETURN_WINDOW_DAYS = 7;

function money(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "").trim();
}

function parseDbDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;

    const raw = String(value).trim();
    if (!raw) return null;

    if (/[zZ]$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) {
        return new Date(raw.replace(" ", "T"));
    }

    const normalized = raw.includes("T") ? `${raw}Z` : `${raw.replace(" ", "T")}Z`;
    return new Date(normalized);
}

function formatDateTime(value) {
    const d = parseDbDate(value);
    if (!d || Number.isNaN(d.getTime())) return "-";

    return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
}

function formatDateOnly(value) {
    const d = parseDbDate(value);
    if (!d || Number.isNaN(d.getTime())) return "-";

    return d.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
    });
}

function addDays(dateValue, days) {
    const d = new Date(dateValue);
    d.setDate(d.getDate() + days);
    return d;
}

function groupInvoiceItems(rows = []) {
    const map = new Map();

    rows.forEach((row) => {
        const key = `${row.product_id || "-"}|${row.barcode || "-"}`;
        const existing = map.get(key) || {
            key,
            product_id: row.product_id || null,
            barcode: row.barcode || "-",
            product_name: row.product_name || "-",
            brand: row.brand || "-",
            sold_qty: 0,
            price: Number(row.price || 0),
            subtotal: 0,
        };

        const qty = Number(row.quantity || 0);
        const price = Number(row.price || 0);
        const subtotal = Number(row.subtotal || price * qty);

        existing.sold_qty += qty;
        existing.price = price || existing.price;
        existing.subtotal += subtotal;

        map.set(key, existing);
    });

    return [...map.values()];
}

function buildWhatsappLink(phone, text) {
    const digits = normalizePhone(phone);
    if (!digits) return null;

    const normalized = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

function buildProductLabel(product) {
    if (!product) return "Product";
    return product.product_code || product.style_code || "Product";
}

export default function Returns() {
    const { settings } = useTheme();

    const [invoiceCodeInput, setInvoiceCodeInput] = useState("");
    const [loadingInvoice, setLoadingInvoice] = useState(false);
    const [invoiceMessage, setInvoiceMessage] = useState("");

    const [invoiceMeta, setInvoiceMeta] = useState(null);
    const [invoiceItems, setInvoiceItems] = useState([]);

    const [statusType, setStatusType] = useState("Accepted");
    const [reasonType, setReasonType] = useState("Damaged");
    const [customReason, setCustomReason] = useState("");
    const [addToInventory, setAddToInventory] = useState(
        Boolean(settings.auto_restore_return_stock ?? true)
    );

    const [replacementSearchQuery, setReplacementSearchQuery] = useState("");
    const [replacementSearchResults, setReplacementSearchResults] = useState([]);
    const [replacementSearching, setReplacementSearching] = useState(false);
    const [selectedReplacementProduct, setSelectedReplacementProduct] = useState(null);
    const [replacementQuantity, setReplacementQuantity] = useState(1);

    const [processing, setProcessing] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [returnHistory, setReturnHistory] = useState([]);

    useEffect(() => {
        if (statusType === "Replacement") {
            setAddToInventory(true);
        } else {
            setAddToInventory(Boolean(settings.auto_restore_return_stock ?? true));
        }
    }, [statusType, settings.auto_restore_return_stock]);

    useEffect(() => {
        if (statusType !== "Replacement") {
            setReplacementSearchQuery("");
            setReplacementSearchResults([]);
            setSelectedReplacementProduct(null);
            setReplacementQuantity(1);
        }
    }, [statusType]);

    useEffect(() => {
        setAddToInventory(Boolean(settings.auto_restore_return_stock ?? true));
    }, [settings.auto_restore_return_stock]);

    const selectedRefundTotal = useMemo(() => {
        if (statusType !== "Accepted") return 0;

        return invoiceItems.reduce((sum, item) => {
            const qty = Number(item.return_qty || 0);
            return sum + qty * Number(item.price || 0);
        }, 0);
    }, [invoiceItems, statusType]);

    const selectedQtyTotal = useMemo(() => {
        return invoiceItems.reduce((sum, item) => sum + Number(item.return_qty || 0), 0);
    }, [invoiceItems]);

    const replacementTotal = useMemo(() => {
        if (statusType !== "Replacement" || !selectedReplacementProduct) return 0;
        return Number(replacementQuantity || 0) * Number(selectedReplacementProduct.mrp || 0);
    }, [statusType, selectedReplacementProduct, replacementQuantity]);

    const returnAllowed = useMemo(() => {
        if (!invoiceMeta?.invoice?.created_at) return false;
        const createdAt = parseDbDate(invoiceMeta.invoice.created_at);
        if (!createdAt || Number.isNaN(createdAt.getTime())) return false;

        const limit = addDays(createdAt, RETURN_WINDOW_DAYS);
        return Date.now() <= limit.getTime();
    }, [invoiceMeta]);

    const returnLimitDate = useMemo(() => {
        if (!invoiceMeta?.invoice?.created_at) return null;
        const createdAt = parseDbDate(invoiceMeta.invoice.created_at);
        if (!createdAt || Number.isNaN(createdAt.getTime())) return null;
        return addDays(createdAt, RETURN_WINDOW_DAYS);
    }, [invoiceMeta]);

    const resetLoadedInvoice = () => {
        setInvoiceMeta(null);
        setInvoiceItems([]);
        setStatusType("Accepted");
        setReasonType("Damaged");
        setCustomReason("");
        setAddToInventory(Boolean(settings.auto_restore_return_stock ?? true));
        setReplacementSearchQuery("");
        setReplacementSearchResults([]);
        setSelectedReplacementProduct(null);
        setReplacementQuantity(1);
        setInvoiceMessage("");
    };

    const loadReturnHistory = async () => {
        setHistoryLoading(true);
        try {
            const { data, error } = await supabase
                .from("returns")
                .select(
                    "id, invoice_code, status, rejection_reason, add_to_inventory, created_at, customer_name, phone_number, barcode, product_name, quantity, refund_amount, reason, invoice_date, processed_by, replacement_type, replacement_barcode, replacement_product_name, replacement_quantity, replacement_done"
                )
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) throw error;
            setReturnHistory(data || []);
        } catch (err) {
            console.error(err);
            setInvoiceMessage(err?.message || "Could not load return history.");
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        loadReturnHistory();
    }, []);

    const updateReturnQty = (key, value) => {
        setInvoiceItems((prev) =>
            prev.map((item) => {
                if (item.key !== key) return item;

                const maxQty = Number(item.remaining_qty || 0);
                const nextValue = Math.min(Math.max(Number(value || 0), 0), maxQty);

                return {
                    ...item,
                    return_qty: nextValue,
                };
            })
        );
    };

    const loadInvoice = async () => {
        const code = invoiceCodeInput.trim();

        if (!code) {
            setInvoiceMessage("Enter an invoice code.");
            return;
        }

        setLoadingInvoice(true);
        setInvoiceMessage("");
        resetLoadedInvoice();

        try {
            const { data: invoice, error: invoiceError } = await supabase
                .from("invoices")
                .select("*")
                .ilike("invoice_code", code)
                .maybeSingle();

            if (invoiceError) throw invoiceError;
            if (!invoice) {
                setInvoiceMessage("Invoice not found.");
                return;
            }

            const { data: customer, error: customerError } = invoice.customer_id
                ? await supabase
                    .from("customers")
                    .select("id, customer_name, phone_number, email")
                    .eq("id", invoice.customer_id)
                    .maybeSingle()
                : { data: null, error: null };

            if (customerError) throw customerError;

            const { data: items, error: itemsError } = await supabase
                .from("invoice_items")
                .select("*")
                .eq("invoice_id", invoice.id)
                .order("id", { ascending: true });

            if (itemsError) throw itemsError;

            const groupedItems = groupInvoiceItems(items || []);

            const processedReturns = groupedItems.length
                ? await supabase
                    .from("returns")
                    .select("barcode, quantity, status")
                    .eq("invoice_code", invoice.invoice_code)
                    .in("status", ["Accepted", "Replacement"])
                : { data: [], error: null };

            if (processedReturns.error) throw processedReturns.error;

            const acceptedMap = new Map();
            (processedReturns.data || []).forEach((row) => {
                const key = String(row.barcode || "-");
                acceptedMap.set(key, (acceptedMap.get(key) || 0) + Number(row.quantity || 0));
            });

            const mappedItems = groupedItems
                .map((item) => {
                    const returnedQty = Number(acceptedMap.get(String(item.barcode || "-")) || 0);
                    const remainingQty = Math.max(Number(item.sold_qty || 0) - returnedQty, 0);

                    return {
                        ...item,
                        returned_qty: returnedQty,
                        remaining_qty: remainingQty,
                        return_qty: 0,
                    };
                })
                .filter((item) => Number(item.remaining_qty || 0) > 0);

            const invoiceDate = invoice.created_at ? parseDbDate(invoice.created_at) : null;
            const limitDate = invoiceDate ? addDays(invoiceDate, RETURN_WINDOW_DAYS) : null;

            setInvoiceMeta({
                invoice,
                customer,
                invoiceDate,
                limitDate,
                allowed: invoiceDate ? Date.now() <= limitDate.getTime() : false,
            });

            setInvoiceItems(mappedItems);
            setInvoiceMessage("Invoice loaded. Select quantities and process the return.");
        } catch (err) {
            console.error(err);
            setInvoiceMessage(err?.message || "Could not load invoice.");
            setInvoiceMeta(null);
            setInvoiceItems([]);
        } finally {
            setLoadingInvoice(false);
        }
    };

    const buildReason = () => {
        if (reasonType === "Other") {
            return customReason.trim();
        }
        return reasonType.trim();
    };

    const searchReplacementProducts = async (query) => {
        const q = String(query || "").trim();

        if (!q) {
            setReplacementSearchResults([]);
            return;
        }

        setReplacementSearching(true);
        try {
            const { data, error } = await supabase
                .from("products")
                .select("id, barcode, date, style_code, size, product_code, quantity, mrp, brand")
                .or(`barcode.ilike.%${q}%,product_code.ilike.%${q}%,style_code.ilike.%${q}%`)
                .order("created_at", { ascending: false })
                .limit(12);

            if (error) throw error;

            setReplacementSearchResults((data || []).map((p) => ({
                ...p,
                product_name: buildProductLabel(p),
            })));
        } catch (err) {
            console.error(err);
            setInvoiceMessage(err?.message || "Could not search replacement products.");
            setReplacementSearchResults([]);
        } finally {
            setReplacementSearching(false);
        }
    };

    useEffect(() => {
        if (statusType !== "Replacement") return;

        const q = replacementSearchQuery.trim();
        if (!q) {
            setReplacementSearchResults([]);
            return;
        }

        const timer = setTimeout(() => {
            searchReplacementProducts(q);
        }, 250);

        return () => clearTimeout(timer);
    }, [replacementSearchQuery, statusType]);

    const selectReplacementProduct = (product) => {
        setSelectedReplacementProduct({
            ...product,
            product_name: buildProductLabel(product),
        });
        setReplacementQuantity(1);
    };

    const removeReplacementSelection = () => {
        setSelectedReplacementProduct(null);
        setReplacementQuantity(1);
    };

    const applyStockDelta = async (productId, delta, fallbackData = null) => {
        if (!productId || !delta) return null;

        const { data: product, error: fetchError } = await supabase
            .from("products")
            .select("id, barcode, date, style_code, size, product_code, quantity, mrp, brand")
            .eq("id", productId)
            .maybeSingle();

        if (fetchError) throw fetchError;

        if (product) {
            const nextQty = Number(product.quantity || 0) + Number(delta || 0);

            if (nextQty <= 0) {
                const { error } = await supabase.from("products").delete().eq("id", productId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("products")
                    .update({ quantity: nextQty })
                    .eq("id", productId);

                if (error) throw error;
            }

            return { ...product, quantity: Math.max(nextQty, 0) };
        }

        if (delta > 0 && fallbackData) {
            const { data: inserted, error: insertError } = await supabase
                .from("products")
                .insert([
                    {
                        id: productId,
                        barcode: fallbackData.barcode || "",
                        date: fallbackData.date || "",
                        style_code: fallbackData.style_code || "",
                        size: fallbackData.size || "",
                        product_code: fallbackData.product_code || "Product",
                        quantity: delta,
                        mrp: Number(fallbackData.mrp || 0),
                        brand: fallbackData.brand || "",
                    },
                ])
                .select("*")
                .single();

            if (insertError) throw insertError;
            return inserted;
        }

        return null;
    };

    const restoreInvoiceItemsAfterReplacement = async ({
        invoiceId,
        originalItems,
        selectedRows,
        replacementProduct,
        replacementQty,
        invoiceSnapshot,
    }) => {
        const returnQtyByKey = new Map(
            selectedRows.map((row) => [row.key, Number(row.return_qty || 0)])
        );

        const adjustedItems = originalItems
            .map((item) => {
                const returnQty = Number(returnQtyByKey.get(item.key) || 0);
                const remainingQty = Math.max(Number(item.sold_qty || 0) - returnQty, 0);

                return {
                    ...item,
                    quantity: remainingQty,
                    subtotal: remainingQty * Number(item.price || 0),
                };
            })
            .filter((item) => Number(item.quantity || 0) > 0);

        if (replacementProduct && Number(replacementQty || 0) > 0) {
            const replacementBarcode = String(replacementProduct.barcode || "-");
            const existingIndex = adjustedItems.findIndex(
                (item) =>
                    String(item.barcode || "-") === replacementBarcode ||
                    Number(item.product_id || 0) === Number(replacementProduct.id || 0)
            );

            if (existingIndex >= 0) {
                adjustedItems[existingIndex].quantity += Number(replacementQty || 0);
                adjustedItems[existingIndex].subtotal =
                    Number(adjustedItems[existingIndex].quantity || 0) *
                    Number(adjustedItems[existingIndex].price || 0);
            } else {
                adjustedItems.push({
                    key: `replacement-${replacementProduct.id}`,
                    product_id: replacementProduct.id,
                    barcode: replacementProduct.barcode || "-",
                    product_name: buildProductLabel(replacementProduct),
                    brand: replacementProduct.brand || "-",
                    sold_qty: Number(replacementQty || 0),
                    quantity: Number(replacementQty || 0),
                    price: Number(replacementProduct.mrp || 0),
                    subtotal: Number(replacementQty || 0) * Number(replacementProduct.mrp || 0),
                });
            }
        }

        const subtotal = adjustedItems.reduce(
            (sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0),
            0
        );

        const totalItems = adjustedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const finalAmount = Math.max(
            subtotal - Number(invoiceSnapshot.discount_amount || 0),
            0
        );

        const { error: deleteItemsError } = await supabase
            .from("invoice_items")
            .delete()
            .eq("invoice_id", invoiceId);

        if (deleteItemsError) throw deleteItemsError;

        if (adjustedItems.length > 0) {
            const insertPayload = adjustedItems.map((item) => ({
                invoice_id: invoiceId,
                product_id: item.product_id || null,
                quantity: Number(item.quantity || 0),
                price: Number(item.price || 0),
                subtotal: Number(item.quantity || 0) * Number(item.price || 0),
                barcode: item.barcode || "-",
                product_name: item.product_name || "-",
                brand: item.brand || "-",
            }));

            const { error: insertItemsError } = await supabase
                .from("invoice_items")
                .insert(insertPayload);

            if (insertItemsError) throw insertItemsError;
        }

        const { error: invoiceUpdateError } = await supabase
            .from("invoices")
            .update({
                subtotal,
                final_amount: finalAmount,
                total_items: totalItems,
            })
            .eq("id", invoiceId);

        if (invoiceUpdateError) throw invoiceUpdateError;

        return { subtotal, finalAmount, totalItems };
    };

    const processReturn = async () => {
        if (!invoiceMeta?.invoice) {
            setInvoiceMessage("Load an invoice first.");
            return;
        }

        if (!returnAllowed) {
            setInvoiceMessage("Return window has expired for this invoice.");
            return;
        }

        const selectedRows = invoiceItems.filter((item) => Number(item.return_qty || 0) > 0);

        if (!selectedRows.length) {
            setInvoiceMessage("Enter at least one return quantity.");
            return;
        }

        const finalReason = buildReason();
        if (!finalReason) {
            setInvoiceMessage("Please select or enter a reason.");
            return;
        }

        const isReplacement = statusType === "Replacement";
        const selectedReplacementQty = Number(replacementQuantity || 0);

        if (isReplacement) {
            if (!selectedReplacementProduct) {
                setInvoiceMessage("Please select a replacement product.");
                return;
            }

            if (selectedReplacementQty <= 0) {
                setInvoiceMessage("Enter a valid replacement quantity.");
                return;
            }

            if (selectedReplacementQty > Number(selectedReplacementProduct.quantity || 0)) {
                setInvoiceMessage("Not enough stock available for the replacement product.");
                return;
            }
        }

        setProcessing(true);
        setInvoiceMessage("");

        const processedReturnIds = [];
        const stockOps = [];
        const customerName = invoiceMeta.customer?.customer_name || "Customer";
        const phone = invoiceMeta.customer?.phone_number || "";
        const processedBy = settings.business_name || "SVS TRADERS";
        const invoiceDateValue = invoiceMeta.invoice.created_at;
        const invoiceSnapshot = { ...invoiceMeta.invoice };
        const originalItemsSnapshot = invoiceItems.map((item) => ({ ...item }));

        try {
            for (const item of selectedRows) {
                const qty = Number(item.return_qty || 0);
                const refundAmount = statusType === "Accepted" ? qty * Number(item.price || 0) : 0;

                if (qty > Number(item.remaining_qty || 0)) {
                    throw new Error(
                        `Return quantity for ${item.product_name} exceeds remaining quantity.`
                    );
                }

                const payload = {
                    invoice_code: invoiceMeta.invoice.invoice_code,
                    status: statusType,
                    rejection_reason: statusType === "Rejected" ? finalReason : null,
                    add_to_inventory: statusType === "Accepted" || statusType === "Replacement",
                    customer_name: customerName,
                    phone_number: phone || null,
                    barcode: item.barcode,
                    product_name: item.product_name,
                    quantity: qty,
                    refund_amount: refundAmount,
                    reason: finalReason,
                    invoice_date: invoiceDateValue,
                    processed_by: processedBy,
                    replacement_type: isReplacement ? "Replacement" : null,
                    replacement_barcode: isReplacement ? selectedReplacementProduct.barcode : null,
                    replacement_product_name: isReplacement
                        ? buildProductLabel(selectedReplacementProduct)
                        : null,
                    replacement_product_id: isReplacement ? selectedReplacementProduct.id : null,
                    replacement_quantity: isReplacement ? selectedReplacementQty : 0,
                    replacement_done: isReplacement,
                };

                const { data: insertedReturn, error: insertError } = await supabase
                    .from("returns")
                    .insert([payload])
                    .select("*")
                    .single();

                if (insertError) throw insertError;

                processedReturnIds.push(insertedReturn.id);

                const restoredProduct = await applyStockDelta(
                    item.product_id,
                    qty,
                    {
                        barcode: item.barcode || "",
                        date: "",
                        style_code: "",
                        size: "",
                        product_code: item.product_name || "Product",
                        mrp: item.price || 0,
                        brand: item.brand || "",
                    }
                );

                stockOps.push({
                    productId: restoredProduct?.id || item.product_id,
                    delta: qty,
                    fallbackData: {
                        barcode: item.barcode || "",
                        date: "",
                        style_code: "",
                        size: "",
                        product_code: item.product_name || "Product",
                        mrp: item.price || 0,
                        brand: item.brand || "",
                    },
                });
            }

            if (isReplacement) {
                const replacementProduct = await applyStockDelta(
                    selectedReplacementProduct.id,
                    -selectedReplacementQty,
                    null
                );

                stockOps.push({
                    productId: replacementProduct?.id || selectedReplacementProduct.id,
                    delta: -selectedReplacementQty,
                    fallbackData: {
                        barcode: selectedReplacementProduct.barcode || "",
                        date: selectedReplacementProduct.date || "",
                        style_code: selectedReplacementProduct.style_code || "",
                        size: selectedReplacementProduct.size || "",
                        product_code: buildProductLabel(selectedReplacementProduct),
                        mrp: selectedReplacementProduct.mrp || 0,
                        brand: selectedReplacementProduct.brand || "",
                    },
                });

                await restoreInvoiceItemsAfterReplacement({
                    invoiceId: invoiceMeta.invoice.id,
                    originalItems: originalItemsSnapshot,
                    selectedRows,
                    replacementProduct: selectedReplacementProduct,
                    replacementQty: selectedReplacementQty,
                    invoiceSnapshot,
                });
            }

            const returnedSummary = selectedRows
                .map((item) => {
                    const qty = Number(item.return_qty || 0);
                    const amount = qty * Number(item.price || 0);
                    return `${item.product_name} x ${qty} = ₹${money(amount)}`;
                })
                .join("\n");

            let body = "";

            if (statusType === "Accepted") {
                body = `Hello ${customerName},

Your return for invoice ${invoiceMeta.invoice.invoice_code} has been accepted.

${returnedSummary}

Refund: ₹${money(selectedRefundTotal)}
Reason: ${finalReason}

Thank you.`;
            } else if (statusType === "Replacement") {
                body = `Hello ${customerName},

Your replacement for invoice ${invoiceMeta.invoice.invoice_code} has been completed.

Returned Items:
${returnedSummary}

Replacement Item:
${buildProductLabel(selectedReplacementProduct)} x ${selectedReplacementQty}
Barcode: ${selectedReplacementProduct.barcode || "-"}

Reason: ${finalReason}

Thank you for shopping with ${settings.business_name || "SVS TRADERS"} 😊`;
            } else {
                body = `Hello ${customerName},

Your return for invoice ${invoiceMeta.invoice.invoice_code} has been rejected.

Reason: ${finalReason}

Please contact the store if you need help.`;
            }

            if (settings.whatsapp_receipt && phone) {
                const waLink = buildWhatsappLink(phone, body);
                if (waLink) {
                    window.open(waLink, "_blank", "noopener,noreferrer");
                }
            }

            await loadReturnHistory();
            setInvoiceMessage(
                statusType === "Accepted"
                    ? "Return accepted successfully. Stock updated and customer notified."
                    : statusType === "Replacement"
                        ? "Replacement completed successfully. Invoice updated and customer notified."
                        : "Return rejected successfully. Customer notified."
            );

            resetLoadedInvoice();
            setInvoiceCodeInput("");
        } catch (err) {
            console.error(err);

            try {
                if (processedReturnIds.length) {
                    await supabase.from("returns").delete().in("id", processedReturnIds);
                }

                for (const op of stockOps.reverse()) {
                    const inverseDelta = -Number(op.delta || 0);
                    const { data: product, error: productError } = await supabase
                        .from("products")
                        .select("id, barcode, date, style_code, size, product_code, quantity, mrp, brand")
                        .eq("id", op.productId)
                        .maybeSingle();

                    if (productError) throw productError;

                    if (product) {
                        const nextQty = Number(product.quantity || 0) + inverseDelta;

                        if (nextQty <= 0) {
                            const { error: deleteError } = await supabase
                                .from("products")
                                .delete()
                                .eq("id", op.productId);

                            if (deleteError) throw deleteError;
                        } else {
                            const { error: updateError } = await supabase
                                .from("products")
                                .update({ quantity: nextQty })
                                .eq("id", op.productId);

                            if (updateError) throw updateError;
                        }
                    } else if (inverseDelta > 0 && op.fallbackData) {
                        const { error: insertError } = await supabase.from("products").insert([
                            {
                                id: op.productId,
                                barcode: op.fallbackData.barcode || "",
                                date: op.fallbackData.date || "",
                                style_code: op.fallbackData.style_code || "",
                                size: op.fallbackData.size || "",
                                product_code: op.fallbackData.product_code || "Product",
                                quantity: inverseDelta,
                                mrp: Number(op.fallbackData.mrp || 0),
                                brand: op.fallbackData.brand || "",
                            },
                        ]);

                        if (insertError) throw insertError;
                    }
                }

                if (statusType === "Replacement") {
                    const { error: deleteItemsError } = await supabase
                        .from("invoice_items")
                        .delete()
                        .eq("invoice_id", invoiceSnapshot.id);

                    if (deleteItemsError) throw deleteItemsError;

                    const restoreItemsPayload = originalItemsSnapshot.map((item) => ({
                        invoice_id: invoiceSnapshot.id,
                        product_id: item.product_id || null,
                        quantity: Number(item.sold_qty || 0),
                        price: Number(item.price || 0),
                        subtotal: Number(item.sold_qty || 0) * Number(item.price || 0),
                        barcode: item.barcode || "-",
                        product_name: item.product_name || "-",
                        brand: item.brand || "-",
                    }));

                    if (restoreItemsPayload.length > 0) {
                        const { error: restoreItemsError } = await supabase
                            .from("invoice_items")
                            .insert(restoreItemsPayload);

                        if (restoreItemsError) throw restoreItemsError;
                    }

                    const restoreSubtotal = originalItemsSnapshot.reduce(
                        (sum, item) => sum + Number(item.sold_qty || 0) * Number(item.price || 0),
                        0
                    );

                    const restoreItemsTotal = originalItemsSnapshot.reduce(
                        (sum, item) => sum + Number(item.sold_qty || 0),
                        0
                    );

                    const { error: restoreInvoiceError } = await supabase
                        .from("invoices")
                        .update({
                            subtotal: restoreSubtotal,
                            final_amount: Number(invoiceSnapshot.final_amount || 0),
                            total_items: restoreItemsTotal,
                        })
                        .eq("id", invoiceSnapshot.id);

                    if (restoreInvoiceError) throw restoreInvoiceError;
                }
            } catch (rollbackError) {
                console.error("Rollback failed:", rollbackError);
            }

            setInvoiceMessage(err?.message || "Could not process return.");
        } finally {
            setProcessing(false);
        }
    };

    const downloadReturnHistoryPDF = () => {
        try {
            const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

            doc.setFont("helvetica", "bold");
            doc.setFontSize(18);
            doc.text("SVS TRADERS - Return History", 14, 16);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(
                `Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
                14,
                23
            );
            doc.text(`Records: ${returnHistory.length}`, 14, 29);

            autoTable(doc, {
                startY: 36,
                head: [
                    [
                        "Date",
                        "Invoice",
                        "Customer",
                        "Product",
                        "Barcode",
                        "Qty",
                        "Refund",
                        "Status",
                        "Reason",
                        "Replacement",
                    ],
                ],
                body:
                    returnHistory.length > 0
                        ? returnHistory.map((row) => [
                            row.created_at ? formatDateTime(row.created_at) : "-",
                            row.invoice_code || "-",
                            row.customer_name || "-",
                            row.product_name || "-",
                            row.barcode || "-",
                            row.quantity || 0,
                            `₹${money(row.refund_amount)}`,
                            row.status || "-",
                            row.rejection_reason || row.reason || "-",
                            row.replacement_product_name
                                ? `${row.replacement_product_name} x ${row.replacement_quantity || 0}`
                                : "-",
                        ])
                        : [["-", "-", "-", "-", "-", 0, "₹0.00", "-", "-", "-"]],
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [10, 32, 83], textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [245, 247, 255] },
                margin: { left: 14, right: 14 },
            });

            doc.save(`SVS_Return_History_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err) {
            console.error(err);
            setInvoiceMessage("Failed to generate return history PDF.");
        }
    };

    const renderStatusBadge = (allowed) => {
        if (allowed) {
            return (
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                    Return Allowed
                </span>
            );
        }

        return (
            <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300">
                Return Expired
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-[#061b4d] text-white p-4 lg:p-6">
            <div className="mx-auto max-w-[1600px]">
                <div className="mb-6">
                    <h1 className="text-4xl lg:text-5xl font-bold">Returns</h1>
                    <p className="mt-2 text-white/70">
                        Search an invoice, verify the 7-day return window, process refunds, or do product replacement.
                    </p>
                </div>

                {invoiceMessage ? (
                    <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
                        {invoiceMessage}
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                    <div className="space-y-6 xl:col-span-8">
                        <section className="rounded-3xl border border-white/10 bg-[#1d1d2e] p-5 shadow-xl lg:p-6">
                            <h2 className="text-2xl font-bold">Search Invoice</h2>

                            <div className="mt-4 flex flex-col gap-3 md:flex-row">
                                <input
                                    value={invoiceCodeInput}
                                    onChange={(e) => setInvoiceCodeInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            loadInvoice();
                                        }
                                    }}
                                    placeholder="Enter invoice code"
                                    className="flex-1 rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none placeholder:text-white/40"
                                />
                                <button
                                    type="button"
                                    onClick={loadInvoice}
                                    disabled={loadingInvoice}
                                    className="rounded-2xl px-6 py-3 font-semibold text-white transition disabled:opacity-50"
                                    style={{ backgroundColor: "var(--accent-color, #2563eb)" }}
                                >
                                    {loadingInvoice ? "Loading..." : "Load Invoice"}
                                </button>
                            </div>
                        </section>

                        {invoiceMeta ? (
                            <section className="rounded-3xl border border-white/10 bg-[#1d1d2e] p-5 shadow-xl lg:p-6">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <h2 className="text-2xl font-bold">Invoice Details</h2>
                                        <div className="mt-2 text-white/70">
                                            {invoiceMeta.invoice.invoice_code}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm">
                                        <div>Invoice Date: {formatDateOnly(invoiceMeta.invoiceDate)}</div>
                                        <div className="mt-1">
                                            Return Limit: {formatDateOnly(invoiceMeta.limitDate)}
                                        </div>
                                        <div className="mt-1">Status: {renderStatusBadge(invoiceMeta.allowed)}</div>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-4 md:grid-cols-3">
                                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                        <div className="text-sm text-white/50">Customer</div>
                                        <div className="mt-1 font-semibold">
                                            {invoiceMeta.customer?.customer_name || "-"}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                        <div className="text-sm text-white/50">Phone</div>
                                        <div className="mt-1 font-semibold">
                                            {invoiceMeta.customer?.phone_number || "-"}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                        <div className="text-sm text-white/50">Final Amount</div>
                                        <div className="mt-1 font-semibold">
                                            ₹{money(invoiceMeta.invoice.final_amount)}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-white/10 text-left text-white/70">
                                                <th className="py-3 pr-4">Product</th>
                                                <th className="py-3 pr-4">Barcode</th>
                                                <th className="py-3 pr-4">Sold Qty</th>
                                                <th className="py-3 pr-4">Returned Qty</th>
                                                <th className="py-3 pr-4">Return Qty</th>
                                                <th className="py-3 pr-4">Price</th>
                                                <th className="py-3 pr-4">Refund</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoiceItems.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="py-6 text-center text-white/50">
                                                        No returnable items found for this invoice.
                                                    </td>
                                                </tr>
                                            ) : (
                                                invoiceItems.map((item) => {
                                                    const qty = Number(item.return_qty || 0);
                                                    const refund =
                                                        statusType === "Accepted"
                                                            ? qty * Number(item.price || 0)
                                                            : 0;

                                                    return (
                                                        <tr key={item.key} className="border-b border-white/5">
                                                            <td className="py-3 pr-4 font-medium">
                                                                {item.product_name}
                                                            </td>
                                                            <td className="py-3 pr-4">{item.barcode}</td>
                                                            <td className="py-3 pr-4">{item.sold_qty}</td>
                                                            <td className="py-3 pr-4">{item.returned_qty}</td>
                                                            <td className="py-3 pr-4">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max={item.remaining_qty}
                                                                    value={item.return_qty}
                                                                    onChange={(e) =>
                                                                        updateReturnQty(item.key, e.target.value)
                                                                    }
                                                                    className="w-24 rounded-xl border border-white/10 bg-[#101725] px-3 py-2 text-white outline-none"
                                                                />
                                                            </td>
                                                            <td className="py-3 pr-4">₹{money(item.price)}</td>
                                                            <td className="py-3 pr-4">₹{money(refund)}</td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                        <div className="text-sm text-white/50">Selected Qty</div>
                                        <div className="mt-1 text-2xl font-bold">{selectedQtyTotal}</div>
                                    </div>
                                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                        <div className="text-sm text-white/50">Selected Refund</div>
                                        <div className="mt-1 text-2xl font-bold">
                                            ₹{money(selectedRefundTotal)}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                        <div className="text-sm text-white/50">Action</div>
                                        <div className="mt-1 text-2xl font-bold">{statusType}</div>
                                    </div>
                                </div>

                                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                                    <div>
                                        <label className="mb-2 block text-sm text-white/70">Return Status</label>
                                        <select
                                            value={statusType}
                                            onChange={(e) => setStatusType(e.target.value)}
                                            className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none"
                                        >
                                            <option value="Accepted">Accepted</option>
                                            <option value="Replacement">Replacement</option>
                                            <option value="Rejected">Rejected</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm text-white/70">Reason</label>
                                        <select
                                            value={reasonType}
                                            onChange={(e) => setReasonType(e.target.value)}
                                            className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none"
                                        >
                                            <option value="Damaged">Damaged</option>
                                            <option value="Wrong Size">Wrong Size</option>
                                            <option value="Wrong Item">Wrong Item</option>
                                            <option value="Not Needed">Not Needed</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm text-white/70">Custom Reason</label>
                                        <input
                                            value={customReason}
                                            onChange={(e) => setCustomReason(e.target.value)}
                                            placeholder="Enter custom reason"
                                            className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none placeholder:text-white/40"
                                        />
                                    </div>
                                </div>

                                {statusType === "Replacement" ? (
                                    <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                            <div>
                                                <h3 className="text-xl font-bold">Replacement Product</h3>
                                                <p className="text-sm text-white/50 mt-1">
                                                    Scan barcode or type product code/style code to search inventory.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={removeReplacementSelection}
                                                className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15"
                                            >
                                                Clear Selection
                                            </button>
                                        </div>

                                        <div className="mt-4 flex flex-col gap-3 md:flex-row">
                                            <input
                                                value={replacementSearchQuery}
                                                onChange={(e) => setReplacementSearchQuery(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        searchReplacementProducts(replacementSearchQuery);
                                                    }
                                                }}
                                                placeholder="Scan or type barcode / product code / style code"
                                                className="flex-1 rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none placeholder:text-white/40"
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    searchReplacementProducts(replacementSearchQuery)
                                                }
                                                disabled={replacementSearching}
                                                className="rounded-2xl px-6 py-3 font-semibold text-white transition disabled:opacity-50"
                                                style={{ backgroundColor: "var(--accent-color, #2563eb)" }}
                                            >
                                                {replacementSearching ? "Searching..." : "Search"}
                                            </button>
                                        </div>

                                        {selectedReplacementProduct ? (
                                            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                    <div>
                                                        <div className="font-bold text-lg">
                                                            {buildProductLabel(selectedReplacementProduct)}
                                                        </div>
                                                        <div className="text-sm text-white/70 mt-1">
                                                            Barcode: {selectedReplacementProduct.barcode || "-"}
                                                        </div>
                                                        <div className="text-sm text-white/70 mt-1">
                                                            Brand: {selectedReplacementProduct.brand || "-"}
                                                        </div>
                                                        <div className="text-sm text-white/70 mt-1">
                                                            Stock: {selectedReplacementProduct.quantity || 0}
                                                        </div>
                                                        <div className="text-sm text-white/70 mt-1">
                                                            MRP: ₹{money(selectedReplacementProduct.mrp)}
                                                        </div>
                                                    </div>

                                                    <div className="min-w-[220px]">
                                                        <label className="mb-2 block text-sm text-white/70">
                                                            Replacement Quantity
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={selectedReplacementProduct.quantity || 1}
                                                            value={replacementQuantity}
                                                            onChange={(e) =>
                                                                setReplacementQuantity(e.target.value)
                                                            }
                                                            className="w-full rounded-2xl border border-white/10 bg-[#101725] px-4 py-3 text-white outline-none"
                                                        />
                                                        <div className="mt-2 text-sm text-white/70">
                                                            Replacement Total: ₹{money(replacementTotal)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-4 rounded-2xl border border-white/10 bg-[#101725] p-4 text-white/50">
                                                No replacement product selected yet.
                                            </div>
                                        )}

                                        {replacementSearchResults.length > 0 ? (
                                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                                {replacementSearchResults.map((product) => (
                                                    <div
                                                        key={product.id}
                                                        className="rounded-2xl border border-white/10 bg-[#101725] p-4"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <div className="font-semibold">
                                                                    {buildProductLabel(product)}
                                                                </div>
                                                                <div className="mt-1 text-sm text-white/50">
                                                                    {product.barcode}
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => selectReplacementProduct(product)}
                                                                disabled={Number(product.quantity || 0) <= 0}
                                                                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                                                            >
                                                                Select
                                                            </button>
                                                        </div>

                                                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/70">
                                                            <div>Stock: {product.quantity || 0}</div>
                                                            <div>MRP: ₹{money(product.mrp)}</div>
                                                            <div>Brand: {product.brand || "-"}</div>
                                                            <div>Size: {product.size || "-"}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </section>
                                ) : null}

                                <div className="mt-4">
                                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={addToInventory}
                                            onChange={(e) => setAddToInventory(e.target.checked)}
                                            className="h-4 w-4 accent-emerald-500"
                                            disabled={statusType !== "Accepted"}
                                        />
                                        <span>
                                            Add stock back to inventory
                                            <span className="block text-sm text-white/50">
                                                Used for accepted returns. Replacement always restores the original product.
                                            </span>
                                        </span>
                                    </label>
                                </div>

                                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={processReturn}
                                        disabled={
                                            processing ||
                                            !invoiceMeta.allowed ||
                                            invoiceItems.length === 0
                                        }
                                        className="rounded-2xl px-6 py-3 font-semibold text-white transition disabled:opacity-50"
                                        style={{ backgroundColor: "var(--accent-color, #2563eb)" }}
                                    >
                                        {processing
                                            ? "Processing..."
                                            : statusType === "Accepted"
                                                ? "Process Accepted Return"
                                                : statusType === "Replacement"
                                                    ? "Process Replacement"
                                                    : "Process Rejected Return"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={resetLoadedInvoice}
                                        className="rounded-2xl bg-white/10 px-6 py-3 font-semibold transition hover:bg-white/15"
                                    >
                                        Reset
                                    </button>
                                </div>
                            </section>
                        ) : (
                            <section className="rounded-3xl border border-white/10 bg-[#1d1d2e] p-5 shadow-xl lg:p-6">
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/50">
                                    Load an invoice to start processing returns.
                                </div>
                            </section>
                        )}
                    </div>

                    <div className="space-y-6 xl:col-span-4 xl:sticky xl:top-6 self-start">
                        <section className="rounded-3xl border border-white/10 bg-[#1d1d2e] p-5 shadow-xl lg:p-6">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-2xl font-bold">Return History</h2>
                                <button
                                    type="button"
                                    onClick={loadReturnHistory}
                                    disabled={historyLoading}
                                    className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/15 disabled:opacity-50"
                                >
                                    {historyLoading ? "Refreshing..." : "Refresh"}
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={downloadReturnHistoryPDF}
                                className="mt-4 w-full rounded-2xl px-4 py-3 font-semibold text-white"
                                style={{ backgroundColor: "var(--accent-color, #2563eb)" }}
                            >
                                Download History PDF
                            </button>

                            <div className="mt-5 space-y-3 max-h-[700px] overflow-y-auto pr-1">
                                {returnHistory.length === 0 ? (
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-white/50">
                                        No returns recorded yet.
                                    </div>
                                ) : (
                                    returnHistory.map((row) => {
                                        const badgeClass =
                                            row.status === "Accepted"
                                                ? "bg-emerald-500/15 text-emerald-300"
                                                : row.status === "Replacement"
                                                    ? "bg-blue-500/15 text-blue-300"
                                                    : "bg-red-500/15 text-red-300";

                                        return (
                                            <div
                                                key={row.id}
                                                className="rounded-2xl border border-white/10 bg-white/5 p-4"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="font-semibold">
                                                            {row.product_name || "-"}
                                                        </div>
                                                        <div className="mt-1 text-sm text-white/50">
                                                            Invoice: {row.invoice_code || "-"}
                                                        </div>
                                                    </div>
                                                    <span
                                                        className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}
                                                    >
                                                        {row.status || "-"}
                                                    </span>
                                                </div>

                                                <div className="mt-3 space-y-1 text-sm text-white/80">
                                                    <div>Barcode: {row.barcode || "-"}</div>
                                                    <div>Customer: {row.customer_name || "-"}</div>
                                                    <div>Phone: {row.phone_number || "-"}</div>
                                                    <div>Qty: {row.quantity || 0}</div>
                                                    <div>Refund: ₹{money(row.refund_amount)}</div>
                                                    <div>Reason: {row.rejection_reason || row.reason || "-"}</div>
                                                    {row.replacement_product_name ? (
                                                        <>
                                                            <div>
                                                                Replacement: {row.replacement_product_name || "-"}
                                                            </div>
                                                            <div>
                                                                Replacement Qty: {row.replacement_quantity || 0}
                                                            </div>
                                                            <div>
                                                                Replacement Barcode: {row.replacement_barcode || "-"}
                                                            </div>
                                                        </>
                                                    ) : null}
                                                    <div>Date: {formatDateTime(row.created_at)}</div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </section>

                        <section className="rounded-3xl border border-white/10 bg-[#1d1d2e] p-5 shadow-xl lg:p-6">
                            <h2 className="text-2xl font-bold mb-4">Return Summary</h2>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                    <div className="text-sm text-white/50">Total Records</div>
                                    <div className="mt-1 text-2xl font-bold">{returnHistory.length}</div>
                                </div>
                                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                    <div className="text-sm text-white/50">Accepted</div>
                                    <div className="mt-1 text-2xl font-bold">
                                        {returnHistory.filter((r) => r.status === "Accepted").length}
                                    </div>
                                </div>
                                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                    <div className="text-sm text-white/50">Replacement</div>
                                    <div className="mt-1 text-2xl font-bold">
                                        {returnHistory.filter((r) => r.status === "Replacement").length}
                                    </div>
                                </div>
                                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                    <div className="text-sm text-white/50">Refund</div>
                                    <div className="mt-1 text-2xl font-bold">
                                        ₹{money(
                                            returnHistory.reduce(
                                                (sum, row) => sum + Number(row.refund_amount || 0),
                                                0
                                            )
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}