import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import ExpenseForm from "./pages/ExpenseForm";
import ExpenseDetail from "./pages/ExpenseDetail";
import AdminPanel from "./pages/AdminPanel";
import EngineerReview from "./pages/EngineerReview";
import Analytics from "./pages/Analytics";
import ExpenseTemplates from "./pages/ExpenseTemplates";
import Notifications from "./pages/Notifications";
import UserManagement from "./pages/UserManagement";
import NotFound from "./pages/NotFound";
import Balances from "./pages/Balances";
import Reports from "./pages/Reports";
import CategoryManagement from "./pages/CategoryManagement";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/balances"
              element={
                <ProtectedRoute allowedRoles={["admin", "cashier", "engineer"]}>
                  <Layout>
                    <Balances />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute allowedRoles={["employee", "admin", "cashier"]}>
                  <Layout>
                    <Expenses />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses/new"
              element={
                <ProtectedRoute allowedRoles={["employee", "admin", "cashier"]}>
                  <Layout>
                    <ExpenseForm />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses/:id"
              element={
                <ProtectedRoute allowedRoles={["employee", "admin", "engineer", "cashier"]}>
                  <Layout>
                    <ExpenseDetail />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses/:id/edit"
              element={
                <ProtectedRoute allowedRoles={["employee", "admin", "cashier"]}>
                  <Layout>
                    <ExpenseForm />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/expenses"
              element={
                <ProtectedRoute allowedRoles={["admin", "cashier"]}>
                  <Layout>
                    <AdminPanel />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Layout>
                    <UserManagement />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Layout>
                    <Reports />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/categories"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Layout>
                    <CategoryManagement />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/review"
              element={
                <ProtectedRoute allowedRoles={["engineer"]}>
                  <Layout>
                    <EngineerReview />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute allowedRoles={["employee", "admin", "cashier"]}>
                  <Layout>
                    <Analytics />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/templates"
              element={
                <ProtectedRoute allowedRoles={["employee", "admin", "cashier"]}>
                  <Layout>
                    <ExpenseTemplates />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute allowedRoles={["employee", "admin", "engineer", "cashier"]}>
                  <Layout>
                    <Notifications />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
