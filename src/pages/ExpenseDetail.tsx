import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Edit, 
  Download, 
  FileText, 
  Calendar, 
  MapPin, 
  DollarSign, 
  User, 
  Clock,
  CheckCircle,
  XCircle,
  Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { formatINR } from "@/lib/format";

interface Expense {
  id: string;
  title: string;
  destination: string;
  trip_start: string;
  trip_end: string;
  status: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  purpose?: string;
  admin_comment?: string;
  assigned_engineer_id?: string;
  assigned_engineer_name?: string;
}

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

interface AuditLog {
  id: string;
  action: string;
  comment?: string;
  created_at: string;
  user_name: string;
}

export default function ExpenseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  
  const [expense, setExpense] = useState<Expense | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchExpenseDetails();
    }
  }, [id]);

  const fetchExpenseDetails = async () => {
    try {
      setLoading(true);

      // Fetch expense data
      const { data: expenseData, error: expenseError } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", id)
        .single();

      if (expenseError) throw expenseError;

      // Fetch user profile
      const { data: userProfile, error: userProfileError } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("user_id", expenseData.user_id)
        .single();

      if (userProfileError) throw userProfileError;

      // Fetch engineer profile if assigned
      let engineerProfile = null;
      if (expenseData.assigned_engineer_id) {
        const { data: engineerData, error: engineerError } = await supabase
          .from("profiles")
          .select("name")
          .eq("user_id", expenseData.assigned_engineer_id)
          .single();
        
        if (!engineerError) {
          engineerProfile = engineerData;
        }
      }

      // Check if user has permission to view this expense
      const canView = 
        expenseData.user_id === user?.id || 
        expenseData.assigned_engineer_id === user?.id ||
        userRole === "admin";

      if (!canView) {
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "You don't have permission to view this expense",
        });
        navigate("/expenses");
        return;
      }

      setExpense({
        ...expenseData,
        user_name: userProfile.name,
        user_email: userProfile.email,
        assigned_engineer_name: engineerProfile?.name,
        total_amount: Number(expenseData.total_amount)
      });

      // Fetch line items
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from("expense_line_items")
        .select("*")
        .eq("expense_id", id)
        .order("date");

      if (lineItemsError) throw lineItemsError;
      setLineItems(lineItemsData || []);

      // Fetch attachments
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from("attachments")
        .select("*")
        .eq("expense_id", id)
        .order("created_at");

      if (attachmentsError) throw attachmentsError;
      // Normalize attachment URLs to ensure they are valid public URLs from the active bucket
      const normalizedAttachments = (attachmentsData || []).map((att) => {
        const asUrl = att.file_url || "";

        // Case 1: Already a full URL
        if (asUrl.startsWith("http")) {
          try {
            const u = new URL(asUrl);
            // If legacy bucket is referenced, rebuild a receipts public URL using the same object key
            if (u.pathname.includes("/object/public/expense-attachments/")) {
              const key = u.pathname.split("/object/public/expense-attachments/")[1] || "";
              const { data } = supabase.storage.from("receipts").getPublicUrl(key);
              return { ...att, file_url: data.publicUrl };
            }
            return att;
          } catch {
            // If parsing fails, fall back to treating it as a path below
          }
        }

        // Case 2: Path-like value stored (e.g., "receipts/{expenseId}/file.png" or "expense-attachments/{...}")
        const parts = asUrl.split("/");
        const bucketMaybe = parts[0] || "receipts";
        const objectKey = parts.slice(1).join("/");
        const bucket = bucketMaybe === "expense-attachments" ? "receipts" : (bucketMaybe || "receipts");
        const key = objectKey || asUrl; // if not in bucket/key format, use raw string

        const { data } = supabase.storage.from(bucket).getPublicUrl(key);
        return { ...att, file_url: data.publicUrl };
      });

      setAttachments(normalizedAttachments);

      // Fetch audit logs
      const { data: auditData, error: auditError } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("expense_id", id)
        .order("created_at", { ascending: false });

      if (auditError) throw auditError;

      // Fetch user profiles for audit logs
      const auditLogsWithNames = await Promise.all(
        (auditData || []).map(async (log) => {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("name")
            .eq("user_id", log.user_id)
            .single();
          
          return {
            ...log,
            user_name: profileData?.name || "Unknown User"
          };
        })
      );

      setAuditLogs(auditLogsWithNames);

    } catch (error) {
      console.error("Error fetching expense details:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load expense details",
      });
    } finally {
      setLoading(false);
    }
  };

  const canEdit = () => {
    if (!expense) return false;
    return (
      (expense.user_id === user?.id && expense.status === "submitted") ||
      userRole === "admin"
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "travel":
        return "✈️";
      case "lodging":
        return "🏨";
      case "food":
        return "🍽️";
      default:
        return "📄";
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) {
      return "🖼️";
    } else if (contentType === 'application/pdf') {
      return "📄";
    } else if (contentType.includes('word')) {
      return "📝";
    }
    return "📎";
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/expenses")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Expenses
          </Button>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-2">Loading expense details...</p>
        </div>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/expenses")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Expenses
          </Button>
        </div>
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold">Expense Not Found</h2>
          <p className="text-muted-foreground">The requested expense could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/expenses")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Expenses
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{expense.title}</h1>
            <p className="text-muted-foreground">
              Created on {format(new Date(expense.created_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit() && (
            <Button onClick={() => navigate(`/expenses/${expense.id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Expense Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getStatusIcon(expense.status)}
                Expense Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    Employee
                  </div>
                  <div>
                    <p className="font-medium">{expense.user_name}</p>
                    <p className="text-sm text-muted-foreground">{expense.user_email}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    Total Amount
                  </div>
                  <p className="text-2xl font-bold">{formatINR(expense.total_amount)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    Destination
                  </div>
                  <p className="font-medium">{expense.destination}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Trip Duration
                  </div>
                  <p className="font-medium">
                    {format(new Date(expense.trip_start), "MMM d")} - {format(new Date(expense.trip_end), "MMM d, yyyy")}
                  </p>
                </div>
              </div>

              {expense.purpose && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Purpose
                    </div>
                    <p className="text-sm">{expense.purpose}</p>
                  </div>
                </>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Status
                  </div>
                  <StatusBadge status={expense.status as any} />
                </div>
                {expense.assigned_engineer_name && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      Assigned Engineer
                    </div>
                    <p className="font-medium">{expense.assigned_engineer_name}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Expense Line Items</CardTitle>
              <CardDescription>
                Detailed breakdown of all expense items
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lineItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No line items found
                </p>
              ) : (
                <div className="space-y-3">
                  {lineItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getCategoryIcon(item.category)}</span>
                        <div>
                          <p className="font-medium capitalize">{item.category}</p>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(item.date), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatINR(item.amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          {attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Receipts & Attachments</CardTitle>
                <CardDescription>
                  Supporting documents and receipts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getFileIcon(attachment.content_type)}</span>
                        <div>
                          <p className="font-medium">{attachment.filename}</p>
                          <p className="text-sm text-muted-foreground">
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
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Image Preview Dialog */}
          <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
            <DialogContent className="max-w-3xl">
              {imagePreviewUrl && (
                <img src={imagePreviewUrl} alt="Attachment preview" className="w-full h-auto rounded" />
              )}
            </DialogContent>
          </Dialog>

          {/* Admin Comments */}
          {expense.admin_comment && (
            <Card>
              <CardHeader>
                <CardTitle>Admin Comments</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{expense.admin_comment}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Status Timeline</CardTitle>
              <CardDescription>
                Track the progress of this expense
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {auditLogs.map((log, index) => (
                  <div key={log.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      {index < auditLogs.length - 1 && (
                        <div className="w-px h-8 bg-border mt-2"></div>
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">{log.action}</p>
                      {log.comment && (
                        <p className="text-xs text-muted-foreground">{log.comment}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        by {log.user_name} • {format(new Date(log.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                <Download className="h-4 w-4 mr-2" />
                Export as PDF
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <FileText className="h-4 w-4 mr-2" />
                Print Receipt
              </Button>
              {canEdit() && (
                <Button className="w-full justify-start">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Expense
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
