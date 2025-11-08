import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Eye, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ExpenseWithUser {
  id: string;
  user_id: string;
  title: string | null;
  total_amount: number | null;
  status: string | null;
  created_at: string;
  trip_start: string;
  trip_end: string;
  category: string | null;
  purpose?: string | null;
  user_name: string;
  user_email: string;
}

interface UserRow {
  user_id: string;
  name: string;
  email: string;
  balance: number;
  role: string;
}

export default function Reports() {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"verification" | "approval" | "detailed">("verification");
  
  // Common filters
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [engineerStatus, setEngineerStatus] = useState<string>("verified");
  const [hoStatus, setHoStatus] = useState<string>("approved");
  
  // Detailed report filters
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [lpoNumber, setLpoNumber] = useState<string>("");
  
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [verificationExpenses, setVerificationExpenses] = useState<ExpenseWithUser[]>([]);
  const [approvalExpenses, setApprovalExpenses] = useState<ExpenseWithUser[]>([]);
  const [detailedExpenses, setDetailedExpenses] = useState<ExpenseWithUser[]>([]);

  useEffect(() => {
    if (userRole === "admin") {
      void fetchUsers();
      void fetchCategories();
    }
  }, [userRole]);

  useEffect(() => {
    if (userRole === "admin") {
      if (activeTab === "verification") {
        void fetchVerificationExpenses();
      } else if (activeTab === "approval") {
        void fetchApprovalExpenses();
      } else if (activeTab === "detailed") {
        void fetchDetailedExpenses();
      }
    }
  }, [userRole, activeTab, selectedEmployee, selectedCategory, engineerStatus, hoStatus, selectedYear, selectedMonth, selectedWeek, lpoNumber]);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email, balance");
      if (profilesError) throw profilesError;
      const ids = (profiles || []).map(p => p.user_id);
      let rolesById: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: rolesRows, error: rolesErr } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids);
        if (rolesErr) throw rolesErr;
        (rolesRows || []).forEach(r => { rolesById[r.user_id] = r.role; });
      }
      const combined: UserRow[] = (profiles || []).map((p: any) => ({
        user_id: p.user_id,
        name: p.name || "",
        email: p.email || "",
        balance: Number(p.balance ?? 0),
        role: rolesById[p.user_id] || "employee",
      }));
      setUsers(combined);
    } catch (e) {
      console.error("Failed to fetch users for reports", e);
    }
  };

  const fetchCategories = async () => {
    try {
      let { data, error } = await supabase
        .from("expense_categories")
        .select("name")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error && (error as any).code === '42703') {
        let r2 = await supabase
          .from("expense_categories")
          .select("name")
          .eq("active", true)
          .order("name", { ascending: true });
        data = r2.data as any;
        error = r2.error as any;
        if (error && (error as any).code === '42703') {
          const r3 = await supabase
            .from("expense_categories")
            .select("name")
            .order("name", { ascending: true });
          data = r3.data as any;
          error = r3.error as any;
        }
      }
      if (error) throw error;
      setCategories((data || []).map((r: any) => r.name));
    } catch (e) {
      console.warn("Categories not available", e);
      setCategories([]);
    }
  };

  const fetchVerificationExpenses = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("expenses")
        .select("id, user_id, title, total_amount, status, created_at, trip_start, trip_end, category")
        .eq("status", "verified");
      
      if (selectedEmployee !== "all") query = query.eq("user_id", selectedEmployee);
      if (selectedCategory !== "all") query = query.eq("category", selectedCategory);
      
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        setVerificationExpenses([]);
        return;
      }

      const userIds = [...new Set(data.map(e => e.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const expensesWithUsers: ExpenseWithUser[] = data.map(expense => {
        const profile = profiles?.find(p => p.user_id === expense.user_id);
        return {
          ...expense,
          user_name: profile?.name || "Unknown User",
          user_email: profile?.email || "",
        } as ExpenseWithUser;
      });

      setVerificationExpenses(expensesWithUsers);
    } catch (e) {
      console.error("Failed to fetch verification expenses", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchApprovalExpenses = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("expenses")
        .select("id, user_id, title, total_amount, status, created_at, trip_start, trip_end, category")
        .eq("status", "approved");
      
      if (selectedEmployee !== "all") query = query.eq("user_id", selectedEmployee);
      if (selectedCategory !== "all") query = query.eq("category", selectedCategory);
      
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        setApprovalExpenses([]);
        return;
      }

      const userIds = [...new Set(data.map(e => e.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const expensesWithUsers: ExpenseWithUser[] = data.map(expense => {
        const profile = profiles?.find(p => p.user_id === expense.user_id);
        return {
          ...expense,
          user_name: profile?.name || "Unknown User",
          user_email: profile?.email || "",
        } as ExpenseWithUser;
      });

      setApprovalExpenses(expensesWithUsers);
    } catch (e) {
      console.error("Failed to fetch approval expenses", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedExpenses = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("expenses")
        .select("id, user_id, title, total_amount, status, created_at, trip_start, trip_end, category, purpose");
      
      if (selectedEmployee !== "all") query = query.eq("user_id", selectedEmployee);
      if (selectedCategory !== "all") query = query.eq("category", selectedCategory);
      
      // Year filter
      if (selectedYear) {
        const yearStart = new Date(`${selectedYear}-01-01`);
        const yearEnd = new Date(`${selectedYear}-12-31`);
        yearEnd.setHours(23, 59, 59, 999);
        query = query.gte("trip_start", yearStart.toISOString().split('T')[0])
                    .lte("trip_start", yearEnd.toISOString().split('T')[0]);
      }
      
      // Month filter
      if (selectedMonth !== "all" && selectedYear) {
        const monthNum = parseInt(selectedMonth);
        const monthStart = new Date(parseInt(selectedYear), monthNum - 1, 1);
        const monthEnd = new Date(parseInt(selectedYear), monthNum, 0);
        query = query.gte("trip_start", monthStart.toISOString().split('T')[0])
                    .lte("trip_start", monthEnd.toISOString().split('T')[0]);
      }
      
      const { data, error } = await query.order("trip_start", { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        setDetailedExpenses([]);
        return;
      }

      const userIds = [...new Set(data.map(e => e.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const expensesWithUsers: ExpenseWithUser[] = data.map(expense => {
        const profile = profiles?.find(p => p.user_id === expense.user_id);
        return {
          ...expense,
          user_name: profile?.name || "Unknown User",
          user_email: profile?.email || "",
        } as ExpenseWithUser;
      });

      setDetailedExpenses(expensesWithUsers);
    } catch (e) {
      console.error("Failed to fetch detailed expenses", e);
    } finally {
      setLoading(false);
    }
  };

  const formatDateDDMMYYYY = (dateString: string | null): string => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return "-";
    }
  };

  const clearFilters = () => {
    setSelectedEmployee("all");
    setSelectedCategory("all");
    setEngineerStatus("verified");
    setHoStatus("approved");
    setSelectedYear(new Date().getFullYear().toString());
    setSelectedMonth("all");
    setSelectedWeek("all");
    setLpoNumber("");
  };

  // Calculate summary for detailed report
  const detailedSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    detailedExpenses.forEach(exp => {
      const cat = exp.category || "Other";
      summary[cat] = (summary[cat] || 0) + Number(exp.total_amount || 0);
    });
    return summary;
  }, [detailedExpenses]);

  const totalAmount = useMemo(() => {
    return detailedExpenses.reduce((sum, exp) => sum + Number(exp.total_amount || 0), 0);
  }, [detailedExpenses]);

  // Get selected user for detailed report
  const selectedUser = useMemo(() => {
    if (selectedEmployee === "all") return null;
    return users.find(u => u.user_id === selectedEmployee);
  }, [selectedEmployee, users]);

  // Calculate opening/closing balance for detailed report
  const balanceInfo = useMemo(() => {
    if (!selectedUser) return { opening: 0, allocated: 0, closing: 0 };
    
    const allocated = detailedExpenses.reduce((sum, exp) => {
      // Only count approved expenses as allocated (these were deducted from balance)
      if (exp.status === "approved") {
        return sum + Number(exp.total_amount || 0);
      }
      return sum;
    }, 0);
    
    // Opening balance = current balance + allocated (since allocated was deducted)
    const opening = Number(selectedUser.balance) + allocated;
    // Closing balance = current balance
    const closing = Number(selectedUser.balance);
    
    return { opening, allocated, closing };
  }, [selectedUser, detailedExpenses]);

  if (userRole !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Access denied. Admin only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-sm text-slate-600">View and manage expense reports</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="verification">Claim Verification List</TabsTrigger>
          <TabsTrigger value="approval">Claim Approval List</TabsTrigger>
          <TabsTrigger value="detailed">Detailed Expense Report</TabsTrigger>
        </TabsList>

        {/* Claim Verification List */}
        <TabsContent value="verification" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>CLAIM VERIFICATION LIST</CardTitle>
              <CardDescription>Expenses verified by engineers, pending admin approval</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">APPLIED FILTER</Label>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger>
                        <SelectValue placeholder="All employees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        {users.filter(u => u.role === "employee").map(u => (
                          <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expense Type</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Engineer Approval Status</Label>
                    <Select value={engineerStatus} onValueChange={setEngineerStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verified">Verified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={fetchVerificationExpenses} disabled={loading}>Submit</Button>
                  <Button variant="outline" onClick={clearFilters}>Clear</Button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Employee</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Expense Type</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">LPO Number</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Bill Date (DD-MM-YYYY)</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Bill Amount</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Engineer Approval</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">HO Approval</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Submitted On (DD-MM-YYYY)</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                      </tr>
                    ) : verificationExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No expenses found</td>
                      </tr>
                    ) : (
                      verificationExpenses.map(exp => (
                        <tr key={exp.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">{exp.user_name}</td>
                          <td className="px-4 py-3">{exp.category || "-"}</td>
                          <td className="px-4 py-3">-</td>
                          <td className="px-4 py-3">{formatDateDDMMYYYY(exp.trip_start)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatINR(Number(exp.total_amount || 0))}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status="verified" />
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary">Pending</Badge>
                          </td>
                          <td className="px-4 py-3">{formatDateDDMMYYYY(exp.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/expenses/${exp.id}`)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/expenses/${exp.id}`)}>
                                <FileText className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Claim Approval List */}
        <TabsContent value="approval" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>CLAIM APPROVAL LIST</CardTitle>
              <CardDescription>Expenses approved by admin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">APPLIED FILTER</Label>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger>
                        <SelectValue placeholder="All employees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        {users.filter(u => u.role === "employee").map(u => (
                          <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expense Type</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="All categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Engineer Approval Status</Label>
                    <Select value={engineerStatus} onValueChange={setEngineerStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verified">Verified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>HO Approval Status</Label>
                    <Select value={hoStatus} onValueChange={setHoStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approved">Approved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={fetchApprovalExpenses} disabled={loading}>Submit</Button>
                  <Button variant="outline" onClick={clearFilters}>Clear</Button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Employee</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Expense Type</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">LPO Number</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Bill Date (DD-MM-YYYY)</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">Bill Amount</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Engineer Approval</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">HO Approval</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Submitted On (DD-MM-YYYY)</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                      </tr>
                    ) : approvalExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No expenses found</td>
                      </tr>
                    ) : (
                      approvalExpenses.map(exp => (
                        <tr key={exp.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">{exp.user_name}</td>
                          <td className="px-4 py-3">{exp.category || "-"}</td>
                          <td className="px-4 py-3">-</td>
                          <td className="px-4 py-3">{formatDateDDMMYYYY(exp.trip_start)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatINR(Number(exp.total_amount || 0))}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status="verified" />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status="approved" />
                          </td>
                          <td className="px-4 py-3">{formatDateDDMMYYYY(exp.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/expenses/${exp.id}`)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/expenses/${exp.id}`)}>
                                <FileText className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed Expense Report */}
        <TabsContent value="detailed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Expense Report</CardTitle>
              <CardDescription>View detailed expenses with balance tracking</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">FILTERS</Label>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Employee *</Label>
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        {users.filter(u => u.role === "employee").map(u => (
                          <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expense Type</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Expense" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>LPO Number</Label>
                    <Input value={lpoNumber} onChange={(e) => setLpoNumber(e.target.value)} placeholder="Enter LPO number" />
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                          <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All months</SelectItem>
                        {Array.from({ length: 12 }, (_, i) => {
                          const month = new Date(2000, i, 1).toLocaleString('default', { month: 'long' });
                          return <SelectItem key={i + 1} value={(i + 1).toString()}>{month}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Week</Label>
                    <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Week" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All weeks</SelectItem>
                        {Array.from({ length: 52 }, (_, i) => (
                          <SelectItem key={i + 1} value={(i + 1).toString()}>Week {i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={fetchDetailedExpenses} disabled={loading}>Submit</Button>
                  <Button variant="outline" onClick={clearFilters}>Clear</Button>
                  <Button variant="outline" onClick={() => {
                    // Export functionality can be added here
                    console.log("Export clicked");
                  }}>Export</Button>
                </div>
              </div>

              {selectedUser && (
                <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                  <p className="font-semibold">{selectedUser.name}</p>
                  <p className="text-sm text-slate-600">Year : {selectedYear.slice(-2)}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Detailed List</h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-100 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Bill Date</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Type of Expense</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Bill No</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">LPO#</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedUser && (
                          <>
                            <tr className="bg-slate-50">
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3 font-medium">Opening Balance</td>
                              <td className="px-4 py-3 text-right font-medium">{formatINR(balanceInfo.opening)}</td>
                              <td className="px-4 py-3"></td>
                            </tr>
                            <tr className="bg-slate-50">
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3 font-medium">Allocated Amount</td>
                              <td className="px-4 py-3 text-right font-medium">{formatINR(balanceInfo.allocated)}</td>
                              <td className="px-4 py-3"></td>
                            </tr>
                            <tr className="bg-slate-50">
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3 font-medium">Closing Balance</td>
                              <td className="px-4 py-3 text-right font-medium">{formatINR(balanceInfo.closing)}</td>
                              <td className="px-4 py-3"></td>
                            </tr>
                          </>
                        )}
                        {loading ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                          </tr>
                        ) : detailedExpenses.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No expenses found</td>
                          </tr>
                        ) : (
                          detailedExpenses.map(exp => (
                            <tr key={exp.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3">{formatDateDDMMYYYY(exp.trip_start)}</td>
                              <td className="px-4 py-3">{exp.category || "-"}</td>
                              <td className="px-4 py-3">-</td>
                              <td className="px-4 py-3">-</td>
                              <td className="px-4 py-3 text-right font-medium">{formatINR(Number(exp.total_amount || 0))}</td>
                              <td className="px-4 py-3">{exp.purpose || "-"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">Summary</h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-100 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Type of Expense</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {Object.entries(detailedSummary).map(([category, amount]) => (
                          <tr key={category} className="hover:bg-slate-50">
                            <td className="px-4 py-3">{category}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatINR(amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-200 font-bold border-t-2">
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3 text-right">{formatINR(totalAmount)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
