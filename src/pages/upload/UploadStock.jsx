import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";

export default function UploadStock() {
    const [preview, setPreview] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedBrand, setSelectedBrand] = useState("");

    const normalizeKey = (value) =>
        String(value || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "");

    const convertExcelDate = (excelDate) => {
        if (excelDate === null || excelDate === undefined || excelDate === "")
            return "";

        if (excelDate instanceof Date) {
            return excelDate.toLocaleDateString("en-GB");
        }

        if (!isNaN(excelDate)) {
            const date = XLSX.SSF.parse_date_code(Number(excelDate));
            if (!date) return "";

            const day = String(date.d).padStart(2, "0");
            const month = String(date.m).padStart(2, "0");
            return `${day}/${month}/${date.y}`;
        }

        return String(excelDate).trim();
    };

    const safeNumber = (value) => {
        if (value === null || value === undefined || value === "") return 0;

        if (typeof value === "string") {
            const cleaned = value.replace(/,/g, "").trim();
            return cleaned === "" ? 0 : Number(cleaned) || 0;
        }

        return Number(value) || 0;
    };

    const handleFileUpload = (e, brand) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSelectedBrand(brand);

        const reader = new FileReader();

        reader.onload = async (evt) => {
            try {
                const binaryStr = evt.target.result;

                const workbook = XLSX.read(binaryStr, {
                    type: "array",
                });

                const sheet = workbook.Sheets[workbook.SheetNames[0]];

                const rawData = XLSX.utils.sheet_to_json(sheet, {
                    defval: "",
                });

                const cleanedData = rawData
                    .map((row) => {
                        const keys = Object.keys(row);

                        const findValue = (names) => {
                            const matchKey = keys.find((k) => {
                                const normalizedKey = normalizeKey(k);
                                return names.some((name) =>
                                    normalizedKey.includes(normalizeKey(name))
                                );
                            });

                            return matchKey ? row[matchKey] : "";
                        };

                        const barcode = findValue(["BARCODE"]);
                        const qty = safeNumber(findValue(["QTY", "QUANTITY"]));
                        const mrp = safeNumber(findValue(["MRP"]));

                        return {
                            date: convertExcelDate(
                                findValue(["BILL DATE", "DATE"])
                            ),
                            barcode: barcode?.toString().trim() || "",
                            style_code: findValue([
                                "STYLE NO.",
                                "STYLE NO",
                                "STYLE",
                            ]),
                            size: findValue(["SIZE"]),
                            product_code: findValue([
                                "PRODUCT CODE",
                                "PRODUCTCODE",
                            ]),
                            quantity: qty,
                            mrp,
                            brand,
                        };
                    })
                    .filter(
                        (item) =>
                            item.barcode &&
                            item.barcode !== "0" &&
                            item.mrp > 0
                    );

                setPreview(cleanedData);
            } catch (error) {
                console.error("Excel parsing error:", error);
                alert("Failed to read Excel file");
                setPreview([]);
            }
        };

        reader.onerror = () => {
            alert("Failed to read file");
        };

        reader.readAsArrayBuffer(file);
    };

    const uploadToInventory = async () => {
        if (!preview.length) {
            alert("No data found");
            return;
        }

        setLoading(true);

        try {
            for (const item of preview) {
                console.log("Uploading item:", item);

                const { data: existing, error: fetchError } =
                    await supabase
                        .from("products")
                        .select("*")
                        .eq("barcode", item.barcode)
                        .maybeSingle();

                if (fetchError) {
                    console.error(fetchError);
                    throw fetchError;
                }

                if (existing) {
                    const { error: updateError } =
                        await supabase
                            .from("products")
                            .update({
                                quantity:
                                    Number(existing.quantity || 0) +
                                    Number(item.quantity || 0),

                                mrp: item.mrp,
                                style_code:
                                    item.style_code,
                                product_code:
                                    item.product_code,
                                size: item.size,
                                date: item.date,
                                brand: item.brand,
                            })
                            .eq(
                                "barcode",
                                item.barcode
                            );

                    if (updateError) {
                        console.error(updateError);
                        throw updateError;
                    }
                } else {
                    const { error: insertError } =
                        await supabase
                            .from("products")
                            .insert([
                                {
                                    barcode:
                                        item.barcode,
                                    date: item.date,
                                    style_code:
                                        item.style_code,
                                    size: item.size,
                                    product_code:
                                        item.product_code,
                                    quantity:
                                        item.quantity,
                                    mrp: item.mrp,
                                    brand: item.brand,
                                },
                            ]);

                    if (insertError) {
                        console.error(insertError);
                        throw insertError;
                    }
                }
            }

            alert("Stock Uploaded Successfully!");
            setPreview([]);
        } catch (err) {
            console.error("FULL ERROR:", err);

            alert(
                err.message ||
                "Upload Failed"
            );
        }

        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-[#061b4d] p-8 text-white">
            <h1 className="text-5xl font-bold mb-8">Upload Stock</h1>

            <div className="grid md:grid-cols-2 gap-8 mb-10">
                <div className="bg-[#1d1d2e] p-8 rounded-3xl shadow-2xl border border-white/10 hover:border-blue-500/40 transition-all duration-300 hover:shadow-blue-500/10">
                    <h2 className="text-4xl font-bold mb-3 text-white">
                        Jockey Upload
                    </h2>
                    <p className="text-gray-400 mb-6 text-lg">
                        Upload Jockey Excel sheet
                    </p>

                    <label className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-blue-500/30 rounded-3xl cursor-pointer bg-[#101725] hover:bg-[#16213a] transition-all duration-300 group">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <div className="bg-blue-600 group-hover:bg-blue-500 transition w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-4">
                                <span className="text-3xl">📤</span>
                            </div>
                            <p className="mb-2 text-lg font-semibold text-white">
                                Click to Upload Excel
                            </p>
                            <p className="text-sm text-gray-400">
                                .xlsx or .xls files only
                            </p>
                        </div>

                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => handleFileUpload(e, "Jockey")}
                            className="hidden"
                        />
                    </label>
                </div>

                <div className="bg-[#1d1d2e] p-8 rounded-3xl shadow-2xl border border-white/10 hover:border-green-500/40 transition-all duration-300 hover:shadow-green-500/10">
                    <h2 className="text-4xl font-bold mb-3 text-white">
                        Bevdass Upload
                    </h2>
                    <p className="text-gray-400 mb-6 text-lg">
                        Upload Bevdass Excel sheet
                    </p>

                    <label className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-green-500/30 rounded-3xl cursor-pointer bg-[#101725] hover:bg-[#16213a] transition-all duration-300 group">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <div className="bg-green-600 group-hover:bg-green-500 transition w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-4">
                                <span className="text-3xl">📤</span>
                            </div>
                            <p className="mb-2 text-lg font-semibold text-white">
                                Click to Upload Excel
                            </p>
                            <p className="text-sm text-gray-400">
                                .xlsx or .xls files only
                            </p>
                        </div>

                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => handleFileUpload(e, "Bevdass")}
                            className="hidden"
                        />
                    </label>
                </div>
            </div>

            {preview.length > 0 && (
                <div className="bg-[#1d1d2e] rounded-3xl p-8 shadow-xl border border-gray-700">
                    <div className="flex justify-between items-center mb-6 gap-4">
                        <div>
                            <h2 className="text-4xl font-bold">
                                Preview ({selectedBrand})
                            </h2>
                            <p className="text-gray-400 mt-2">
                                Check the imported rows before confirming upload.
                            </p>
                        </div>

                        <button
                            onClick={uploadToInventory}
                            disabled={loading}
                            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 px-8 py-4 rounded-2xl font-bold text-lg shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Uploading..." : "🚀 Confirm Upload"}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-lg">
                            <thead>
                                <tr className="border-b border-gray-700 text-left">
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Barcode</th>
                                    <th className="p-4">Style No.</th>
                                    <th className="p-4">Size</th>
                                    <th className="p-4">Product Code</th>
                                    <th className="p-4">Qty</th>
                                    <th className="p-4">MRP</th>
                                    <th className="p-4">Brand</th>
                                </tr>
                            </thead>

                            <tbody>
                                {preview.map((item, index) => (
                                    <tr
                                        key={`${item.barcode}-${index}`}
                                        className="border-b border-gray-800 hover:bg-[#2a2a40] transition"
                                    >
                                        <td className="p-4">{item.date}</td>
                                        <td className="p-4">{item.barcode}</td>
                                        <td className="p-4">{item.style_code}</td>
                                        <td className="p-4">{item.size}</td>
                                        <td className="p-4">{item.product_code}</td>
                                        <td className="p-4">{item.quantity}</td>
                                        <td className="p-4">₹{item.mrp}</td>
                                        <td className="p-4">{item.brand}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}