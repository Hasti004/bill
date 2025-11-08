import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Mail, User, Shield, Settings, Sparkles, CheckCircle, AlertCircle, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "engineer", "employee", "cashier"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

interface CreateUserForm {
  name: string;
  email: string;
  role: "admin" | "engineer" | "employee" | "cashier";
  password: string;
  reportingEngineerId?: string | "none";
}

export default function UserManagement() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [engineers, setEngineers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [users, setUsers] = useState<{ user_id: string; name: string; email: string; balance: number; role: string }[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ user_id: string; name: string; email: string; balance: number; role: string } | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [logsByExpense, setLogsByExpense] = useState<Record<string, any[]>>({});
  const [deductions, setDeductions] = useState<any[]>([]);
  const [formData, setFormData] = useState<CreateUserForm>({
    name: "",
    email: "",
    role: "employee",
    password: "",
    reportingEngineerId: "none",
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<{ user_id: string; name: string; email: string; balance: number; role: string } | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ user_id: string; name: string; email: string } | null>(null);
  const [editFormData, setEditFormData] = useState<{ name: string; email: string; role: "admin" | "engineer" | "employee" | "cashier"; reportingEngineerId: string }>({
    name: "",
    email: "",
    role: "employee",
    reportingEngineerId: "none",
  });
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Load engineers for assignment dropdown
    const loadEngineers = async () => {
      try {
        // 1) Get user ids with engineer role
        const { data: roleRows, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .eq("role", "engineer");

        if (rolesError) throw rolesError;

        const engineerIds = (roleRows || []).map(r => r.user_id);
        if (engineerIds.length === 0) {
          setEngineers([]);
          return;
        }

        // 2) Get profiles for those engineers
        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, name, email")
          .in("user_id", engineerIds);

        if (profilesError) throw profilesError;

        const list = (profileRows || []).map(p => ({ id: p.user_id, name: p.name, email: p.email }));
        setEngineers(list);
      } catch (e) {
        console.error("Error loading engineers:", e);
      }
    };

    loadEngineers();
    // Load users for admin list
    const loadUsers = async () => {
      try {
        setListLoading(true);
        // fetch profiles
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

        const combined = (profiles || []).map(p => ({
          user_id: p.user_id,
          name: (p as any).name || "",
          email: (p as any).email || "",
          balance: Number((p as any).balance ?? 0),
          role: rolesById[p.user_id] || "employee",
        }));
        setUsers(combined);
      } catch (e) {
        console.error("Error loading users list:", e);
      } finally {
        setListLoading(false);
      }
    };
    loadUsers();
  }, []);

  const openUserDrawer = async (u: { user_id: string; name: string; email: string; balance: number; role: string }) => {
    setSelectedUser(u);
    setDrawerOpen(true);
    setExpensesLoading(true);
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, title, total_amount, status, created_at, updated_at")
        .eq("user_id", u.user_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = data || [];
      setExpenses(list);

      // Fetch audit logs for these expenses to build history and deductions
      const expenseIds = list.map((e: any) => e.id);
      if (expenseIds.length > 0) {
        const { data: logs, error: logsErr } = await supabase
          .from("audit_logs")
          .select("expense_id, user_id, action, comment, created_at")
          .in("expense_id", expenseIds)
          .order("created_at", { ascending: false });
        if (logsErr) throw logsErr;

        const grouped: Record<string, any[]> = {};
        (logs || []).forEach((log: any) => {
          if (!grouped[log.expense_id]) grouped[log.expense_id] = [];
          grouped[log.expense_id].push(log);
        });
        setLogsByExpense(grouped);

        // Deductions are the admin approvals for this user's expenses
        const approvals = (logs || []).filter(l => l.action === "expense_approved");
        // Map to include the expense info and amount (use total_amount)
        const deduced = approvals.map((l: any) => {
          const exp = list.find((e: any) => e.id === l.expense_id);
          return {
            expense_id: l.expense_id,
            title: exp?.title || "Untitled",
            amount: Number(exp?.total_amount ?? 0),
            at: l.created_at,
            comment: l.comment || "",
          };
        });
        setDeductions(deduced);
      } else {
        setLogsByExpense({});
        setDeductions([]);
      }
    } catch (e) {
      console.error("Failed to load expenses for user:", e);
    } finally {
      setExpensesLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (userRole !== "admin") {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "Only administrators can create user accounts",
      });
      return;
    }

    // Check if password is empty or too short
    if (!formData.password || formData.password.length < 8) {
      toast({
        variant: "destructive",
        title: "Password Required",
        description: "Please enter a password with at least 8 characters or use the Generate button",
      });
      return;
    }

    try {
      const validated = createUserSchema.parse(formData);
      setLoading(true);

      // Create a temporary client with no session persistence so admin session isn't replaced
      const tempSupabase = createClient<Database>(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            storage: undefined,
          },
        }
      );

      // Create user using signup (this will send confirmation email)
      const { data: authData, error: authError } = await tempSupabase.auth.signUp({
        email: validated.email,
        password: validated.password,
        options: {
          data: {
            name: validated.name,
          },
        },
      });

      if (authError) {
        // Handle specific error cases
        if (authError.message.includes("already registered")) {
          throw new Error("An account with this email already exists");
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error("Failed to create user");
      }

      // Assign role to the user
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: authData.user.id,
          role: validated.role,
        });

      if (roleError) throw roleError;

      // If creating an employee and an engineer is chosen, link them
      if (validated.role === "employee" && formData.reportingEngineerId && formData.reportingEngineerId !== "none") {
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update({ reporting_engineer_id: formData.reportingEngineerId })
          .eq("user_id", authData.user.id);

        if (profileUpdateError) throw profileUpdateError;
      }

      toast({
        title: "User Created Successfully",
        description: `${validated.name} has been created as ${validated.role}. They will receive an email to confirm their account.`,
      });

      // Reset form
      setFormData({
        name: "",
        email: "",
        role: "employee",
        password: "",
        reportingEngineerId: "none",
      });
      setShowPassword(false);

    } catch (error: any) {
      console.error("Error creating user:", error);
      
      if (error instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: error.errors[0].message,
        });
      } else if (error.message?.includes("already registered")) {
        toast({
          variant: "destructive",
          title: "User Already Exists",
          description: "An account with this email already exists",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error Creating User",
          description: error.message || "Failed to create user account",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password }));
    setShowPassword(true); // Automatically show the generated password
  };

  const openEditDialog = (u: { user_id: string; name: string; email: string; balance: number; role: string }) => {
    setUserToEdit(u);
    // Fetch reporting engineer if employee
    const fetchReportingEngineer = async () => {
      if (u.role === "employee") {
        try {
          const { data } = await supabase
            .from("profiles")
            .select("reporting_engineer_id")
            .eq("user_id", u.user_id)
            .single();
          setEditFormData({
            name: u.name,
            email: u.email,
            role: u.role as "admin" | "engineer" | "employee" | "cashier",
            reportingEngineerId: (data as any)?.reporting_engineer_id || "none",
          });
        } catch (e) {
          setEditFormData({
            name: u.name,
            email: u.email,
            role: u.role as "admin" | "engineer" | "employee" | "cashier",
            reportingEngineerId: "none",
          });
        }
      } else {
        setEditFormData({
          name: u.name,
          email: u.email,
          role: u.role as "admin" | "engineer" | "employee" | "cashier",
          reportingEngineerId: "none",
        });
      }
    };
    fetchReportingEngineer();
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (u: { user_id: string; name: string; email: string }) => {
    setUserToDelete(u);
    setDeleteDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!userToEdit) return;

    try {
      setUpdating(true);

      // Update profile (name, email)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          name: editFormData.name,
          email: editFormData.email,
          reporting_engineer_id: editFormData.role === "employee" && editFormData.reportingEngineerId !== "none" 
            ? editFormData.reportingEngineerId 
            : null,
        })
        .eq("user_id", userToEdit.user_id);

      if (profileError) throw profileError;

      // Update role
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({ role: editFormData.role })
        .eq("user_id", userToEdit.user_id);

      if (roleError) throw roleError;

      toast({
        title: "User Updated",
        description: `${editFormData.name}'s information has been updated successfully`,
      });

      setEditDialogOpen(false);
      setUserToEdit(null);
      
      // Reload users list
      const loadUsers = async () => {
        try {
          setListLoading(true);
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

          const combined = (profiles || []).map(p => ({
            user_id: p.user_id,
            name: (p as any).name || "",
            email: (p as any).email || "",
            balance: Number((p as any).balance ?? 0),
            role: rolesById[p.user_id] || "employee",
          }));
          setUsers(combined);
        } catch (e) {
          console.error("Error loading users list:", e);
        } finally {
          setListLoading(false);
        }
      };
      loadUsers();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update user",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      setDeleting(true);

      // Delete from user_roles first
      const { error: roleError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userToDelete.user_id);

      if (roleError) throw roleError;

      // Delete from profiles (this will cascade delete related data)
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("user_id", userToDelete.user_id);

      if (profileError) throw profileError;

      // Note: Deleting from auth.users requires admin API access
      // For now, we'll just delete from our tables
      // The auth user will remain but won't be able to access the system

      toast({
        title: "User Deleted",
        description: `${userToDelete.name} has been removed from the system`,
      });

      setDeleteDialogOpen(false);
      setUserToDelete(null);
      
      // Reload users list
      const loadUsers = async () => {
        try {
          setListLoading(true);
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

          const combined = (profiles || []).map(p => ({
            user_id: p.user_id,
            name: (p as any).name || "",
            email: (p as any).email || "",
            balance: Number((p as any).balance ?? 0),
            role: rolesById[p.user_id] || "employee",
          }));
          setUsers(combined);
        } catch (e) {
          console.error("Error loading users list:", e);
        } finally {
          setListLoading(false);
        }
      };
      loadUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete user",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (userRole !== "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600">Only administrators can access user management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Mobile-optimized Header Section */}
      <div className="text-center space-y-3 sm:space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl sm:rounded-2xl shadow-lg">
          <UserPlus className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
          User Management
        </h1>
        <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-2xl mx-auto px-4">
          Create and manage user accounts for your organization with role-based access control
        </p>
      </div>

      {/* Users List Card */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="p-6">
            <CardTitle className="text-xl font-bold">All Users</CardTitle>
            <CardDescription>Click a user to view full details and expense history</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">Name</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Email</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Role</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Balance</th>
                    <th className="px-4 py-3 font-semibold text-slate-700 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listLoading ? (
                    <tr>
                      <td className="px-4 py-4" colSpan={5}>Loading users...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4" colSpan={5}>No users found</td>
                    </tr>
                  ) : (
                    users.map(u => (
                      <tr key={u.user_id} className="border-t hover:bg-slate-50">
                        <td className="px-4 py-3">{u.name || "-"}</td>
                        <td className="px-4 py-3">{u.email || "-"}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">₹{Number(u.balance ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openUserDrawer(u)}>View</Button>
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(u)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => openDeleteDialog(u)}>
                              <Trash2 className="h-4 w-4" />
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

      {/* Create User Card */}
        <Card className="shadow-2xl border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">Create New User</CardTitle>
                <CardDescription className="text-blue-100 mt-1">
                  Add new team members with appropriate access levels
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <form onSubmit={handleCreateUser} className="space-y-8">
              {/* Personal Information */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <Label htmlFor="name" className="text-sm font-medium text-gray-700">Full Name *</Label>
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="John Doe"
                        className="pl-10 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email Address *</Label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="john.doe@company.com"
                        className="pl-10 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Role and Security */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Role & Security</h3>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <Label htmlFor="role" className="text-sm font-medium text-gray-700">Role *</Label>
                    <div className="relative group">
                      <Settings className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-600 transition-colors z-10" />
                      <Select
                        value={formData.role}
                        onValueChange={(value: "admin" | "engineer" | "employee" | "cashier") => 
                          setFormData(prev => ({ ...prev, role: value }))
                        }
                      >
                        <SelectTrigger className="pl-10 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-0 shadow-xl">
                          <SelectItem value="employee">
                            <div className="flex items-center gap-3 py-2">
                              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                <User className="h-4 w-4 text-green-600" />
                              </div>
                              <div>
                                <div className="font-medium">Employee</div>
                                <div className="text-xs text-gray-500">Create and submit expenses</div>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="engineer">
                            <div className="flex items-center gap-3 py-2">
                              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                <Settings className="h-4 w-4 text-blue-600" />
                              </div>
                              <div>
                                <div className="font-medium">Engineer</div>
                                <div className="text-xs text-gray-500">Review and verify expenses</div>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-3 py-2">
                              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                <Shield className="h-4 w-4 text-purple-600" />
                              </div>
                              <div>
                                <div className="font-medium">Administrator</div>
                                <div className="text-xs text-gray-500">Full system access</div>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="cashier">
                            <div className="flex items-center gap-3 py-2">
                              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                                <Settings className="h-4 w-4 text-amber-600" />
                              </div>
                              <div>
                                <div className="font-medium">Cashier</div>
                                <div className="text-xs text-gray-500">Mark expenses as paid and manage payouts</div>
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="reportingEngineer" className="text-sm font-medium text-gray-700">Assign Engineer (for Employee)</Label>
                    <Select
                      value={formData.reportingEngineerId || "none"}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, reportingEngineerId: value }))}
                      disabled={formData.role !== "employee"}
                    >
                      <SelectTrigger className="h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200">
                        <SelectValue placeholder="Select engineer" />
                      </SelectTrigger>
                      <SelectContent className="border-0 shadow-xl">
                        <SelectItem value="none">Unassigned</SelectItem>
                        {engineers.map(e => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name} ({e.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">If set, all expenses will auto-assign to this engineer.</p>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="password" className="text-sm font-medium text-gray-700">Permanent Password *</Label>
                    <div className="flex gap-3">
                      <div className="relative flex-1 group">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={formData.password}
                          onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="Enter permanent password (min 8 characters)"
                          className={`h-12 pr-20 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200 ${
                            formData.password && formData.password.length < 8 ? "border-red-300 focus:border-red-500" : ""
                          }`}
                          required
                        />
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                          {formData.password && formData.password.length >= 8 && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          {formData.password && (
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                              aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={generatePassword}
                        className="h-12 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate
                      </Button>
                    </div>
                    {formData.password && formData.password.length < 8 && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Password must be at least 8 characters long
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      This password will be the user's final password
                    </p>
                  </div>
                </div>
              </div>

              {/* Information Cards */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Role Permissions
                  </h4>
                  <div className="space-y-2 text-sm text-blue-800">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span><strong>Employee:</strong> Create and submit expense claims</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span><strong>Engineer:</strong> Review and verify assigned expenses</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span><strong>Admin:</strong> Full system access and user management</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-6 rounded-xl border border-emerald-200">
                  <h4 className="font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Account Creation Process
                  </h4>
                  <div className="space-y-2 text-sm text-emerald-800">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                      <span>Password must be at least 8 characters</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                      <span>User receives confirmation email</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                      <span>Account activated after email confirmation</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <Button 
                  type="submit" 
                  className="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02]"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Creating User...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-5 w-5" />
                      Create User Account
                    </div>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Guidelines Card */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50 p-6">
            <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-600" />
              User Creation Guidelines
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  Security Requirements
                </h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Passwords must be at least 8 characters long</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Email addresses must be unique and valid</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Only administrators can create user accounts</span>
                  </li>
                </ul>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-green-600" />
                  Account Management
                </h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                    <span>User roles can be modified after account creation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                    <span>Accounts can be deactivated if needed</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                    <span>All user actions are logged for audit purposes</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      {/* Details Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>User Details</SheetTitle>
            <SheetDescription>Profile, balance, and complete expense history</SheetDescription>
          </SheetHeader>
          {selectedUser && (
            <div className="space-y-6 py-4">
              <div>
                <div className="text-lg font-semibold">{selectedUser.name}</div>
                <div className="text-slate-600 text-sm">{selectedUser.email}</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                  {selectedUser.role}
                </span>
                <Separator orientation="vertical" className="h-5" />
                <div className="text-sm">Balance: <span className="font-semibold">₹{Number(selectedUser.balance ?? 0).toFixed(2)}</span></div>
              </div>

              <Separator />

              <div>
                <div className="text-base font-semibold mb-3">Expenses</div>
                {expensesLoading ? (
                  <div className="text-sm text-slate-600">Loading expenses...</div>
                ) : expenses.length === 0 ? (
                  <div className="text-sm text-slate-600">No expenses found</div>
                ) : (
                  <div className="space-y-3">
                    {expenses.map((e) => (
                      <div key={e.id} className="p-3 rounded border bg-white">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{e.title || "Untitled"}</div>
                          <div className="text-sm">₹{Number(e.total_amount ?? 0).toFixed(2)}</div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-600 mt-1">
                          <div>Category: {e.category || "-"}</div>
                          <div>Status: {e.status}</div>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Created: {new Date(e.created_at).toLocaleString()} {e.updated_at ? `• Updated: ${new Date(e.updated_at).toLocaleString()}` : ""}
                        </div>

                        {/* History timeline */}
                        {logsByExpense[e.id] && logsByExpense[e.id].length > 0 && (
                          <div className="mt-3 border-t pt-2 space-y-1">
                            {logsByExpense[e.id].map((log) => (
                              <div key={log.created_at + log.action} className="text-xs flex items-center justify-between">
                                <div className="text-slate-600">{log.action.replaceAll("_", " ")}</div>
                                <div className="text-slate-500">{new Date(log.created_at).toLocaleString()}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Balance deductions (from approvals) */}
              <div>
                <div className="text-base font-semibold mb-3">Balance Deductions</div>
                {deductions.length === 0 ? (
                  <div className="text-sm text-slate-600">No deductions recorded</div>
                ) : (
                  <div className="space-y-2">
                    {deductions.map((d) => (
                      <div key={d.expense_id + d.at} className="p-3 rounded border bg-white text-sm">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{d.title}</div>
                          <div className="font-semibold">-₹{Number(d.amount ?? 0).toFixed(2)}</div>
                        </div>
                        <div className="text-xs text-slate-500">{new Date(d.at).toLocaleString()}</div>
                        {d.comment ? (
                          <div className="text-xs text-slate-600 mt-1">{d.comment}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information and role</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role *</Label>
              <Select
                value={editFormData.role}
                onValueChange={(value: "admin" | "engineer" | "employee" | "cashier") => 
                  setEditFormData(prev => ({ ...prev, role: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="engineer">Engineer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editFormData.role === "employee" && (
              <div className="space-y-2">
                <Label htmlFor="edit-engineer">Assign Engineer</Label>
                <Select
                  value={editFormData.reportingEngineerId}
                  onValueChange={(value) => setEditFormData(prev => ({ ...prev, reportingEngineerId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select engineer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {engineers.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} ({e.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateUser} disabled={updating}>
              {updating ? "Updating..." : "Update User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {userToDelete?.name} ({userToDelete?.email}) from the system. 
              This action cannot be undone. All associated expenses and data will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}