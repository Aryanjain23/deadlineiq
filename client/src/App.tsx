import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage";
import AccountPage from "./pages/AccountPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import CookiePolicyPage from "./pages/CookiePolicyPage";
import DeletionPage from "./pages/DeletionPage";
import ContactPage from "./pages/ContactPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/profile" component={AccountPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/cookies" component={CookiePolicyPage} />
      <Route path="/delete-account" component={DeletionPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <OfflineIndicator />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
