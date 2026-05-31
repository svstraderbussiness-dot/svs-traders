import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function BevdassInventory() {
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetchProducts();
    }, []);

    async function fetchProducts() {
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("brand", "Bevdass");

        if (error) {
            console.log(error);
            return;
        }

        setProducts(data);
    }

    const filteredProducts = products.filter(
        (product) =>
            product.product_name
                ?.toLowerCase()
                .includes(search.toLowerCase()) ||
            product.barcode
                ?.toString()
                .includes(search)
    );

    return (
        <div className="p-8 text-white min-h-screen bg-[#111827]">

            <div className="flex justify-between items-center mb-8">

                <h1 className="text-4xl font-bold">
                    Bevdass Inventory
                </h1>

                <input
                    type="text"
                    placeholder="Search barcode or product..."
                    value={search}
                    onChange={(e) =>
                        setSearch(e.target.value)
                    }
                    className="bg-zinc-800 border border-zinc-700
          px-4 py-3 rounded-xl outline-none
          w-[320px]"
                />
            </div>

            <div className="bg-zinc-900 rounded-2xl overflow-hidden">

                <table className="w-full">

                    <thead className="bg-zinc-800">

                        <tr className="text-left">
                            <th className="p-4">Barcode</th>
                            <th className="p-4">Product Name</th>
                            <th className="p-4">Size</th>
                            <th className="p-4">Quantity</th>
                            <th className="p-4">MRP</th>
                            <th className="p-4">Selling Price</th>
                        </tr>

                    </thead>

                    <tbody>

                        {filteredProducts.map((product) => (

                            <tr
                                key={product.id}
                                className="border-b border-zinc-800 hover:bg-zinc-800 transition"
                            >
                                <td className="p-4">
                                    {product.barcode}
                                </td>

                                <td className="p-4 font-medium">
                                    {product.product_name}
                                </td>

                                <td className="p-4">
                                    {product.size}
                                </td>

                                <td className="p-4">
                                    {product.quantity}
                                </td>

                                <td className="p-4">
                                    ₹{product.mrp}
                                </td>

                                <td className="p-4">
                                    ₹{product.selling_price}
                                </td>

                            </tr>

                        ))}

                    </tbody>
                </table>

            </div>

        </div>
    );
}