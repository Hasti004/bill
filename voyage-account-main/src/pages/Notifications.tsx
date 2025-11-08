import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bell, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  Eye,
  ArrowRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Notification {
  id: string;
  type: "expense_submitted" | "expense_approved" | "expense_rejected" | "expense_assigned" | "expense_verified";
  title: string;
  message: string;
  expense_id: string;
  expense_title: string;
  created_at: string;
  read: boolean;
  actor_name?: string;
}

export default function Notifications() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      // Set up real-time subscription for new notifications
      setupRealtimeSubscription();
    }
  }, [user]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      
      // Fetch recent audit logs that represent notifications
      const { data, error } = await supabase
        .from("audit_logs")
        .select(`
          *,
          profiles!inner(name),
          expenses!inner(title, user_id)
        `)
        .or(`expenses.user_id.eq.${user?.id},action.like.%assigned%`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Convert audit logs to notifications
      const notificationData = data?.map(log => ({
        id: log.id,
        type: getNotificationType(log.action),
        title: getNotificationTitle(log.action),
        message: log.comment || getDefaultMessage(log.action),
        expense_id: log.expense_id,
        expense_title: log.expenses.title,
        created_at: log.created_at,
        read: false, // In a real app, you'd track this in a notifications table
        actor_name: log.profiles.name
      })) || [];

      setNotifications(notificationData);
      setUnreadCount(notificationData.filter(n => !n.read).length);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'audit_logs',
          filter: `expenses.user_id=eq.${user?.id}`
        }, 
        (payload) => {
          // Handle new notification
          toast({
            title: "New Notification",
            description: "You have a new expense update",
          });
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const getNotificationType = (action: string): Notification["type"] => {
    if (action.includes("submitted")) return "expense_submitted";
    if (action.includes("approved")) return "expense_approved";
    if (action.includes("rejected")) return "expense_rejected";
    if (action.includes("assigned")) return "expense_assigned";
    if (action.includes("verified")) return "expense_verified";
    return "expense_submitted";
  };

  const getNotificationTitle = (action: string): string => {
    if (action.includes("submitted")) return "Expense Submitted";
    if (action.includes("approved")) return "Expense Approved";
    if (action.includes("rejected")) return "Expense Rejected";
    if (action.includes("assigned")) return "Expense Assigned";
    if (action.includes("verified")) return "Expense Verified";
    return "Expense Update";
  };

  const getDefaultMessage = (action: string): string => {
    if (action.includes("submitted")) return "Your expense has been submitted for review";
    if (action.includes("approved")) return "Your expense has been approved";
    if (action.includes("rejected")) return "Your expense has been rejected";
    if (action.includes("assigned")) return "An expense has been assigned to you for review";
    if (action.includes("verified")) return "Your expense has been verified by an engineer";
    return "Your expense status has been updated";
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "expense_approved":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "expense_rejected":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "expense_submitted":
      case "expense_assigned":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "expense_verified":
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      default:
        return <Bell className="h-5 w-5 text-gray-600" />;
    }
  };

  const getNotificationBadgeVariant = (type: Notification["type"]) => {
    switch (type) {
      case "expense_approved":
        return "success" as const;
      case "expense_rejected":
        return "destructive" as const;
      case "expense_submitted":
      case "expense_assigned":
        return "default" as const;
      case "expense_verified":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  const markAsRead = async (notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    navigate(`/expenses/${notification.expense_id}`);
  };

  const getRecentNotifications = () => {
    return notifications.slice(0, 10);
  };

  const getNotificationsByType = () => {
    const grouped = notifications.reduce((acc, notification) => {
      if (!acc[notification.type]) {
        acc[notification.type] = [];
      }
      acc[notification.type].push(notification);
      return acc;
    }, {} as Record<string, Notification[]>);

    return grouped;
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            Stay updated on your expense submissions and approvals
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllAsRead}>
            Mark All as Read
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Notifications</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{notifications.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unread</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{unreadCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {notifications.filter(n => n.type === "expense_approved").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {notifications.filter(n => ["expense_submitted", "expense_assigned"].includes(n.type)).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
          <CardDescription>
            Latest updates on your expense submissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-2">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No notifications yet</h3>
              <p className="text-muted-foreground">
                You'll receive notifications when your expenses are updated.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-3">
                {getRecentNotifications().map((notification) => (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${
                      !notification.read ? "bg-blue-50 border-blue-200" : ""
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex-shrink-0 mt-1">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">{notification.title}</h4>
                        <div className="flex items-center gap-2">
                          <Badge variant={getNotificationBadgeVariant(notification.type)}>
                            {notification.type.replace("expense_", "").replace("_", " ")}
                          </Badge>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-muted-foreground">
                          {notification.expense_title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(notification.created_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                      {notification.actor_name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          by {notification.actor_name}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Notification Types Summary */}
      {notifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Notification Summary</CardTitle>
            <CardDescription>
              Breakdown of notifications by type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(getNotificationsByType()).map(([type, typeNotifications]) => (
                <div key={type} className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getNotificationIcon(type as Notification["type"])}
                    <h4 className="font-medium capitalize">
                      {type.replace("expense_", "").replace("_", " ")}
                    </h4>
                  </div>
                  <div className="text-2xl font-bold">
                    {typeNotifications.length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {typeNotifications.filter(n => !n.read).length} unread
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
