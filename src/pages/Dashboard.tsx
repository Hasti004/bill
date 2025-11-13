import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Coins, Clock, CheckCircle, XCircle, TrendingUp, Users, Receipt, Wallet, Bell, CheckCircle as CheckCircleIcon, XCircle as XCircleIcon, AlertCircle, ArrowRight } from "lucide-react";
import { formatINR } from "@/lib/format";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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

interface Notification {
  id: string;
  type: "expense_submitted" | "expense_approved" | "expense_rejected" | "expense_assigned" | "expense_verified" | "balance_added";
  title: string;
  message: string;
  expense_id: string | null;
  expense_title?: string;
  created_at: string;
  read: boolean;
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchNotifications();
      const cleanup = setupRealtimeSubscription();
      return cleanup;
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

  const fetchNotifications = async () => {
    try {
      if (!user?.id) return;

      // Fetch 2 most recent notifications
      const { data: notificationsData, error: notificationsError } = await supabase
        .from("notifications")
        .select(`
          *,
          expenses(title)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(2);

      if (notificationsError) throw notificationsError;

      // Convert to notification format
      const notificationData = (notificationsData || []).map(notif => ({
        id: notif.id,
        type: notif.type as Notification["type"],
        title: notif.title,
        message: notif.message,
        expense_id: notif.expense_id || null,
        expense_title: notif.expenses?.title || "",
        created_at: notif.created_at,
        read: notif.read,
      }));

      setNotifications(notificationData);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const setupRealtimeSubscription = () => {
    if (!user?.id) return;

    const channel = supabase
      .channel('dashboard-notifications')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, 
        () => {
          fetchNotifications();
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "expense_approved":
      case "balance_added":
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case "expense_rejected":
        return <XCircleIcon className="h-5 w-5 text-red-600" />;
      case "expense_submitted":
      case "expense_assigned":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "expense_verified":
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      default:
        return <Bell className="h-5 w-5 text-gray-600" />;
    }
  };

  const getNotificationBgColor = (type: Notification["type"]) => {
    switch (type) {
      case "expense_approved":
      case "balance_added":
        return "bg-green-50 border-green-200";
      case "expense_rejected":
        return "bg-red-50 border-red-200";
      case "expense_submitted":
      case "expense_assigned":
        return "bg-blue-50 border-blue-200";
      case "expense_verified":
        return "bg-yellow-50 border-yellow-200";
      default:
        return "bg-white border-gray-200";
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.expense_id) {
      navigate(`/expenses/${notification.expense_id}`);
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
      icon: Coins,
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
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {(userRole === "employee" || userRole === "admin" || userRole === "engineer") && (
            <Button 
              onClick={() => navigate("/expenses/new")}
              className="w-full sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          )}
          {userRole === "engineer" && (
            <Button 
              onClick={() => navigate("/review")}
              className="w-full sm:w-auto"
              variant="outline"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve Expense
            </Button>
          )}
          {(userRole === "admin" || userRole === "cashier") && (
            <Button 
              onClick={() => navigate("/balances")}
              className="w-full sm:w-auto"
              variant="outline"
            >
              <Wallet className="mr-2 h-4 w-4" />
              Add Balance
            </Button>
          )}
        </div>
      </div>

      {/* Mobile-optimized Stats Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
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
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6 pt-4 sm:pt-6 gap-2">
                <CardTitle className={`text-xs sm:text-sm font-medium truncate flex-1 min-w-0 ${
                  card.highlight 
                    ? isPendingReviews || isPendingApprovals ? 'text-blue-700' : 'text-green-700'
                    : ''
                }`}>
                  {card.title}
                </CardTitle>
                <Icon 
                  className={`h-4 w-4 flex-shrink-0 ml-1 ${
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
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 overflow-hidden">
                <div className={`text-xl sm:text-2xl font-bold whitespace-nowrap overflow-hidden text-ellipsis ${
                  card.highlight 
                    ? isPendingReviews || isPendingApprovals ? 'text-blue-800' : 'text-green-800'
                    : card.title === "Current Balance" && typeof card.value === 'string' && card.value.includes('-')
                    ? 'text-red-600'
                    : ''
                }`}>
                  {card.value}
                </div>
                <p className={`text-xs mt-1 truncate ${
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

      {/* Live Notifications Section */}
      <Card>
        <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Live Notifications
          </CardTitle>
          <CardDescription className="text-sm">Your most recent notifications</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No notifications yet. You'll see your latest notifications here.
            </p>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={cn(
                    "cursor-pointer hover:shadow-md transition-all",
                    getNotificationBgColor(notification.type),
                    !notification.read && "ring-2 ring-blue-400"
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm text-gray-900 truncate">
                                {notification.title}
                              </h4>
                              {!notification.read && (
                                <span className="h-2 w-2 bg-blue-600 rounded-full flex-shrink-0"></span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-2">
                              {format(new Date(notification.created_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                          {notification.expense_id && (
                            <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {notifications.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <Button
                variant="link"
                className="p-0 h-auto text-sm w-full justify-center"
                onClick={() => navigate("/notifications")}
              >
                View All Notifications
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
