import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";
import { 
  DollarSign, 
  TrendingUp, 
  Calendar, 
  MapPin,
  Download,
  Filter
} from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

interface ExpenseAnalytics {
  totalExpenses: number;
  totalAmount: number;
  averageAmount: number;
  approvedAmount: number;
  pendingAmount: number;
  rejectedAmount: number;
  monthlyTrend: Array<{
    month: string;
    amount: number;
    count: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  destinationBreakdown: Array<{
    destination: string;
    amount: number;
    count: number;
  }>;
  statusBreakdown: Array<{
    status: string;
    count: number;
    amount: number;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function Analytics() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("6months");

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user, timeRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      const endDate = new Date();
      const startDate = getStartDate(timeRange);

      // Build query - admins see all expenses, employees/engineers see only their own
      let query = supabase
        .from("expenses")
        .select(`
          *,
          expense_line_items(*)
        `)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      // Only filter by user_id if not admin
      if (userRole !== "admin" && user?.id) {
        query = query.eq("user_id", user.id);
      }

      const { data: expenses, error } = await query;

      if (error) {
        console.error("Error fetching expenses:", error);
        throw error;
      }

      console.log("Fetched expenses:", expenses?.length || 0, "expenses");
      console.log("Time range:", timeRange, "from", startDate.toISOString(), "to", endDate.toISOString());
      console.log("User role:", userRole, "User ID:", user?.id);

      // Process analytics data
      const analyticsData = processAnalyticsData(expenses || []);
      console.log("Processed analytics:", analyticsData);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load analytics data. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStartDate = (range: string) => {
    const now = new Date();
    switch (range) {
      case "1month":
        return subMonths(now, 1);
      case "3months":
        return subMonths(now, 3);
      case "6months":
        return subMonths(now, 6);
      case "1year":
        return subMonths(now, 12);
      default:
        return subMonths(now, 6);
    }
  };

  const processAnalyticsData = (expenses: any[]): ExpenseAnalytics => {
    const totalExpenses = expenses.length;
    const totalAmount = expenses.reduce((sum, e) => sum + Number(e.total_amount), 0);
    const averageAmount = totalExpenses > 0 ? totalAmount / totalExpenses : 0;

    // Status breakdown
    const statusBreakdown = expenses.reduce((acc, expense) => {
      const status = expense.status;
      if (!acc[status]) {
        acc[status] = { count: 0, amount: 0 };
      }
      acc[status].count++;
      acc[status].amount += Number(expense.total_amount);
      return acc;
    }, {});

    const approvedAmount = statusBreakdown.approved?.amount || 0;
    const pendingAmount = (statusBreakdown.submitted?.amount || 0) + 
                        (statusBreakdown.under_review?.amount || 0) + 
                        (statusBreakdown.verified?.amount || 0);
    const rejectedAmount = statusBreakdown.rejected?.amount || 0;

    // Monthly trend
    const monthlyData = expenses.reduce((acc, expense) => {
      const month = format(new Date(expense.created_at), "MMM yyyy");
      if (!acc[month]) {
        acc[month] = { amount: 0, count: 0 };
      }
      acc[month].amount += Number(expense.total_amount);
      acc[month].count++;
      return acc;
    }, {});

    const monthlyTrend = Object.entries(monthlyData).map(([month, data]: [string, any]) => ({
      month,
      amount: data.amount,
      count: data.count
    })).sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

    // Category breakdown
    const categoryData = expenses.reduce((acc, expense) => {
      expense.expense_line_items?.forEach((item: any) => {
        const category = item.category;
        if (!acc[category]) {
          acc[category] = { amount: 0, count: 0 };
        }
        acc[category].amount += Number(item.amount);
        acc[category].count++;
      });
      return acc;
    }, {});

    const categoryBreakdown = Object.entries(categoryData).map(([category, data]: [string, any]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      amount: data.amount,
      count: data.count
    }));

    // Destination breakdown
    const destinationData = expenses.reduce((acc, expense) => {
      const destination = expense.destination;
      if (!acc[destination]) {
        acc[destination] = { amount: 0, count: 0 };
      }
      acc[destination].amount += Number(expense.total_amount);
      acc[destination].count++;
      return acc;
    }, {});

    const destinationBreakdown = Object.entries(destinationData)
      .map(([destination, data]: [string, any]) => ({
        destination,
        amount: data.amount,
        count: data.count
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // Top 10 destinations

    return {
      totalExpenses,
      totalAmount,
      averageAmount,
      approvedAmount,
      pendingAmount,
      rejectedAmount,
      monthlyTrend,
      categoryBreakdown,
      destinationBreakdown,
      statusBreakdown: Object.entries(statusBreakdown).map(([status, data]: [string, any]) => ({
        status,
        count: data.count,
        amount: data.amount
      }))
    };
  };

  const exportAnalytics = () => {
    if (!analytics) return;

    const csvContent = [
      ["Metric", "Value"],
      ["Total Expenses", analytics.totalExpenses],
      ["Total Amount", `$${analytics.totalAmount.toFixed(2)}`],
      ["Average Amount", `$${analytics.averageAmount.toFixed(2)}`],
      ["Approved Amount", `$${analytics.approvedAmount.toFixed(2)}`],
      ["Pending Amount", `$${analytics.pendingAmount.toFixed(2)}`],
      ["Rejected Amount", `$${analytics.rejectedAmount.toFixed(2)}`],
      ["", ""],
      ["Monthly Trend", ""],
      ["Month", "Amount", "Count"],
      ...analytics.monthlyTrend.map(item => [item.month, item.amount.toFixed(2), item.count]),
      ["", ""],
      ["Category Breakdown", ""],
      ["Category", "Amount", "Count"],
      ...analytics.categoryBreakdown.map(item => [item.category, item.amount.toFixed(2), item.count])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expense-analytics-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (userRole !== "admin" && userRole !== "employee" && userRole !== "engineer") {
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
          <h1 className="text-3xl font-bold tracking-tight">Expense Analytics</h1>
          <p className="text-muted-foreground">
            {userRole === "admin" 
              ? "Insights and trends from all expense data"
              : "Insights and trends from your expense data"
            }
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1month">Last Month</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="1year">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportAnalytics}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-2">Loading analytics...</p>
        </div>
      ) : !analytics ? (
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold">No Data Available</h2>
          <p className="text-muted-foreground">No expense data found for the selected time range.</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalExpenses}</div>
                <p className="text-xs text-muted-foreground">
                  {timeRange} period
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${analytics.totalAmount.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  Average: ${analytics.averageAmount.toFixed(2)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approved</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${analytics.approvedAmount.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  {((analytics.approvedAmount / analytics.totalAmount) * 100).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${analytics.pendingAmount.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting approval
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <Tabs defaultValue="trends" className="space-y-4">
            <TabsList>
              <TabsTrigger value="trends">Trends</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="destinations">Destinations</TabsTrigger>
              <TabsTrigger value="status">Status</TabsTrigger>
            </TabsList>

            <TabsContent value="trends" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Expense Trends</CardTitle>
                  <CardDescription>Track your expense patterns over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => [`$${value}`, "Amount"]} />
                      <Line type="monotone" dataKey="amount" stroke="#8884d8" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="categories" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Expense by Category</CardTitle>
                    <CardDescription>Breakdown of spending by category</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={analytics.categoryBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="amount"
                        >
                          {analytics.categoryBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`$${value}`, "Amount"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Category Details</CardTitle>
                    <CardDescription>Detailed breakdown by category</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {analytics.categoryBreakdown.map((category, index) => (
                        <div key={category.category} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="font-medium">{category.category}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">${category.amount.toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">{category.count} items</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="destinations" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Top Destinations</CardTitle>
                  <CardDescription>Most frequent travel destinations</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.destinationBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="destination" />
                      <YAxis />
                      <Tooltip formatter={(value) => [`$${value}`, "Amount"]} />
                      <Bar dataKey="amount" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="status" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Expense Status Distribution</CardTitle>
                  <CardDescription>Breakdown by approval status</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.statusBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" />
                      <YAxis />
                      <Tooltip formatter={(value, name) => [
                        name === "count" ? value : `$${value}`,
                        name === "count" ? "Count" : "Amount"
                      ]} />
                      <Bar dataKey="count" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
