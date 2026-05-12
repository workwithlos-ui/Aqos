import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppShell } from "./components/acq/AppShell";
import Dashboard from "./pages/Dashboard";
import Pipeline from "./pages/Pipeline";
import DealAnalyzer from "./pages/DealAnalyzer";
import Advisor from "./pages/Advisor";
import Exports from "./pages/Exports";
import Assumptions from "./pages/Assumptions";
import TestSuite from "./pages/TestSuite";
import BuyBox from "./pages/BuyBox";
import WorkingCapital from "./pages/WorkingCapital";
import Integration from "./pages/Integration";
import Governance from "./pages/Governance";
import RedTeam from "./pages/RedTeam";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pipeline" component={Pipeline} />
        <Route path="/analyze" component={DealAnalyzer} />
        <Route path="/analyze/:id" component={DealAnalyzer} />
        <Route path="/advisor" component={Advisor} />
        <Route path="/exports" component={Exports} />
        <Route path="/exports/:id" component={Exports} />
        <Route path="/assumptions" component={Assumptions} />
        <Route path="/tests" component={TestSuite} />
        <Route path="/m-and-a/thesis" component={BuyBox} />
        <Route path="/m-and-a/working-capital" component={WorkingCapital} />
        <Route path="/m-and-a/integration" component={Integration} />
        <Route path="/m-and-a/governance" component={Governance} />
        <Route path="/m-and-a/red-team" component={RedTeam} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
