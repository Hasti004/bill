import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Coins, Clock, CheckCircle, XCircle, TrendingUp, Users, Receipt, Wallet, Bell, CheckCircle as CheckCircleIcon, XCircle as XCircleIcon, AlertCircle, ArrowRight, UserPlus, ArrowLeft } from "lucide-react";
import { formatINR } from "@/lib/format";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface DashboardStats {
  totalExpenses: number;
  pendingAmount: number;
  approvedAmount: number;
  currentBalance: number;
  pendingReviews?: number;
  pendingReviewsAmount?: number;
  pendingApprovals?: number;
  pendingApprovalsAmount?: number;
  totalEmployeeBalance?: number;
  totalEngineerBalance?: number;
  totalCashierBalance?: number;
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
    totalEmployeeBalance: 0,
    totalEngineerBalance: 0,
    totalCashierBalance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [returnMoneyDialogOpen, setReturnMoneyDialogOpen] = useState(false);
  const [returnAmount, setReturnAmount] = useState("");
  const [returningMoney, setReturningMoney] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchNotifications();
      if (userRole === "employee" || userRole === "engineer" || userRole === "cashier") {
        fetchUserBalance();
      }
    }
  }, [user, userRole]);

  const fetchUserBalance = async () => {
    try {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      setUserBalance(data?.balance ?? 0);
    } catch (error) {
      console.error("Error fetching user balance:", error);
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    console.log('🔄 Initializing dashboard notification subscription...');
    const cleanup = setupRealtimeSubscription();
    
    // Polling fallback - check for new notifications every 5 seconds
    // This ensures notifications appear even if realtime isn't working
    const pollInterval = setInterval(() => {
      console.log('🔄 Polling for new notifications...');
      fetchNotifications();
    }, 5000); // Poll every 5 seconds

    // Set up real-time balance subscription for employees, engineers, and cashiers
    let balanceCleanup = () => {};
    if (userRole === "employee" || userRole === "engineer" || userRole === "cashier") {
      balanceCleanup = setupBalanceRealtimeSubscription();
    }

    return () => {
      console.log('Cleaning up dashboard subscription and polling');
      cleanup();
      clearInterval(pollInterval);
      balanceCleanup();
    };
  }, [user?.id, userRole]);

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

        // Fetch total balances for employees, engineers, and cashiers (only for admin)
        let totalEmployeeBalance = 0;
        let totalEngineerBalance = 0;
        let totalCashierBalance = 0;

        try {
          // Get all user roles
          const { data: allRoles, error: rolesError } = await supabase
            .from("user_roles")
            .select("user_id, role");

          if (!rolesError && allRoles) {
            // Get all profiles with balances
            const userIds = allRoles.map(r => r.user_id);
            const { data: allProfiles, error: profilesError } = await supabase
              .from("profiles")
              .select("user_id, balance")
              .in("user_id", userIds);

            if (!profilesError && allProfiles) {
              // Create a map of user_id to role
              const userRoleMap = new Map(allRoles.map(r => [r.user_id, r.role]));
              
              // Calculate totals by role
              allProfiles.forEach(p => {
                const role = userRoleMap.get(p.user_id);
                const balance = Number(p.balance || 0);
                
                if (role === "employee") {
                  totalEmployeeBalance += balance;
                } else if (role === "engineer") {
                  totalEngineerBalance += balance;
                } else if (role === "cashier") {
                  totalCashierBalance += balance;
                }
              });
            }
          }
        } catch (error) {
          console.error("Error fetching total balances:", error);
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
        totalEmployeeBalance: userRole === "admin" ? totalEmployeeBalance : undefined,
        totalEngineerBalance: userRole === "admin" ? totalEngineerBalance : undefined,
        totalCashierBalance: userRole === "admin" ? totalCashierBalance : undefined,
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

      if (notificationsError) {
        console.error("Error fetching notifications:", notificationsError);
        return;
      }

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

      // Only update if notifications actually changed to avoid unnecessary re-renders
      setNotifications(prev => {
        const prevIds = prev.map(n => n.id).sort().join(',');
        const newIds = notificationData.map(n => n.id).sort().join(',');
        if (prevIds !== newIds) {
          console.log('📬 Dashboard: New notifications detected, updating...');
          return notificationData;
        }
        return prev;
      });
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const setupRealtimeSubscription = () => {
    if (!user?.id) {
      console.log('No user ID, skipping dashboard subscription');
      return () => {};
    }

    console.log('Setting up dashboard notification subscription for user:', user.id);

    // Remove any existing channel with the same name first
    const channelName = `dashboard-notifications-${user.id}`;
    const existingChannel = supabase.getChannels().find(ch => ch.topic === `realtime:${channelName}`);
    if (existingChannel) {
      console.log('Removing existing dashboard channel:', channelName);
      supabase.removeChannel(existingChannel);
    }

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, 
        (payload) => {
          console.log('✅ Dashboard: New notification received via realtime:', payload);
          // Immediately update notifications state
          const newNotif = payload.new as any;
          const notification: Notification = {
            id: newNotif.id,
            type: newNotif.type,
            title: newNotif.title,
            message: newNotif.message,
            expense_id: newNotif.expense_id || null,
            created_at: newNotif.created_at,
            read: newNotif.read || false,
          };
          
          setNotifications(prev => {
            // Check if notification already exists
            if (prev.some(n => n.id === notification.id)) {
              return prev;
            }
            // Add new notification at the beginning, keep only 2 most recent
            console.log('📬 Dashboard: Adding new notification to state:', notification);
            return [notification, ...prev].slice(0, 2);
          });
          
          fetchNotifications(); // Also fetch to get expense title and ensure consistency
          fetchStats(); // Also refresh stats when new notification arrives
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Dashboard: Notification updated:', payload);
          fetchNotifications();
        }
      )
      .subscribe((status) => {
        console.log('📡 Dashboard notification subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Dashboard: Successfully subscribed to notifications');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('❌ Dashboard: Channel error, attempting to reconnect...');
          setTimeout(() => {
            setupRealtimeSubscription();
          }, 5000);
        }
      });

      return () => {
        console.log('Cleaning up dashboard notification subscription');
        supabase.removeChannel(channel);
      };
    };

  const setupBalanceRealtimeSubscription = () => {
    if (!user?.id) return () => {};

    console.log('Setting up balance real-time subscription for user:', user.id);

    const channel = supabase
      .channel(`dashboard-balance-${user.id}`)
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('✅ Dashboard: Balance updated via realtime:', payload);
          const newBalance = (payload.new as any)?.balance ?? 0;
          setUserBalance(newBalance);
          fetchStats(); // Also refresh stats to update balance display
        }
      )
      .subscribe((status) => {
        console.log('📡 Dashboard balance subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Dashboard: Successfully subscribed to balance updates');
        }
      });

    return () => {
      console.log('Cleaning up dashboard balance subscription');
      supabase.removeChannel(channel);
    };
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

      // For employees and engineers, find their assigned cashier
      let targetUserId: string | null = null;

      if (userRole === "employee" || userRole === "engineer") {
        // Get the employee's or engineer's assigned cashier
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("assigned_cashier_id")
          .eq("user_id", user.id)
          .single();

        if (profileError) throw profileError;

        if (!profile?.assigned_cashier_id) {
          toast({
            variant: "destructive",
            title: "No Cashier Assigned",
            description: "You don't have a cashier assigned. Please contact an administrator.",
          });
          setReturningMoney(false);
          return;
        }

        targetUserId = profile.assigned_cashier_id;
      } else {
        toast({
          variant: "destructive",
          title: "Invalid Operation",
          description: "Return money is only available for employees and engineers.",
        });
        setReturningMoney(false);
        return;
      }

      if (!targetUserId) {
        throw new Error("Target cashier not found");
      }

      // Get target cashier's current balance
      const { data: targetProfile, error: targetError } = await supabase
        .from("profiles")
        .select("balance, name")
        .eq("user_id", targetUserId)
        .single();

      if (targetError) throw targetError;

      // Deduct from employee's balance
      const newUserBalance = userBalance - amount;
      const { error: userBalanceError } = await supabase
        .from("profiles")
        .update({ balance: newUserBalance })
        .eq("user_id", user.id);

      if (userBalanceError) throw userBalanceError;

      // Add to cashier's balance
      const newTargetBalance = (targetProfile.balance || 0) + amount;
      const { error: targetBalanceError } = await supabase
        .from("profiles")
        .update({ balance: newTargetBalance })
        .eq("user_id", targetUserId);

      if (targetBalanceError) throw targetBalanceError;

      // Mark the money assignment as returned (FIFO)
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
          
          const assignmentAmount = Number(assignment.amount);
          if (assignmentAmount <= remainingAmount) {
            // Mark entire assignment as returned
            const { error: updateError } = await supabase
              .from("money_assignments")
              .update({
                is_returned: true,
                returned_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", assignment.id);

            if (updateError) {
              console.error("Error updating assignment:", updateError);
            }
            remainingAmount -= assignmentAmount;
          } else {
            // Partial return - would need to handle this if needed
            // For now, we'll mark the entire assignment
            const { error: updateError } = await supabase
              .from("money_assignments")
              .update({
                is_returned: true,
                returned_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", assignment.id);

            if (updateError) {
              console.error("Error updating assignment:", updateError);
            }
            remainingAmount = 0;
            break;
          }
        }
      }

      toast({
        title: "Money Returned Successfully",
        description: `${formatINR(amount)} has been returned to ${targetProfile.name}`,
      });

      setReturnAmount("");
      setReturnMoneyDialogOpen(false);
      fetchUserBalance();
      fetchStats();
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
    // Add total balance cards for admin
    ...(userRole === "admin" && stats.totalEmployeeBalance !== undefined
      ? [
          {
            title: "Total Employee Balance",
            value: formatINR(stats.totalEmployeeBalance),
            icon: Wallet,
            description: "All employees",
            highlight: true,
          },
        ]
      : []),
    ...(userRole === "admin" && stats.totalEngineerBalance !== undefined
      ? [
          {
            title: "Total Engineer Balance",
            value: formatINR(stats.totalEngineerBalance),
            icon: Wallet,
            description: "All engineers",
            highlight: true,
          },
        ]
      : []),
    ...(userRole === "admin" && stats.totalCashierBalance !== undefined
      ? [
          {
            title: "Total Cashier Balance",
            value: formatINR(stats.totalCashierBalance),
            icon: Wallet,
            description: "All cashiers",
            highlight: true,
          },
        ]
      : []),
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
            <>
            <Button 
              onClick={() => navigate("/expenses/new")}
              className="w-full sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Expense
              </Button>
              {(userRole === "employee" || userRole === "engineer") && (
                <Button 
                  onClick={() => setReturnMoneyDialogOpen(true)}
                  className="w-full sm:w-auto"
                  variant="outline"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Return Money
                </Button>
              )}
            </>
          )}
          {userRole === "admin" && (
            <Button 
              onClick={() => {
                navigate("/admin/users");
                setTimeout(() => {
                  const element = document.getElementById('create-user-section');
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 100);
              }}
              className="w-full sm:w-auto"
              variant="outline"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Create User
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
          const isTotalBalance = card.title === "Total Employee Balance" || card.title === "Total Engineer Balance" || card.title === "Total Cashier Balance";
          return (
            <Card 
              key={card.title} 
              className={`hover:shadow-md transition-all ${
                card.onClick ? 'cursor-pointer hover:scale-[1.02]' : ''
              } ${
                card.highlight 
                  ? isPendingReviews || isPendingApprovals
                    ? 'border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50'
                    : isTotalBalance
                    ? 'border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50'
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
                {isTotalBalance ? (
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      card.title === "Total Employee Balance" 
                        ? 'bg-green-100' 
                        : card.title === "Total Engineer Balance"
                        ? 'bg-blue-100'
                        : 'bg-purple-100'
                    }`}>
                      <Icon className={`h-5 w-5 ${
                        card.title === "Total Employee Balance" 
                          ? 'text-green-600' 
                          : card.title === "Total Engineer Balance"
                          ? 'text-blue-600'
                          : 'text-purple-600'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xl sm:text-2xl font-bold whitespace-nowrap overflow-hidden text-ellipsis ${
                        card.title === "Total Employee Balance" 
                          ? 'text-green-700' 
                          : card.title === "Total Engineer Balance"
                          ? 'text-blue-700'
                          : 'text-purple-700'
                      }`}>
                        {card.value}
                      </div>
                      <p className={`text-xs mt-1 truncate ${
                        card.title === "Total Employee Balance" 
                          ? 'text-green-600' 
                          : card.title === "Total Engineer Balance"
                          ? 'text-blue-600'
                          : 'text-purple-600'
                      }`}>
                        {card.description}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
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

      {/* Return Money Dialog */}
      {(userRole === "employee" || userRole === "engineer") && (
        <Dialog open={returnMoneyDialogOpen} onOpenChange={setReturnMoneyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Return Money</DialogTitle>
              <DialogDescription>
                Return money to your assigned cashier. Your current balance: {formatINR(userBalance ?? 0)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="returnAmount">Amount to Return</Label>
                <Input
                  id="returnAmount"
                  type="number"
                  placeholder="0.00"
                  value={returnAmount}
                  onChange={(e) => setReturnAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  disabled={returningMoney}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReturnMoneyDialogOpen(false);
                  setReturnAmount("");
                }}
                disabled={returningMoney}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReturnMoney}
                disabled={returningMoney || !returnAmount || parseFloat(returnAmount) <= 0}
              >
                {returningMoney ? "Returning..." : "Return Money"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
