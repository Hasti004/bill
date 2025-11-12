import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Receipt, 
  CheckCircle, 
  XCircle, 
  Clock, 
  DollarSign,
  Eye,
  FileText,
  User,
  Search,
  Calendar
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExpenseService } from "@/services/ExpenseService";
import { format, subDays, subMonths, subYears } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { formatINR } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

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
  purpose?: string;
  admin_comment?: string;
}

// Local state for image preview

interface LineItem {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
}

interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  file_url: string;
  created_at: string;
}

export default function EngineerReview() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [engineerComment, setEngineerComment] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [engineerApprovalLimit, setEngineerApprovalLimit] = useState<number>(50000);
  const [timePeriod, setTimePeriod] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("desc");
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    if (userRole === "engineer") {
      fetchEngineerApprovalLimit();
    }
  }, [userRole, user]);

  useEffect(() => {
    if (userRole === "engineer") {
      fetchAssignedExpenses();
    }
  }, [userRole, user, timePeriod]);

  useEffect(() => {
    // Apply filters when any filter changes
    applyFilters(allExpenses);
  }, [searchTerm, statusFilter, sortOrder, allExpenses]);

  const fetchEngineerApprovalLimit = async () => {
    try {
      // @ts-ignore - settings table exists but not in types
      const { data, error } = await (supabase as any)
        .from("settings")
        .select("value")
        .eq("key", "engineer_approval_limit")
        .maybeSingle();

      if (error) {
        console.error("Error fetching approval limit:", error);
        console.error("Error details:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        // Use default if there's an error
        setEngineerApprovalLimit(50000);
        return;
      }

      if (data) {
        const limitValue = parseFloat((data as any).value);
        if (isNaN(limitValue)) {
          console.error("Invalid limit value:", (data as any).value);
          setEngineerApprovalLimit(50000);
        } else {
          setEngineerApprovalLimit(limitValue);
          console.log("Engineer approval limit loaded:", limitValue);
        }
      } else {
        console.warn("No limit data found, using default 50000");
        setEngineerApprovalLimit(50000);
      }
    } catch (error) {
      console.error("Error fetching approval limit:", error);
      setEngineerApprovalLimit(50000);
    }
  };

  const fetchAssignedExpenses = async () => {
    try {
      setLoading(true);
      
      // Calculate date filter based on time period
      let dateFilter: Date | null = null;
      if (timePeriod === "week") {
        dateFilter = subDays(new Date(), 7);
      } else if (timePeriod === "month") {
        dateFilter = subMonths(new Date(), 1);
      } else if (timePeriod === "year") {
        dateFilter = subYears(new Date(), 1);
      }

      // Build query - include all statuses (submitted, verified, approved, rejected)
      let query = supabase
        .from("expenses")
        .select("*")
        .eq("assigned_engineer_id", user?.id)
        .in("status", ["submitted", "verified", "approved", "rejected"]);

      // Apply date filter if time period is selected
      if (dateFilter) {
        query = query.gte("created_at", dateFilter.toISOString());
      }

      const { data: expenses, error: expensesError } = await query
        .order("created_at", { ascending: false });

      if (expensesError) throw expensesError;

      // Fetch expenses rejected by this engineer from audit_logs
      const { data: rejectedLogs, error: rejectedLogsError } = await supabase
        .from("audit_logs")
        .select("expense_id")
        .eq("user_id", user?.id)
        .eq("action", "expense_rejected");

      if (rejectedLogsError) {
        console.error("Error fetching rejected expenses logs:", rejectedLogsError);
      }

      let rejectedExpenseIds: string[] = [];
      if (rejectedLogs && rejectedLogs.length > 0) {
        rejectedExpenseIds = rejectedLogs.map(log => log.expense_id);
      }

      // Fetch rejected expenses that were rejected by this engineer
      let rejectedExpenses: any[] = [];
      if (rejectedExpenseIds.length > 0) {
        let rejectedQuery = supabase
          .from("expenses")
          .select("*")
          .eq("assigned_engineer_id", user?.id)
          .eq("status", "rejected")
          .in("id", rejectedExpenseIds);

        if (dateFilter) {
          rejectedQuery = rejectedQuery.gte("created_at", dateFilter.toISOString());
        }

        const { data: rejectedData, error: rejectedError } = await rejectedQuery
          .order("created_at", { ascending: false });

        if (!rejectedError && rejectedData) {
          rejectedExpenses = rejectedData;
        }
      }

      // Combine all expenses (submitted, verified, approved, and rejected by this engineer)
      const allExpensesData = [...(expenses || []), ...rejectedExpenses];
      
      // Remove duplicates
      const uniqueExpenses = Array.from(
        new Map(allExpensesData.map(exp => [exp.id, exp])).values()
      );

      if (uniqueExpenses.length === 0) {
        setAllExpenses([]);
        setExpenses([]);
        return;
      }

      // 2) Fetch related profiles separately and merge client-side
      const userIds = [...new Set(uniqueExpenses.map(e => e.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const merged = uniqueExpenses.map(expense => {
        const profile = profiles?.find(p => p.user_id === expense.user_id);
        return {
          ...expense,
          user_name: profile?.name || "Unknown User",
          user_email: profile?.email || "unknown@example.com",
          total_amount: Number(expense.total_amount)
        } as any;
      });

      setAllExpenses(merged);
      
      // Apply search filter
      applyFilters(merged);
    } catch (error) {
      console.error("Error fetching assigned expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (expensesList: Expense[]) => {
    let filtered = expensesList;

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(exp => 
        exp.title?.toLowerCase().includes(search) ||
        exp.destination?.toLowerCase().includes(search) ||
        exp.user_name?.toLowerCase().includes(search) ||
        exp.user_email?.toLowerCase().includes(search) ||
        exp.total_amount?.toString().includes(search)
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(exp => exp.status === statusFilter);
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    setExpenses(filtered);
  };

  const fetchExpenseDetails = async (expenseId: string) => {
    try {
      // Fetch line items
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from("expense_line_items")
        .select("*")
        .eq("expense_id", expenseId)
        .order("date");

      if (lineItemsError) throw lineItemsError;

      // Fetch attachments
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from("attachments")
        .select("*")
        .eq("expense_id", expenseId)
        .order("created_at");

      if (attachmentsError) throw attachmentsError;

      setLineItems(lineItemsData || []);
      setAttachments(attachmentsData || []);
    } catch (error) {
      console.error("Error fetching expense details:", error);
    }
  };

  const verifyExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      setReviewLoading(true);

      await ExpenseService.verifyExpense(
        selectedExpense.id, 
        user.id, 
        engineerComment
      );

      toast({
        title: "Success",
        description: "Expense verified successfully",
      });

      setSelectedExpense(null);
      setEngineerComment("");
      setLineItems([]);
      setAttachments([]);
      fetchAssignedExpenses();
    } catch (error: any) {
      console.error("Error verifying expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to verify expense",
      });
    } finally {
      setReviewLoading(false);
    }
  };

  const approveExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      setReviewLoading(true);

      // Use ExpenseService to approve (this handles balance deduction)
      await ExpenseService.approveExpense(selectedExpense.id, user.id, engineerComment);

      toast({
        title: "Expense Approved",
        description: `Expense approved and ₹${selectedExpense.total_amount} deducted from employee balance.`,
      });

      setSelectedExpense(null);
      setEngineerComment("");
      setLineItems([]);
      setAttachments([]);
      fetchAssignedExpenses();
    } catch (error: any) {
      console.error("Error approving expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve expense",
      });
    } finally {
      setReviewLoading(false);
    }
  };

  const rejectExpense = async () => {
    if (!selectedExpense || !user) return;

    try {
      setReviewLoading(true);

      await ExpenseService.rejectExpense(selectedExpense.id, user.id, engineerComment);

      toast({
        title: "Expense Rejected",
        description: "Expense has been rejected successfully",
      });

      setSelectedExpense(null);
      setEngineerComment("");
      setLineItems([]);
      setAttachments([]);
      fetchAssignedExpenses();
    } catch (error: any) {
      console.error("Error rejecting expense:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reject expense",
      });
    } finally {
      setReviewLoading(false);
    }
  };

  const isActionDisabled = (exp?: Expense | null) => {
    if (!exp) return true;
    // Allow action on "submitted" expenses (engineers can verify, approve, or reject)
    // Disable action if already "approved" or "rejected"
    if (exp.status === "approved") return true;
    if (exp.status === "rejected") return true;
    if (exp.status === "verified" && Number(exp.total_amount) >= Number(engineerApprovalLimit)) return true;
    return false;
  };

  const getStats = () => {
    const totalAssigned = allExpenses.length;
    const pendingReview = allExpenses.filter(e => e.status === "submitted").length;
    const verified = allExpenses.filter(e => e.status === "verified").length;
    const approved = allExpenses.filter(e => e.status === "approved").length;
    const totalAmount = allExpenses.reduce((sum, e) => sum + e.total_amount, 0);

    return {
      totalAssigned,
      pendingReview,
      verified,
      approved,
      totalAmount
    };
  };

  const stats = getStats();

  if (userRole !== "engineer") {
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expense Review</h1>
          <p className="text-muted-foreground">
            Review and verify assigned expense submissions
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned to Me</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAssigned}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingReview}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.verified}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(stats.totalAmount)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Assigned Expenses</CardTitle>
          <CardDescription>Review and verify expense submissions assigned to you</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search and Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by title or destination..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Status Filter */}
            <div className="w-full sm:w-40">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Sorter */}
            <div className="w-full sm:w-40">
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger>
                  <SelectValue placeholder="Date Created" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Date Created (Newest)</SelectItem>
                  <SelectItem value="asc">Date Created (Oldest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Time Period Dropdown */}
            <div className="w-full sm:w-40">
              <Select value={timePeriod} onValueChange={setTimePeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="week">Past Week</SelectItem>
                  <SelectItem value="month">Past Month</SelectItem>
                  <SelectItem value="year">Past Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No assigned expenses</h3>
              <p className="text-muted-foreground">
                You don't have any expenses assigned for review at the moment.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
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
                      <StatusBadge status={expense.status as any} />
                    </TableCell>
                    <TableCell>
                      {format(new Date(expense.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      {expense.status === "approved" || expense.status === "rejected" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          title={expense.status === "approved" ? "Expense is already approved" : "Expense is rejected"}
                        >
                          <Eye className="h-4 w-4 opacity-50" />
                        </Button>
                      ) : (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                setSelectedExpense(expense);
                                fetchExpenseDetails(expense.id);
                                // Refresh the approval limit to get the latest value from admin settings
                                await fetchEngineerApprovalLimit();
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Expense Review</DialogTitle>
                            <DialogDescription>
                              Review expense details and verify the submission
                            </DialogDescription>
                          </DialogHeader>
                          
                          {selectedExpense && (
                            <div className="space-y-6">
                              {/* Basic Info */}
                              <div className="grid grid-cols-2 gap-4">
                                <Card>
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Employee Information</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium">{selectedExpense.user_name}</span>
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        {selectedExpense.user_email}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>

                                <Card>
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Expense Summary</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-lg font-semibold">
                                          {formatINR(selectedExpense.total_amount)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <StatusBadge status={selectedExpense.status as any} />
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>

                              {/* Trip Details */}
                              <Card>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-base">Trip Details</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
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
                                      <label className="text-sm font-medium">Start Date</label>
                                      <p className="text-sm">{format(new Date(selectedExpense.trip_start), "MMM d, yyyy")}</p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium">End Date</label>
                                      <p className="text-sm">{format(new Date(selectedExpense.trip_end), "MMM d, yyyy")}</p>
                                    </div>
                                  </div>
                                  {selectedExpense.purpose && (
                                    <div>
                                      <label className="text-sm font-medium">Purpose</label>
                                      <p className="text-sm">{selectedExpense.purpose}</p>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Line Items */}
                              <Card>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-base flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Expense Line Items
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  {lineItems.length === 0 ? (
                                    <p className="text-muted-foreground">No line items found</p>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Date</TableHead>
                                          <TableHead>Category</TableHead>
                                          <TableHead>Description</TableHead>
                                          <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {lineItems.map((item) => (
                                          <TableRow key={item.id}>
                                            <TableCell>
                                              {format(new Date(item.date), "MMM d, yyyy")}
                                            </TableCell>
                                            <TableCell>
                                              <Badge variant="outline" className="capitalize">
                                                {item.category}
                                              </Badge>
                                            </TableCell>
                                            <TableCell>{item.description}</TableCell>
                                            <TableCell className="text-right">
                                              {formatINR(item.amount)}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Attachments */}
                              {attachments.length > 0 && (
                                <Card>
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Receipts & Attachments</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      {attachments.map((attachment) => (
                                        <div
                                          key={attachment.id}
                                          className="flex items-center justify-between p-3 border rounded-lg"
                                        >
                                          <div className="flex items-center gap-3">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                              <p className="font-medium text-sm">{attachment.filename}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {attachment.content_type} • {format(new Date(attachment.created_at), "MMM d, yyyy")}
                                              </p>
                                            </div>
                                          </div>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              setImagePreviewUrl(attachment.file_url);
                                              setImagePreviewOpen(true);
                                            }}
                                          >
                                            View
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              )}

                              {/* Admin Comments */}
                              {selectedExpense.admin_comment && (
                                <Card>
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Admin Comments</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <p className="text-sm">{selectedExpense.admin_comment}</p>
                                  </CardContent>
                                </Card>
                              )}

                              {/* Engineer Review */}
                              <Card>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-base">Engineer Review</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                  <div>
                                    <label className="text-sm font-medium">Review Comment</label>
                                    <Textarea
                                      value={engineerComment}
                                      onChange={(e) => setEngineerComment(e.target.value)}
                                      placeholder="Add your review comments..."
                                      className="mt-1"
                                    />
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          )}

                          <DialogFooter className="gap-2">
                            <Button 
                              variant="outline" 
                              onClick={() => {
                                setSelectedExpense(null);
                                setEngineerComment("");
                                setLineItems([]);
                                setAttachments([]);
                              }}
                            >
                              Cancel
                            </Button>
                            {selectedExpense && (() => {
                              // Don't show any action buttons for rejected expenses
                              if (selectedExpense.status === "rejected") {
                                return null;
                              }
                              
                              const expenseAmount = Number(selectedExpense.total_amount);
                              const limit = Number(engineerApprovalLimit);
                              const canTakeAction = !isActionDisabled(selectedExpense);
                              
                              // If expense amount <= limit: Show Approve and Reject buttons
                              // If expense amount > limit: Show Verify and Reject buttons
                              if (expenseAmount <= limit) {
                                return (
                                  <>
                                    <Button 
                                      onClick={() => rejectExpense()}
                                      disabled={reviewLoading || !canTakeAction}
                                      variant="destructive"
                                    >
                                      Reject
                                    </Button>
                                    <Button 
                                      onClick={() => approveExpense()}
                                      disabled={reviewLoading || !canTakeAction}
                                    >
                                      Approve
                                    </Button>
                                  </>
                                );
                              } else {
                                return (
                                  <>
                                    <Button 
                                      onClick={() => rejectExpense()}
                                      disabled={reviewLoading || !canTakeAction}
                                      variant="destructive"
                                    >
                                      Reject
                                    </Button>
                                    <Button 
                                      onClick={() => verifyExpense()}
                                      disabled={reviewLoading || !canTakeAction}
                                      className="bg-blue-500 hover:bg-blue-600"
                                    >
                                      Verify
                                    </Button>
                                  </>
                                );
                              }
                            })()}
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      )}
                      {/* Image Preview Dialog */}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
