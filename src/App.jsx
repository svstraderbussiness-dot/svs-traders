import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { supabase } from "./lib/supabase";
import { ThemeProvider } from "./context/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Sidebar from "./components/sidebar/Sidebar";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Billing from "./pages/Billing";
import Returns from "./pages/Returns";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import UploadStock from "./pages/upload/UploadStock";

import JockeyInventory from "./pages/inventory/JockeyInventory";
import BevdassInventory from "./pages/inventory/BevdassInventory";
import SVSInventory from "./pages/inventory/SVSInventory";

function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-[#061b4d]">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

function AppRoutes() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setLoading(false);
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#061b4d] text-white">
        Loading...
      </div>
    );
  }

  const protectedPage = (Component) => (
    <ProtectedRoute
      session={session}
      loading={loading}
    >
      <Layout>
        <Component />
      </Layout>
    </ProtectedRoute>
  );

  return (
    <Routes>
      {/* LOGIN */}
      <Route
        path="/login"
        element={
          session ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login />
          )
        }
      />

      {/* DASHBOARD */}
      <Route
        path="/dashboard"
        element={protectedPage(Dashboard)}
      />

      {/* BILLING */}
      <Route
        path="/billing"
        element={protectedPage(Billing)}
      />

      {/* RETURNS */}
      <Route
        path="/returns"
        element={protectedPage(Returns)}
      />

      {/* ANALYTICS */}
      <Route
        path="/analytics"
        element={protectedPage(Analytics)}
      />

      {/* SETTINGS */}
      <Route
        path="/settings"
        element={protectedPage(Settings)}
      />

      {/* REPORTS */}
      <Route
        path="/reports"
        element={protectedPage(Reports)}
      />

      {/* UPLOAD STOCK */}
      <Route
        path="/upload-stock"
        element={protectedPage(UploadStock)}
      />

      {/* INVENTORY */}
      <Route
        path="/jockey-inventory"
        element={protectedPage(JockeyInventory)}
      />

      <Route
        path="/bevdass-inventory"
        element={protectedPage(BevdassInventory)}
      />

      <Route
        path="/svs-inventory"
        element={protectedPage(SVSInventory)}
      />

      {/* DEFAULT */}
      <Route
        path="/"
        element={
          session ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* FALLBACK */}
      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  );
}