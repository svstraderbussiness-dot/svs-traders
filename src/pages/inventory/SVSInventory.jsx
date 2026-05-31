import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function SVSInventory() {
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetchProducts();
    }, []);

    async function fetchProducts() {
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .order("id", { ascending: false });

        if (error) {
            console.log(error);
        } else {
            setProducts(data);
        }
    }

    const filteredProducts = products.filter(
        (product) =>
            product.product_name
                ?.toLowerCase()
                .includes(search.toLowerCase()) ||
            product.barcode?.toString().includes(search)
    );

    return (
        <div className="p-8 bg-[#09152c] min-h-screen text-white">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-5xl font-bold">
                    SVS Inventory
                </h1>

                <input
                    type="text"
                    placeholder="Search barcode or product..."
                    className="bg-[#2a2a2a] px-5 py-4 rounded-2xl w-80 outline-none"
                    value={search}
                    onChange={(e) =>
                        setSearch(e.target.value)
                    }
                />
            </div>

            <div className="bg-[#1f1f24] rounded-3xl overflow-hidden">
                <table className="w-full">
                    <thead className="bg-[#2a2a2a]">
                        <tr className="text-left">
                            <th className="p-5">Barcode</th>
                            <th className="p-5">Product Name</th>
                            <th className="p-5">Brand</th>
                            <th className="p-5">Size</th>
                            <th className="p-5">Quantity</th>
                            <th className="p-5">MRP</th>
                            <th className="p-5">Selling Price</th>
                        </tr>
                    </thead>

                    <tbody>
                        {filteredProducts.map((product) => (
                            <tr
                                key={product.id}
                                className="border-t border-gray-800"
                            >
                                <td className="p-5">
                                    {product.barcode}
                                </td>

                                <td className="p-5">
                                    {product.product_name}
                                </td>

                                <td className="p-5">
                                    {product.brand}
                                </td>

                                <td className="p-5">
                                    {product.size}
                                </td>

                                <td className="p-5">
                                    {product.quantity}
                                </td>

                                <td className="p-5">
                                    ₹{product.mrp}
                                </td>

                                <td className="p-5">
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