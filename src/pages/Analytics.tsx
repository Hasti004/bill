import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, TrendingUp, Coins } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ExpenseAnalytics {
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    amount: number;
    count: number;
  }>;
  destinationBreakdown: Array<{
    destination: string;
    amount: number;
    count: number;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

function getStartDate(range: string): Date {
  const now = new Date();
  switch (range) {
    case "1month":
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "3months":
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case "6months":
      return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case "1year":
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    default:
      return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  }
}

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

      let expenses: any[] = [];

      if (userRole === "admin") {
        const { data, error } = await supabase
          .from("expenses")
          .select(`*, expense_line_items(*)`)
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString());

        if (error) throw error;
        expenses = data || [];
      } else if (user?.id) {
        const { data, error } = await supabase
          .from("expenses")
          .select(`*, expense_line_items(*)`)
          .eq("user_id", user.id)
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString());

        if (error) throw error;
        expenses = data || [];
      }

      const totalAmount = expenses.reduce((sum, e) => sum + Number(e.total_amount || 0), 0);
      const totalCount = expenses.length;
      const averageAmount = totalCount > 0 ? totalAmount / totalCount : 0;

      const categoryMap = new Map<string, { amount: number; count: number }>();
      expenses.forEach((expense) => {
        const category = expense.category || "other";
        const amount = Number(expense.total_amount || 0);
        const current = categoryMap.get(category) || { amount: 0, count: 0 };
        categoryMap.set(category, {
          amount: current.amount + amount,
          count: current.count + 1,
        });
      });

      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1),
        ...data,
      }));

      const monthlyMap = new Map<string, { amount: number; count: number }>();
      expenses.forEach((expense) => {
        const date = new Date(expense.created_at);
        const monthKey = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        const amount = Number(expense.total_amount || 0);
        const current = monthlyMap.get(monthKey) || { amount: 0, count: 0 };
        monthlyMap.set(monthKey, {
          amount: current.amount + amount,
          count: current.count + 1,
        });
      });

      const monthlyTrend = Array.from(monthlyMap.entries())
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => {
          const dateA = new Date(a.month);
          const dateB = new Date(b.month);
          return dateA.getTime() - dateB.getTime();
        });

      const destinationMap = new Map<string, { amount: number; count: number }>();
      expenses.forEach((expense) => {
        const destination = expense.destination || "Unknown";
        const amount = Number(expense.total_amount || 0);
        const current = destinationMap.get(destination) || { amount: 0, count: 0 };
        destinationMap.set(destination, {
          amount: current.amount + amount,
          count: current.count + 1,
        });
      });

      const destinationBreakdown = Array.from(destinationMap.entries())
        .map(([destination, data]) => ({ destination, ...data }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      setAnalytics({
        totalAmount,
        totalCount,
        averageAmount,
        categoryBreakdown,
        monthlyTrend,
        destinationBreakdown,
      });
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

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">No analytics data available.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-2">
            {userRole === "admin"
              ? "Comprehensive expense analytics across all users"
              : "Your personal expense analytics"}
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1month">Last Month</SelectItem>
            <SelectItem value="3months">Last 3 Months</SelectItem>
            <SelectItem value="6months">Last 6 Months</SelectItem>
            <SelectItem value="1year">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(analytics.totalAmount)}</div>
            <p className="text-xs text-muted-foreground">
              Average: {formatINR(analytics.averageAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalCount}</div>
            <p className="text-xs text-muted-foreground">
              Expenses in selected period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Expense</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(analytics.averageAmount)}</div>
            <p className="text-xs text-muted-foreground">
              Per expense submission
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Trend</CardTitle>
            <CardDescription>Expense amount over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [formatINR(Number(value)), "Amount"]} />
                <Legend />
                <Line type="monotone" dataKey="amount" stroke="#8884d8" name="Amount" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Breakdown</CardTitle>
            <CardDescription>Expenses by category</CardDescription>
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
                <Tooltip formatter={(value) => formatINR(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {analytics.destinationBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Destinations</CardTitle>
            <CardDescription>Expenses by destination</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.destinationBreakdown}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="destination" />
                <YAxis />
                <Tooltip formatter={(value) => [formatINR(Number(value)), "Amount"]} />
                <Bar dataKey="amount" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

