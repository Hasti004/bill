import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Users, 
  Receipt, 
  CheckCircle, 
  XCircle, 
  Clock, 
  DollarSign,
  Eye,
  UserPlus,
  Settings,
  TrendingUp,
  Filter,
  Search,
  Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExpenseService } from "@/services/ExpenseService";
import { format } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { MobileExpenseTable } from "@/components/MobileExpenseTable";
import { formatINR } from "@/lib/format";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  is_active: boolean;
  balance?: number | null;
  reporting_engineer_id?: string | null;
}

interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  file_url: string;
  created_at: string;
}

interface Expense {
  id: string;
  title: string;
  destination: string;
  trip_start: string;
  trip_end: string;
  status: string;
  total_amount: number;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_balance: number;
  assigned_engineer_id?: string;
  admin_comment?: string;
}

export default function AdminPanel() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<User[]>([]);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [adminComment, setAdminComment] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedEngineer, setSelectedEngineer] = useState("");
  const [engineers, setEngineers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (userRole === "admin") {
      fetchData();
    }
  }, [userRole]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchUsers(),
        fetchExpenses(),
        fetchEngineers()
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeReceiptUrl = (url: string): string => {
    try {
      // If it's already a receipts public URL, keep as is
      if (url.startsWith("http")) {
        // Try to extract a key from known bucket paths and rebuild with receipts
        if (url.includes("/storage/v1/object/public/receipts/")) {
          return url;
        }
        const expenseAttachmentsIdx = url.indexOf("/storage/v1/object/public/expense-attachments/");
        if (expenseAttachmentsIdx !== -1) {
          const key = url.substring(expenseAttachmentsIdx + "/storage/v1/object/public/expense-attachments/".length);
          const { data } = supabase.storage.from("receipts").getPublicUrl(key);
          return data.publicUrl;
        }
        // Fallback: return original
        return url;
      }
      // Path-only stored (e.g., "{expenseId}/filename" or "temp/{userId}/filename")
      const { data } = supabase.storage.from("receipts").getPublicUrl(url);
      return data.publicUrl;
    } catch {
      return url;
    }
  };

  const fetchAttachments = async (expenseId: string) => {
    try {
      const { data, error } = await supabase
        .from("attachments")
        .select("id, filename, content_type, file_url, created_at")
        .eq("expense_id", expenseId)
        .order("created_at");

      if (error) throw error;

      const normalized = (data || []).map(a => ({
        ...a,
        file_url: normalizeReceiptUrl(a.file_url || ""),
      }));

      setAttachments(normalized);
    } catch (e) {
      console.error("Error fetching attachments:", e);
      setAttachments([]);
    }
  };

  useEffect(() => {
    if (selectedExpense) {
      fetchAttachments(selectedExpense.id);
    } else {
      setAttachments([]);
    }
  }, [selectedExpense]);

  const fetchUsers = async () => {
    // First get profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, user_id, name, email, created_at, is_active, balance, reporting_engineer_id")
      .order("created_at", { ascending: false });

    if (profilesError) throw profilesError;

    // Then get roles for each user
    const userIds = profiles.map(p => p.user_id);
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);

    if (rolesError) throw rolesError;

    // Combine the data
    const usersWithRoles = profiles.map(profile => {
      const userRole = roles.find(r => r.user_id === profile.user_id);
      return {
        id: profile.user_id,
        email: profile.email,
        name: profile.name,
        role: userRole?.role || "employee",
        created_at: profile.created_at,
        is_active: profile.is_active,
        balance: profile.balance ?? 0,
        reporting_engineer_id: profile.reporting_engineer_id ?? null
      };
    });

    setUsers(usersWithRoles);
  };

  const fetchExpenses = async () => {
    // Admin should see:
    // 1. Expenses verified by engineers (status = "verified" or "approved")
    // 2. Expenses submitted by engineers directly (status = "submitted" AND assigned_engineer_id IS NULL)
    
    // Fetch verified/approved expenses
    const { data: verifiedExpenses, error: verifiedError } = await supabase
      .from("expenses")
      .select("*")
      .in("status", ["verified", "approved"])
      .order("created_at", { ascending: false });

    // Fetch engineer-submitted expenses (submitted with no assigned engineer)
    const { data: engineerExpenses, error: engineerError } = await supabase
      .from("expenses")
      .select("*")
      .eq("status", "submitted")
      .is("assigned_engineer_id", null)
      .order("created_at", { ascending: false });

    if (verifiedError || engineerError) {
      throw verifiedError || engineerError;
    }

    // Combine and deduplicate expenses
    const allExpenses = [...(verifiedExpenses || []), ...(engineerExpenses || [])];
    const uniqueExpenses = Array.from(
      new Map(allExpenses.map(exp => [exp.id, exp])).values()
    );
    const expensesData = uniqueExpenses.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (!expensesData || expensesData.length === 0) {
      setExpenses([]);
      return;
    }

    // Get user profiles for the expenses
    const userIds = [...new Set(expensesData.map(e => e.user_id))];
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, name, email, balance")
      .in("user_id", userIds);

    if (profilesError) {
      throw profilesError;
    }

    // Combine expenses with profile data
    const expensesWithProfiles = expensesData.map(expense => {
      const profile = profiles?.find(p => p.user_id === expense.user_id);
      return {
        ...expense,
        user_name: profile?.name || "Unknown User",
        user_email: profile?.email || "unknown@example.com",
        user_balance: profile?.balance ?? 0,
        total_amount: Number(expense.total_amount)
      };
    });

    setExpenses(expensesWithProfiles);
  };

  const fetchEngineers = async () => {
    // Get engineers from user_roles
    const { data: engineerRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "engineer");

    if (rolesError) throw rolesError;

    if (!engineerRoles || engineerRoles.length === 0) {
      setEngineers([]);
      return;
    }

    // Get profiles for engineers
    const engineerIds = engineerRoles.map(r => r.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, name, email")
      .in("user_id", engineerIds);

    if (profilesError) throw profilesError;

    setEngineers(profiles.map(profile => ({
      id: profile.user_id,
      name: profile.name,
      email: profile.email
    })));
  };

  const approveExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      await ExpenseService.approveExpense(selectedExpense.id, user.id, adminComment);
      
      toast({
        title: "Expense Approved",
        description: "The expense has been approved successfully",
      });

      setSelectedExpense(null);
      setAdminComment("");
      fetchExpenses();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve expense",
      });
    }
  };


  const assignToEngineer = async () => {
    if (!selectedExpense || !selectedEngineer || !user) return;

    try {
      await ExpenseService.assignToEngineer(selectedExpense.id, selectedEngineer, user.id);
      
      toast({
        title: "Expense Assigned",
        description: "The expense has been assigned to an engineer for review",
      });

      setSelectedExpense(null);
      setSelectedEngineer("");
      fetchExpenses();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to assign expense",
      });
    }
  };

  const verifyExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      // Automatically update status to "verified"
      const updateData: any = {
        status: "verified",
        updated_at: new Date().toISOString()
      };

      if (adminComment) {
        updateData.admin_comment = adminComment;
      }

      const { error } = await supabase
        .from("expenses")
        .update(updateData)
        .eq("id", selectedExpense.id);

      if (error) throw error;

      // Log the action
      await supabase
        .from("audit_logs")
        .insert({
          expense_id: selectedExpense.id,
          user_id: user.id,
          action: "Status changed to verified",
          comment: adminComment || null
        });

      toast({
        title: "Expense Verified",
        description: "Expense has been verified successfully",
      });

      // Close dialog and reset
      setDialogOpen(false);
      setSelectedExpense(null);
      setAdminComment("");
      fetchExpenses();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to verify expense",
      });
    }
  };

  const approveExpenseDirect = async () => {
    if (!selectedExpense || !user) return;

    try {
      // Use ExpenseService to approve (this handles balance deduction)
      await ExpenseService.approveExpense(selectedExpense.id, user.id, adminComment);
      
      toast({
        title: "Expense Approved",
        description: `Expense approved and ₹${selectedExpense.total_amount} deducted from employee balance.`,
      });

      // Close dialog and reset
      setDialogOpen(false);
      setSelectedExpense(null);
      setAdminComment("");
      fetchExpenses();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve expense",
      });
    }
  };

  const updateExpenseStatus = async () => {
    if (!selectedExpense || !selectedStatus || !user) return;

    try {
      // Use proper service methods for approve/reject
      if (selectedStatus === "approved") {
        await ExpenseService.approveExpense(selectedExpense.id, user.id, adminComment);
        toast({
          title: "Expense Approved",
          description: `Expense approved and ₹${selectedExpense.total_amount} deducted from employee balance.`,
        });
      } else if (selectedStatus === "submitted" || selectedStatus === "verified") {
        // Only assign to engineer if one is selected
        if (selectedEngineer && selectedEngineer !== "none") {
          await ExpenseService.assignToEngineer(selectedExpense.id, selectedEngineer, user.id);
          toast({
            title: "Expense Assigned",
            description: "The expense has been assigned to an engineer for review",
          });
        } else {
          // Just update the status without assigning to engineer
          const updateData: any = {
            status: selectedStatus,
            updated_at: new Date().toISOString()
          };

          if (adminComment) {
            updateData.admin_comment = adminComment;
          }

          const { error } = await supabase
            .from("expenses")
            .update(updateData)
            .eq("id", selectedExpense.id);

          if (error) throw error;

          // Log the action
          await supabase
            .from("audit_logs")
            .insert({
              expense_id: selectedExpense.id,
              user_id: user.id,
              action: `Status changed to ${selectedStatus}`,
              comment: adminComment || null
            });

          toast({
            title: "Success",
            description: "Expense status updated successfully",
          });
        }
      } else {
        // For other status changes, use direct update
        const updateData: any = {
          status: selectedStatus,
          updated_at: new Date().toISOString()
        };

        if (selectedEngineer && selectedEngineer !== "none") {
          updateData.assigned_engineer_id = selectedEngineer;
        } else if (selectedEngineer === "none") {
          updateData.assigned_engineer_id = null;
        }

        if (adminComment) {
          updateData.admin_comment = adminComment;
        }

        const { error } = await supabase
          .from("expenses")
          .update(updateData)
          .eq("id", selectedExpense.id);

        if (error) throw error;

        // Log the action
        await supabase
          .from("audit_logs")
          .insert({
            expense_id: selectedExpense.id,
            user_id: user.id,
            action: `Status changed to ${selectedStatus}`,
            comment: adminComment || null
          });

        toast({
          title: "Success",
          description: "Expense status updated successfully",
        });
      }

      setDialogOpen(false);
      setSelectedExpense(null);
      setAdminComment("");
      setSelectedStatus("");
      setSelectedEngineer("");
      fetchExpenses();
    } catch (error: any) {
      console.error("Error updating expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update expense",
      });
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .upsert({
          user_id: userId,
          role: newRole
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "User role updated successfully",
      });

      fetchUsers();
    } catch (error: any) {
      console.error("Error updating user role:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update user role",
      });
    }
  };

  // Filter and search functions
  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = searchTerm === "" || 
      expense.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.user_email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || expense.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const exportExpenses = () => {
    const csvContent = [
      ["Employee", "Email", "Title", "Destination", "Amount (INR)", "Status", "Created Date"],
      ...filteredExpenses.map(expense => [
        expense.user_name,
        expense.user_email,
        expense.title,
        expense.destination,
        formatINR(expense.total_amount),
        expense.status,
        format(new Date(expense.created_at), "MMM d, yyyy")
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };


  const getStats = () => {
    const totalExpenses = expenses.length;
    const pendingExpenses = expenses.filter(e => ["submitted", "verified"].includes(e.status)).length;
    const approvedExpenses = expenses.filter(e => e.status === "approved").length;
    const totalAmount = expenses.reduce((sum, e) => sum + e.total_amount, 0);

    return {
      totalExpenses,
      pendingExpenses,
      approvedExpenses,
      totalAmount,
      totalUsers: users.length
    };
  };

  const stats = getStats();

  if (userRole !== "admin") {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Access Denied</h1>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Mobile-optimized Header Section */}
      <div className="text-center space-y-3 sm:space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl sm:rounded-2xl shadow-lg">
          <Settings className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
          Admin Panel
        </h1>
        <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-2xl mx-auto px-4">
          Manage users, expenses, and system settings with comprehensive oversight
        </p>
      </div>

      {/* Mobile-optimized Stats Cards */}
      <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1 sm:space-y-2 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Users</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1 sm:space-y-2 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Expenses</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.totalExpenses}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                <Receipt className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1 sm:space-y-2 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Pending</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.pendingExpenses}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1 sm:space-y-2 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Approved</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.approvedExpenses}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1 sm:space-y-2 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Amount</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatINR(stats.totalAmount)}</p>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="expenses" className="space-y-4">
        <TabsList>
          <TabsTrigger value="expenses">All Expenses</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-4">
          {/* Search and Filter Controls */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Filter className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold">Search & Filter Expenses</CardTitle>
                  <CardDescription className="text-blue-100">Find and filter expenses by various criteria</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by title, destination, employee..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-10 sm:h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 text-sm"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Status Filter</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10 sm:h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 text-sm">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">Actions</label>
                  <Button 
                    onClick={exportExpenses}
                    className="w-full h-10 sm:h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Export CSV</span>
                    <span className="sm:hidden">Export</span>
                  </Button>
                </div>
              </div>
              
              <div className="mt-3 sm:mt-4 text-xs sm:text-sm text-gray-600">
                Showing {filteredExpenses.length} of {expenses.length} expenses
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-xl font-bold">All Expenses</CardTitle>
              <CardDescription>Review and manage expense submissions from all users</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-2 text-gray-600">Loading expenses...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-200">
                        <TableHead className="font-semibold">Employee</TableHead>
                        <TableHead className="font-semibold">Title</TableHead>
                        <TableHead className="font-semibold">Destination</TableHead>
                        <TableHead className="font-semibold">Amount</TableHead>
                        <TableHead className="font-semibold">Balance</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Created</TableHead>
                        <TableHead className="text-right font-semibold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{expense.user_name}</div>
                            <div className="text-sm text-muted-foreground">{expense.user_email}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{expense.title}</TableCell>
                        <TableCell>{expense.destination}</TableCell>
                        <TableCell>{formatINR(expense.total_amount)}</TableCell>
                        <TableCell>
                          <div className={`font-medium ${
                            expense.user_balance >= expense.total_amount 
                              ? 'text-green-600' 
                              : 'text-red-600'
                          }`}>
                            {formatINR(expense.user_balance)}
                          </div>
                          {expense.user_balance < expense.total_amount && (
                            <div className="text-xs text-red-500">
                              Insufficient balance
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={expense.status as any} />
                        </TableCell>
                        <TableCell>
                          {format(new Date(expense.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          {expense.status !== "approved" ? (
                            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    setSelectedExpense(expense);
                                    setDialogOpen(true);
                                    // Fetch attachments when opening dialog
                                    if (expense.id) {
                                      const { data: attData } = await supabase
                                        .from("attachments")
                                        .select("*")
                                        .eq("expense_id", expense.id)
                                        .order("created_at", { ascending: false });
                                      setAttachments(attData || []);
                                    }
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto sm:max-w-3xl md:max-w-4xl">
                              <DialogHeader>
                                <DialogTitle>Review and manage this expense submission</DialogTitle>
                              </DialogHeader>
                              
                              {selectedExpense && (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="text-sm font-medium">Employee</label>
                                      <p className="text-sm">{selectedExpense.user_name}</p>
                                      <p className="text-xs text-muted-foreground">{selectedExpense.user_email}</p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium">Amount</label>
                                      <p className="text-lg font-semibold">{formatINR(selectedExpense.total_amount)}</p>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="text-sm font-medium">Title</label>
                                    <p className="text-sm">{selectedExpense.title}</p>
                                  </div>

                                  <div>
                                    <label className="text-sm font-medium">Destination</label>
                                    <p className="text-sm">{selectedExpense.destination}</p>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="text-sm font-medium">Trip Start</label>
                                      <p className="text-sm">{format(new Date(selectedExpense.trip_start), "MMM d, yyyy")}</p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium">Trip End</label>
                                      <p className="text-sm">{format(new Date(selectedExpense.trip_end), "MMM d, yyyy")}</p>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="text-sm font-medium">Current Status</label>
                                    <div className="mt-1">
                                      <StatusBadge status={selectedExpense.status as any} />
                                    </div>
                                  </div>

                                  {/* For submitted expenses, show both Verify and Approve buttons */}
                                  {selectedExpense.status === "submitted" ? (
                                    <div>
                                      <label className="text-sm font-medium">Admin Comment (Optional)</label>
                                      <Textarea
                                        value={adminComment}
                                        onChange={(e) => setAdminComment(e.target.value)}
                                        placeholder="Add a comment about this expense..."
                                        className="mt-1"
                                      />
                                    </div>
                                  ) : selectedExpense.status === "verified" ? (
                                    <div>
                                      <label className="text-sm font-medium">Admin Comment (Optional)</label>
                                      <Textarea
                                        value={adminComment}
                                        onChange={(e) => setAdminComment(e.target.value)}
                                        placeholder="Add a comment about this expense..."
                                        className="mt-1"
                                      />
                                    </div>
                                  ) : (
                                    <>
                                      <div>
                                        <label className="text-sm font-medium">Update Status</label>
                                        <Select 
                                          value={selectedStatus} 
                                          onValueChange={setSelectedStatus}
                                          disabled={selectedExpense.status === 'approved'}
                                        >
                                          <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="Select new status" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="submitted">Submitted</SelectItem>
                                            <SelectItem value="verified">Verified</SelectItem>
                                            <SelectItem value="approved">Approved</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      <div>
                                        <label className="text-sm font-medium">Admin Comment</label>
                                        <Textarea
                                          value={adminComment}
                                          onChange={(e) => setAdminComment(e.target.value)}
                                          placeholder="Add a comment about this expense..."
                                          className="mt-1"
                                        />
                                      </div>
                                    </>
                                  )}

                                  {attachments.length > 0 && (
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium">Receipts & Attachments</label>
                                      <div className="space-y-2">
                                        {attachments.map((a) => (
                                          <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg">
                                            <div className="flex items-center gap-3">
                                              {a.content_type?.startsWith("image/") ? (
                                                <img src={a.file_url} alt={a.filename} className="h-14 w-14 object-cover rounded" />
                                              ) : (
                                                <div className="h-14 w-14 flex items-center justify-center bg-gray-100 rounded text-xs">FILE</div>
                                              )}
                                              <div>
                                                <p className="font-medium text-sm">{a.filename}</p>
                                                <p className="text-xs text-muted-foreground">{a.content_type} • {format(new Date(a.created_at), "MMM d, yyyy")}</p>
                                              </div>
                                            </div>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => {
                                                setImagePreviewUrl(a.file_url);
                                                setImagePreviewOpen(true);
                                              }}
                                            >
                                              View
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              <DialogFooter>
                                <Button variant="outline" onClick={() => {
                                  setDialogOpen(false);
                                  setSelectedExpense(null);
                                  setAdminComment("");
                                  setSelectedStatus("");
                                }}>
                                  Cancel
                                </Button>
                                {selectedExpense?.status === "submitted" ? (
                                  <>
                                    <Button variant="outline" onClick={verifyExpense}>
                                      Verify
                                    </Button>
                                    <Button onClick={approveExpenseDirect}>
                                      Approve
                                    </Button>
                                  </>
                                ) : selectedExpense?.status === "verified" ? (
                                  <Button onClick={approveExpenseDirect}>
                                    Approve
                                  </Button>
                                ) : (
                                  <Button 
                                    onClick={updateExpenseStatus} 
                                    disabled={!selectedStatus || selectedExpense?.status === 'approved'}
                                  >
                                    Update Status
                                  </Button>
                                )}
                              </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              title="Approved expenses cannot be reviewed"
                            >
                              <Eye className="h-4 w-4 opacity-50" />
                            </Button>
                          )}
                          {/* Image Preview Dialog - outside the conditional */}
                          <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
                            <DialogContent className="max-w-3xl">
                              {imagePreviewUrl && (
                                <img src={imagePreviewUrl} alt="Attachment preview" className="w-full h-auto rounded" />
                              )}
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Manage user roles and permissions</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Engineer</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.role === 'employee' ? (
                            <Select
                              value={user.reporting_engineer_id || "none"}
                              onValueChange={async (value) => {
                                const newEngineerId = value === "none" ? null : value;
                                await supabase
                                  .from('profiles')
                                  .update({ reporting_engineer_id: newEngineerId })
                                  .eq('user_id', user.id);
                                fetchUsers();
                              }}
                            >
                              <SelectTrigger className="w-56 h-8">
                                <SelectValue placeholder="Select engineer" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Unassigned</SelectItem>
                                {engineers.map((eng) => (
                                  <SelectItem key={eng.id} value={eng.id}>
                                    {eng.name} ({eng.email})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={(user.balance ?? 0).toString()}
                              onChange={async (e) => {
                                const newVal = parseFloat(e.target.value || '0');
                                await supabase
                                  .from('profiles')
                                  .update({ balance: newVal })
                                  .eq('user_id', user.id);
                                fetchUsers();
                              }}
                              className="w-28 h-8"
                            />
                            <span className="text-xs text-muted-foreground">INR</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? "success" : "destructive"}>
                            {user.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(user.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Select
                            value={user.role}
                            onValueChange={(newRole) => updateUserRole(user.id, newRole)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="employee">Employee</SelectItem>
                              <SelectItem value="engineer">Engineer</SelectItem>
                              <SelectItem value="cashier">Cashier</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
