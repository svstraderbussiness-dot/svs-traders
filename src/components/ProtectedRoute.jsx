import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ session, loading, children }) {
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#061b4d] text-white">
                Loading...
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    return children;
}