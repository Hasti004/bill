import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, Download, ArrowLeft, MoreVertical, Eye, Edit } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { formatINR } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Expense {
  id: string;
  title: string;
  destination: string;
  trip_start: string;
  trip_end: string;
  status: string;
  total_amount: number;
  created_at: string;
}

export default function Expenses() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [returnMoneyDialogOpen, setReturnMoneyDialogOpen] = useState(false);
  const [returnAmount, setReturnAmount] = useState("");
  const [returningMoney, setReturningMoney] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      fetchExpenses();
      fetchUserBalance();
    }
  }, [user]);

  const fetchUserBalance = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("balance")
        .eq("user_id", user?.id)
        .single();

      if (error) throw error;
      setUserBalance(data?.balance ?? 0);
    } catch (error) {
      console.error("Error fetching user balance:", error);
    }
  };

  useEffect(() => {
    filterAndSortExpenses();
  }, [expenses, searchTerm, statusFilter, sortBy, sortOrder]);

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortExpenses = () => {
    let filtered = [...expenses];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(expense =>
        expense.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.destination.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(expense => expense.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case "title":
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case "destination":
          aValue = a.destination.toLowerCase();
          bValue = b.destination.toLowerCase();
          break;
        case "total_amount":
          aValue = a.total_amount;
          bValue = b.total_amount;
          break;
        case "created_at":
        default:
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
      }

      if (sortOrder === "asc") {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    setFilteredExpenses(filtered);
  };

  // Helper function to escape CSV values
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    // If value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportExpenses = () => {
    const csvContent = [
      ["Title", "Destination", "Start Date", "End Date", "Amount (INR)", "Status", "Created Date"],
      ...filteredExpenses.map(expense => [
        escapeCSV(expense.title),
        escapeCSV(expense.destination),
        format(new Date(expense.trip_start), "yyyy-MM-dd"),
        format(new Date(expense.trip_end), "yyyy-MM-dd"),
        Number(expense.total_amount).toFixed(2), // Raw number without formatting
        escapeCSV(expense.status),
        format(new Date(expense.created_at), "yyyy-MM-dd")
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleReturnMoney = async () => {
    if (!user || !userRole || userBalance === null) return;

    const amount = parseFloat(returnAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0",
      });
      return;
    }

    if (amount > userBalance) {
      toast({
        variant: "destructive",
        title: "Insufficient Balance",
        description: `You only have ${formatINR(userBalance)}. Cannot return ${formatINR(amount)}`,
      });
      return;
    }

    try {
      setReturningMoney(true);

      // Determine target role and find target user
      let targetRole: "cashier" | "admin" | null = null;
      let targetUserId: string | null = null;

      if (userRole === "engineer" || userRole === "employee") {
        targetRole = "cashier";
        
        // Find the original cashier who assigned money to this employee
        // Using FIFO (First In First Out) - return to the cashier who first assigned money
        const { data: originalCashierId, error: assignmentError } = await supabase
          .rpc('get_original_cashier', { recipient_user_id: user.id });

        if (!assignmentError && originalCashierId) {
          // Found the original cashier
          targetUserId = originalCashierId as string;
          console.log('Found original cashier for return:', targetUserId);
        } else {
          console.warn('Could not find original cashier, falling back to any cashier:', assignmentError);
          // Fallback: Find any cashier if no assignment record exists
          const { data: targetRoles, error: rolesError } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", targetRole)
            .limit(1);

          if (rolesError) {
            console.error("Error finding target role:", rolesError);
            if (rolesError.message?.includes("permission") || rolesError.message?.includes("policy")) {
              throw new Error(`Permission denied. Please ensure the database migration for return money feature has been applied.`);
            }
            throw rolesError;
          }

          if (!targetRoles || targetRoles.length === 0) {
            throw new Error(`No ${targetRole} found in the system. Please contact an administrator.`);
          }

          targetUserId = targetRoles[0].user_id;
        }
      } else if (userRole === "cashier") {
        targetRole = "admin";
        
        // For cashier returning to admin, find any admin
        const { data: targetRoles, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", targetRole)
          .limit(1);

        if (rolesError) {
          console.error("Error finding target role:", rolesError);
          if (rolesError.message?.includes("permission") || rolesError.message?.includes("policy")) {
            throw new Error(`Permission denied. Please ensure the database migration for return money feature has been applied.`);
          }
          throw rolesError;
        }

        if (!targetRoles || targetRoles.length === 0) {
          throw new Error(`No ${targetRole} found in the system. Please contact an administrator.`);
        }

        targetUserId = targetRoles[0].user_id;
      }

      if (!targetRole || !targetUserId) {
        throw new Error("Invalid role for returning money or target user not found");
      }

      // Get target user's current balance
      const { data: targetProfile, error: targetError } = await supabase
        .from("profiles")
        .select("balance, name")
        .eq("user_id", targetUserId)
        .single();

      if (targetError) throw targetError;

      // Deduct from current user's balance
      const newUserBalance = userBalance - amount;
      const { error: userBalanceError } = await supabase
        .from("profiles")
        .update({ balance: newUserBalance })
        .eq("user_id", user.id);

      if (userBalanceError) throw userBalanceError;

      // Add to target user's balance
      const newTargetBalance = (targetProfile.balance || 0) + amount;
      const { error: targetBalanceError } = await supabase
        .from("profiles")
        .update({ balance: newTargetBalance })
        .eq("user_id", targetUserId);

      if (targetBalanceError) throw targetBalanceError;

      // Mark the money assignment as returned if employee/engineer is returning to cashier
      if ((userRole === "engineer" || userRole === "employee") && targetRole === "cashier") {
        // Find and mark the oldest unreturned assignment(s) as returned
        // We'll mark assignments totaling the returned amount (FIFO)
        let remainingAmount = amount;
        
        const { data: assignments, error: assignmentsError } = await supabase
          .from("money_assignments")
          .select("id, amount")
          .eq("recipient_id", user.id)
          .eq("cashier_id", targetUserId)
          .eq("is_returned", false)
          .order("assigned_at", { ascending: true });

        if (!assignmentsError && assignments && assignments.length > 0) {
          // Mark assignments as returned, starting from the oldest
          for (const assignment of assignments) {
            if (remainingAmount <= 0) break;
            
            const assignmentAmount = Math.min(Number(assignment.amount), remainingAmount);
            
            // Update the assignment to mark it as returned
            const { error: updateError } = await supabase
              .from("money_assignments")
              .update({
                is_returned: true,
                returned_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", assignment.id);

            if (updateError) {
              console.error('Error marking assignment as returned:', updateError);
              // Don't throw - this is tracking only, transaction already completed
            } else {
              console.log('Marked assignment as returned:', assignment.id, 'amount:', assignmentAmount);
            }
            
            remainingAmount -= assignmentAmount;
          }
        }
      }

      // Update local state
      setUserBalance(newUserBalance);
      setReturnAmount("");
      setReturnMoneyDialogOpen(false);

      toast({
        title: "Money Returned Successfully",
        description: `Returned ${formatINR(amount)} to ${targetProfile.name || targetRole}. Your new balance: ${formatINR(newUserBalance)}`,
      });
    } catch (error: any) {
      console.error("Error returning money:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to return money. Please try again.",
      });
    } finally {
      setReturningMoney(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Expenses</h1>
          <p className="text-muted-foreground">
            Manage and track your expense submissions
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {userRole === "admin" && (
            <Button variant="outline" onClick={exportExpenses}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
          <Button onClick={() => navigate("/expenses/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Add Expense
          </Button>
          {(userRole === "engineer" || userRole === "employee" || userRole === "cashier") && (
            <Dialog open={returnMoneyDialogOpen} onOpenChange={setReturnMoneyDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Return Money
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Return Money</DialogTitle>
                  <DialogDescription>
                    {userRole === "cashier" 
                      ? "Return money to admin. The amount will be deducted from your balance and added to an admin's account."
                      : "Return money to cashier. The amount will be deducted from your balance and added to a cashier's account."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="return-amount">Amount to Return (INR)</Label>
                    <Input
                      id="return-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={returnAmount}
                      onChange={(e) => setReturnAmount(e.target.value)}
                      placeholder="0.00"
                    />
                    {userBalance !== null && (
                      <p className="text-sm text-muted-foreground">
                        Your current balance: <span className="font-semibold">{formatINR(userBalance)}</span>
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReturnMoneyDialogOpen(false);
                      setReturnAmount("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleReturnMoney} disabled={returningMoney || !returnAmount}>
                    {returningMoney ? "Returning..." : "Return Money"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Search and Filter Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title or destination..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Date Created</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="destination">Destination</SelectItem>
                  <SelectItem value="total_amount">Amount</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              >
                {sortOrder === "asc" ? "↑" : "↓"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Expenses</CardTitle>
          <CardDescription>View and manage your expense claims</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="min-h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : expenses.length === 0 ? (
            <p className="text-muted-foreground">
              No expenses yet. Create your first expense claim to get started.
            </p>
          ) : filteredExpenses.length === 0 ? (
            <p className="text-muted-foreground">
              No expenses match your current filters. Try adjusting your search criteria.
            </p>
          ) : (
            <>
              <div className="mb-4 text-sm text-muted-foreground">
                Showing {filteredExpenses.length} of {expenses.length} expenses
              </div>
              <div className="overflow-x-auto">
                <Table className="table-fixed w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[20%]">Title</TableHead>
                      <TableHead className="w-[18%]">Destination</TableHead>
                      <TableHead className="w-[15%]">Date</TableHead>
                      <TableHead className="w-[12%]">Amount</TableHead>
                      <TableHead className="w-[12%]">Status</TableHead>
                      <TableHead className="w-[13%]">Created</TableHead>
                      <TableHead className="text-right w-[10%]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">{expense.title}</TableCell>
                    <TableCell>{expense.destination}</TableCell>
                    <TableCell>
                      {format(new Date(expense.trip_start), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatINR(expense.total_amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={expense.status as any} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(expense.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/expenses/${expense.id}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            {expense.status === "submitted" && (
                              <DropdownMenuItem onClick={() => navigate(`/expenses/${expense.id}/edit`)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                </TableBody>
              </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
