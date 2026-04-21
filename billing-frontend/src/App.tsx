import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginScreen from "@/screens/LoginScreen";
import Sidebar from "@/components/Sidebar";
import DashboardScreen from "@/screens/DashboardScreen";
import InvoicesScreen from "@/screens/InvoicesScreen";
import InvoiceFormScreen from "@/screens/InvoiceFormScreen";
import InvoiceDetailScreen from "@/screens/InvoiceDetailScreen";
import PartiesScreen from "@/screens/PartiesScreen";
import PartyDetailScreen from "@/screens/PartyDetailScreen";
import ItemsScreen from "@/screens/ItemsScreen";
import ReportsScreen from "@/screens/ReportsScreen";
import ImportBusyScreen from "@/screens/ImportBusyScreen";
import PartyStatementScreen from "@/screens/PartyStatementScreen";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

export type Screen =
  | "dashboard"
  | "invoices"
  | "invoice-new"
  | "invoice-edit"
  | "invoice-detail"
  | "parties"
  | "party-detail"
  | "party-statement"
  | "items"
  | "reports"
  | "import";

const App = () => {
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem("billing_auth_token"));
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [selectedParty, setSelectedParty] = useState<string | null>(null);

  const navigate = (s: Screen, ctx?: { invoiceId?: string; partyId?: string }) => {
    if (ctx?.invoiceId) setSelectedInvoice(ctx.invoiceId);
    if (ctx?.partyId) setSelectedParty(ctx.partyId);
    setScreen(s);
  };

  const handleLogout = () => {
    localStorage.removeItem("billing_auth_token");
    setLoggedIn(false);
    setScreen("dashboard");
  };

  if (!loggedIn) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <LoginScreen onLogin={() => setLoggedIn(true)} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  const renderScreen = () => {
    switch (screen) {
      case "dashboard":
        return <DashboardScreen navigate={navigate} />;
      case "invoices":
        return <InvoicesScreen navigate={navigate} />;
      case "invoice-new":
        return <InvoiceFormScreen navigate={navigate} />;
      case "invoice-edit":
        return selectedInvoice ? <InvoiceFormScreen navigate={navigate} editId={selectedInvoice} /> : null;
      case "invoice-detail":
        return selectedInvoice ? <InvoiceDetailScreen navigate={navigate} id={selectedInvoice} /> : null;
      case "parties":
        return <PartiesScreen navigate={navigate} />;
      case "party-detail":
        return selectedParty ? <PartyDetailScreen navigate={navigate} id={selectedParty} /> : null;
      case "party-statement":
        return selectedParty ? <PartyStatementScreen navigate={navigate} id={selectedParty} /> : null;
      case "items":
        return <ItemsScreen />;
      case "reports":
        return <ReportsScreen />;
      case "import":
        return <ImportBusyScreen />;
      default:
        return <DashboardScreen navigate={navigate} />;
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <div className="min-h-screen premium-bg flex">
          <Sidebar active={screen} navigate={navigate} onLogout={handleLogout} />
          <main className="flex-1 min-w-0 relative z-10 overflow-x-hidden">
            <div className="max-w-7xl mx-auto p-6 md:p-10">{renderScreen()}</div>
          </main>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
