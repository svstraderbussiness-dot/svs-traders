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
        <div className="animate-fade-in-up">
          {children}
        </div>
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center text-white"
      style={{
        background: "linear-gradient(135deg, #061b4d 0%, #0d1f4e 50%, #071533 100%)",
      }}
    >
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }}
      />
      {/* Spinner */}
      <div className="relative mb-5">
        <div
          className="h-14 w-14 rounded-full border-[3px] border-white/8 border-t-blue-500 animate-spin-smooth"
        />
        <div
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="h-3 w-3 rounded-full bg-blue-500" style={{ boxShadow: "0 0 10px #3b82f6" }} />
        </div>
      </div>
      <div className="text-[17px] font-bold tracking-tight text-white">
        SVS TRADERS
      </div>
      <div className="mt-1.5 text-[12px] text-white/35 font-medium tracking-wide">Loading your workspace…</div>
      {/* Dots */}
      <div className="mt-5 flex gap-1.5">
        {[0,1,2].map(i => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-white/30"
            style={{ animation: `bounceDot 1.2s ${i * 0.2}s ease-in-out infinite` }} />
        ))}
      </div>
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
    return <LoadingScreen />;
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