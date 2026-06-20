import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { finalizePDF, standardTableOpts } from "../../lib/pdfHelper";

import { Download, Search, RefreshCw } from "lucide-react";

export default function SVSInventory() {
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchProducts();
    }, []);

    async function fetchProducts() {
        setLoading(true);
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .order("id", { ascending: false });

        if (error) {
            console.log(error);
            setLoading(false);
            return;
        }

        setProducts(data || []);
        setLoading(false);
    }

    const filteredProducts = useMemo(() => {
        const query = search.toLowerCase();

        return products.filter((product) => {
            const barcode = product.barcode?.toString().toLowerCase() || "";
            const styleCode = product.style_code?.toLowerCase() || "";
            const productCode = product.product_code?.toLowerCase() || "";
            const brand = product.brand?.toLowerCase() || "";
            const size = product.size?.toLowerCase() || "";

            return (
                barcode.includes(query) ||
                styleCode.includes(query) ||
                productCode.includes(query) ||
                brand.includes(query) ||
                size.includes(query)
            );
        });
    }, [products, search]);

    const downloadPDF = () => {
        if (!products.length) {
            alert("No products available to download");
            return;
        }

        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

        const infoLeft = [
            `Total Products: ${products.length}`,
        ];
        const infoRight = [
            `Report Type: SVS Inventory`,
        ];

        const tableRows = products.map((product) => [
            product.barcode || "",
            product.style_code || "",
            product.product_code || "",
            product.brand || "",
            product.size || "",
            product.quantity ?? "",
            `₹${Number(product.mrp ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            product.date || "",
        ]);

        autoTable(doc, {
            ...standardTableOpts,
            startY: 48,
            head: [[
                "Barcode",
                "Style Code",
                "Product Code",
                "Brand",
                "Size",
                "Quantity",
                "MRP",
                "Date",
            ]],
            body: tableRows,
            columnStyles: {
                0: { halign: "center" }, // Barcode
                1: { halign: "left" }, // Style Code
                2: { halign: "left" }, // Product Code
                3: { halign: "left" }, // Brand
                4: { halign: "center" }, // Size
                5: { halign: "right" }, // Quantity
                6: { halign: "right" }, // MRP
                7: { halign: "center" }, // Date
            }
        });

        finalizePDF(doc, "SVS Inventory Report", infoLeft, infoRight);

        doc.save("svs_inventory.pdf");
    };

    return (
        <div
            className="p-6 text-white min-h-screen"
            style={{ background: "linear-gradient(135deg, #061b4d 0%, #071533 100%)" }}
        >
            {/* Header */}
            <div className="mb-7">
                <h1 className="text-3xl font-bold tracking-tight text-white">
                    SVS Inventory
                </h1>
                <p className="mt-1 text-sm text-white/45 font-medium">
                    {products.length} products · {filteredProducts.length} shown
                </p>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="relative">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search barcode, style, brand or code…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-white/[0.06] border border-white/[0.10] pl-9 pr-4 py-2.5 rounded-xl outline-none text-sm text-white placeholder:text-white/30 w-72 transition-all duration-150"
                    />
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        onClick={fetchProducts}
                        disabled={loading}
                        className="btn-press flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin-smooth" : ""} />
                        Refresh
                    </button>
                    <button
                        onClick={downloadPDF}
                        disabled={loading || !products.length}
                        className="btn-press flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                        style={{
                            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                            boxShadow: products.length ? "0 6px 18px rgba(37,99,235,0.4)" : "none",
                        }}
                    >
                        <Download size={14} />
                        Download PDF
                    </button>
                </div>
            </div>

            {/* Table */}
            <div
                className="rounded-2xl overflow-hidden overflow-x-auto border border-white/[0.08]"
                style={{ background: "linear-gradient(145deg, #0f1e3a 0%, #0a1428 100%)" }}
            >
                {loading ? (
                    <div className="flex items-center justify-center gap-3 py-16 text-white/50">
                        <span className="h-5 w-5 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin-smooth" />
                        <span className="text-sm font-medium">Loading inventory…</span>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr
                                className="text-left border-b border-white/[0.08]"
                                style={{ background: "rgba(255,255,255,0.03)" }}
                            >
                                {["Barcode", "Style Code", "Product Code", "Brand", "Size", "Quantity", "MRP", "Date"].map((h) => (
                                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.map((product, i) => (
                                <tr
                                    key={product.id}
                                    className="table-row-hover border-b border-white/[0.05] last:border-0"
                                    style={i % 2 === 1 ? { background: "rgba(255,255,255,0.015)" } : {}}
                                >
                                    <td className="px-4 py-3 font-mono text-xs text-white/70">{product.barcode}</td>
                                    <td className="px-4 py-3 font-semibold text-white/90">{product.style_code}</td>
                                    <td className="px-4 py-3 text-white/70">{product.product_code}</td>
                                    <td className="px-4 py-3 text-white/60">{product.brand}</td>
                                    <td className="px-4 py-3 text-white/70">{product.size}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center justify-center rounded-lg px-2.5 py-0.5 text-xs font-bold ${
                                            Number(product.quantity) <= 0
                                                ? "bg-red-500/15 text-red-300"
                                                : Number(product.quantity) <= 5
                                                ? "bg-amber-500/15 text-amber-300"
                                                : "bg-emerald-500/15 text-emerald-300"
                                        }`}>
                                            {product.quantity}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-semibold text-white/80">₹{product.mrp}</td>
                                    <td className="px-4 py-3 text-xs text-white/45">{product.date}</td>
                                </tr>
                            ))}
                            {filteredProducts.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-sm text-white/35 font-medium">
                                        No products found matching your search.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}