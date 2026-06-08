import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

        const doc = new jsPDF("landscape");
        const currentDate = new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
        });

        doc.setFontSize(18);
        doc.text("SVS TRADERS", 14, 14);

        doc.setFontSize(13);
        doc.text("SVS Inventory Report", 14, 22);

        doc.setFontSize(10);
        doc.text(`Generated on: ${currentDate}`, 14, 28);
        doc.text(`Total Products: ${products.length}`, 14, 34);

        const tableRows = products.map((product) => [
            product.barcode || "",
            product.style_code || "",
            product.product_code || "",
            product.brand || "",
            product.size || "",
            product.quantity ?? "",
            `₹${product.mrp ?? 0}`,
            product.date || "",
        ]);

        autoTable(doc, {
            startY: 40,
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
            theme: "grid",
            styles: {
                fontSize: 8,
                cellPadding: 3,
                valign: "middle",
            },
            headStyles: {
                fillColor: [17, 24, 39],
                textColor: [255, 255, 255],
                halign: "center",
            },
            alternateRowStyles: {
                fillColor: [245, 245, 245],
            },
            margin: { top: 40, left: 8, right: 8 },
        });

        doc.save("svs_inventory.pdf");
    };

    return (
        <div className="p-8 bg-[#09152c] min-h-screen text-white">
            <div className="flex justify-between items-center mb-8 gap-4 flex-wrap">
                <h1 className="text-5xl font-bold">SVS Inventory</h1>

                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Search barcode, style or code..."
                        className="bg-[#2a2a2a] px-5 py-4 rounded-2xl w-80 outline-none"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <button
                        onClick={downloadPDF}
                        disabled={loading || !products.length}
                        className="bg-blue-600 hover:bg-blue-500 px-5 py-3 rounded-2xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Download PDF
                    </button>
                </div>
            </div>

            <div className="bg-[#1f1f24] rounded-3xl overflow-hidden overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-[#2a2a2a]">
                        <tr className="text-left">
                            <th className="p-5">Barcode</th>
                            <th className="p-5">Style Code</th>
                            <th className="p-5">Product Code</th>
                            <th className="p-5">Brand</th>
                            <th className="p-5">Size</th>
                            <th className="p-5">Quantity</th>
                            <th className="p-5">MRP</th>
                            <th className="p-5">Date</th>
                        </tr>
                    </thead>

                    <tbody>
                        {filteredProducts.map((product) => (
                            <tr
                                key={product.id}
                                className="border-t border-gray-800"
                            >
                                <td className="p-5">{product.barcode}</td>
                                <td className="p-5">{product.style_code}</td>
                                <td className="p-5">{product.product_code}</td>
                                <td className="p-5">{product.brand}</td>
                                <td className="p-5">{product.size}</td>
                                <td className="p-5">{product.quantity}</td>
                                <td className="p-5">₹{product.mrp}</td>
                                <td className="p-5">{product.date}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}