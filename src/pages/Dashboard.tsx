import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, DollarSign, Clock, CheckCircle, XCircle, TrendingUp, Users, Receipt, Wallet } from "lucide-react";
import { formatINR } from "@/lib/format";
import { useNavigate } from "react-router-dom";

interface DashboardStats {
  totalExpenses: number;
  pendingAmount: number;
  approvedAmount: number;
  currentBalance: number;
  pendingReviews?: number;
  pendingReviewsAmount?: number;
  pendingApprovals?: number;
  pendingApprovalsAmount?: number;
}

export default function Dashboard() {
  const { user, userRole } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalExpenses: 0,
    pendingAmount: 0,
    approvedAmount: 0,
    currentBalance: 0,
    pendingReviews: 0,
    pendingReviewsAmount: 0,
    pendingApprovals: 0,
    pendingApprovalsAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user, userRole]);

  const fetchStats = async () => {
    try {
      // Fetch expenses for the user
      const { data: expenses, error: expensesError } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user?.id);

      if (expensesError) throw expensesError;

      // Fetch user profile for balance
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("balance")
        .eq("user_id", user?.id)
        .single();

      if (profileError) throw profileError;

      // For engineers, fetch expenses assigned to them that need review
      // Using the same logic as EngineerReview page - only count "submitted" status for pending reviews
      let pendingReviews = 0;
      let pendingReviewsAmount = 0;
      
      if (userRole === "engineer" && user?.id) {
        const { data: assignedExpenses, error: assignedError } = await supabase
          .from("expenses")
          .select("*")
          .eq("assigned_engineer_id", user.id)
          .eq("status", "submitted"); // Only "submitted" status counts as pending review

        if (assignedError) {
          console.error("Error fetching assigned expenses:", assignedError);
        } else {
          // Filter to only count "submitted" expenses (same as EngineerReview page)
          const pendingExpenses = assignedExpenses?.filter(e => e.status === "submitted") || [];
          pendingReviews = pendingExpenses.length;
          pendingReviewsAmount = pendingExpenses.reduce(
            (sum, e) => sum + Number(e.total_amount || 0),
            0
          );
        }
      }

      // For admins, fetch expenses that need approval
      // This includes: submitted expenses with no engineer assigned, and verified expenses
      let pendingApprovals = 0;
      let pendingApprovalsAmount = 0;
      
      if (userRole === "admin") {
        // Fetch expenses that need admin approval:
        // 1. Verified expenses (need admin approval)
        const { data: verifiedExpenses, error: verifiedError } = await supabase
          .from("expenses")
          .select("*")
          .eq("status", "verified");

        // 2. Submitted expenses with no assigned engineer (go directly to admin)
        const { data: submittedExpenses, error: submittedError } = await supabase
          .from("expenses")
          .select("*")
          .eq("status", "submitted")
          .is("assigned_engineer_id", null);

        if (verifiedError || submittedError) {
          console.error("Error fetching pending approvals:", verifiedError || submittedError);
        } else {
          // Combine both types of expenses
          const allPendingExpenses = [
            ...(verifiedExpenses || []),
            ...(submittedExpenses || [])
          ];
          
          // Deduplicate by expense ID
          const uniqueExpenses = Array.from(
            new Map(allPendingExpenses.map(exp => [exp.id, exp])).values()
          );
          
          pendingApprovals = uniqueExpenses.length;
          pendingApprovalsAmount = uniqueExpenses.reduce(
            (sum, e) => sum + Number(e.total_amount || 0),
            0
          );
        }
      }

      const stats: DashboardStats = {
        totalExpenses: expenses.length,
        pendingAmount: expenses
          .filter((e) => ["submitted", "verified"].includes(e.status))
          .reduce((sum, e) => sum + Number(e.total_amount), 0),
        approvedAmount: expenses
          .filter((e) => e.status === "approved")
          .reduce((sum, e) => sum + Number(e.total_amount), 0),
        currentBalance: profile?.balance ?? 0,
        pendingReviews,
        pendingReviewsAmount,
        pendingApprovals,
        pendingApprovalsAmount,
      };

      setStats(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards: Array<{
    title: string;
    value: string | number;
    icon: any;
    description: string;
    highlight: boolean;
    onClick?: () => void;
  }> = [
    {
      title: "Current Balance",
      value: formatINR(stats.currentBalance),
      icon: Wallet,
      description: "Available balance",
      highlight: true,
    },
    {
      title: "Total Expenses",
      value: stats.totalExpenses,
      icon: DollarSign,
      description: "All time expenses",
      highlight: false,
    },
    ...(userRole === "engineer" && stats.pendingReviews !== undefined
      ? [
          {
            title: "Pending Reviews",
            value: stats.pendingReviews,
            icon: Clock,
            description: `${formatINR(stats.pendingReviewsAmount || 0)} to review`,
            highlight: stats.pendingReviews > 0,
            onClick: () => navigate("/review"),
          },
        ]
      : []),
    ...(userRole === "admin" && stats.pendingApprovals !== undefined
      ? [
          {
            title: "Pending Approvals",
            value: stats.pendingApprovals,
            icon: Clock,
            description: `${formatINR(stats.pendingApprovalsAmount || 0)} to approve`,
            highlight: stats.pendingApprovals > 0,
            onClick: () => navigate("/admin/expenses"),
          },
        ]
      : []),
    {
      title: "Pending Amount",
      value: formatINR(stats.pendingAmount),
      icon: Clock,
      description: "Awaiting approval",
      highlight: false,
    },
    {
      title: "Approved Amount",
      value: formatINR(stats.approvedAmount),
      icon: CheckCircle,
      description: "Approved expenses",
      highlight: false,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Welcome back! Here's an overview of your expenses.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-2 text-gray-600">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Mobile-optimized Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Welcome back! Here's an overview of your expenses.
          </p>
        </div>
        {(userRole === "employee" || userRole === "admin") && (
          <Button 
            onClick={() => navigate("/expenses/new")}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Expense
          </Button>
        )}
      </div>

      {/* Mobile-optimized Stats Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          const isPendingReviews = card.title === "Pending Reviews";
          const isPendingApprovals = card.title === "Pending Approvals";
          return (
            <Card 
              key={card.title} 
              className={`hover:shadow-md transition-all ${
                card.onClick ? 'cursor-pointer hover:scale-[1.02]' : ''
              } ${
                card.highlight 
                  ? isPendingReviews || isPendingApprovals
                    ? 'border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50'
                    : 'border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50'
                  : ''
              }`}
              onClick={card.onClick}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
                <CardTitle className={`text-xs sm:text-sm font-medium truncate ${
                  card.highlight 
                    ? isPendingReviews || isPendingApprovals ? 'text-blue-700' : 'text-green-700'
                    : ''
                }`}>
                  {card.title}
                </CardTitle>
                <Icon 
                  className={`h-4 w-4 flex-shrink-0 ${
                    card.highlight 
                      ? isPendingReviews || isPendingApprovals ? 'text-blue-600' : 'text-green-600'
                      : 'text-muted-foreground'
                  } ${card.onClick ? 'cursor-pointer' : ''}`}
                  onClick={(e) => {
                    if (card.onClick) {
                      e.stopPropagation();
                      card.onClick();
                    }
                  }}
                />
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
                <div className={`text-xl sm:text-2xl font-bold ${
                  card.highlight 
                    ? isPendingReviews || isPendingApprovals ? 'text-blue-800' : 'text-green-800'
                    : ''
                }`}>
                  {card.value}
                </div>
                <p className={`text-xs mt-1 ${
                  card.highlight 
                    ? isPendingReviews || isPendingApprovals ? 'text-blue-600' : 'text-green-600'
                    : 'text-muted-foreground'
                }`}>
                  {card.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Mobile-optimized Recent Activity */}
      <Card>
        <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <CardTitle className="text-lg sm:text-xl">Recent Activity</CardTitle>
          <CardDescription className="text-sm">Your latest expense submissions</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <p className="text-sm text-muted-foreground">
            View your recent expenses in the{" "}
            <Button
              variant="link"
              className="p-0 h-auto text-sm"
              onClick={() => navigate("/expenses")}
            >
              My Expenses
            </Button>{" "}
            section.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
