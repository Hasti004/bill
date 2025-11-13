import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { notifyBalanceAdded } from "@/services/NotificationService";
import { Search, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ProfileRow {
  user_id: string;
  name: string;
  email: string;
  balance: number | null;
  role: string;
}

export default function Balances() {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [cashierBalance, setCashierBalance] = useState<number>(0);
  const [addAmounts, setAddAmounts] = useState<{ [key: string]: number }>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [bulkAddDialogOpen, setBulkAddDialogOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkAmount, setBulkAmount] = useState<number>(0);
  const [bulkAdding, setBulkAdding] = useState(false);

  const canEdit = userRole === "admin" || userRole === "cashier";

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      
      // If cashier, get their assigned engineer first
      let cashierAssignedEngineerId: string | null = null;
      if (userRole === 'cashier' && user?.id) {
        const { data: cashierProfile } = await supabase
          .from("profiles")
          .select("cashier_assigned_engineer_id")
          .eq("user_id", user.id)
          .single();
        
        cashierAssignedEngineerId = cashierProfile?.cashier_assigned_engineer_id || null;
        console.log('Cashier assigned engineer:', cashierAssignedEngineerId);
      }
      
      // Fetch profiles first
      let profilesQuery = supabase
        .from("profiles")
        .select("user_id, name, email, balance, reporting_engineer_id, cashier_assigned_engineer_id")
        .order("name", { ascending: true });
      
      // If cashier has assigned engineer, filter to only show employees under that engineer
      if (userRole === 'cashier' && cashierAssignedEngineerId) {
        // Cashier can only see:
        // 1. Employees assigned to their engineer
        // 2. The engineer they're assigned to
        // 3. Other cashiers and admins (for reference)
        // We'll filter this in the application layer after fetching roles
        console.log('Filtering for cashier with assigned engineer:', cashierAssignedEngineerId);
      }
      
      const { data: profilesData, error: profilesError } = await profilesQuery;
      
      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        throw profilesError;
      }
      
      console.log("Fetched profiles:", profilesData?.length || 0);
      
      // Get all user IDs
      const userIds = (profilesData || []).map(p => p.user_id);
      console.log("User IDs to fetch roles for:", userIds.length);
      
      // Fetch all roles for these users
      let rolesByUserId: Record<string, string[]> = {};
      if (userIds.length > 0) {
        // Supabase .in() has a limit, so we might need to batch if there are many users
        // But first try the direct query
        const { data: rolesData, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id, role");
        
        if (rolesError) {
          console.error("Error fetching roles:", rolesError);
          // Don't throw - continue with empty roles
          console.warn("Continuing without roles due to error");
        } else {
          console.log("Fetched all roles from database:", rolesData?.length || 0, rolesData);
          
          // Filter to only roles for users we care about, and group by user_id
          (rolesData || []).forEach((r: any) => {
            // Only process roles for users in our list
            if (userIds.includes(r.user_id)) {
              if (!rolesByUserId[r.user_id]) {
                rolesByUserId[r.user_id] = [];
              }
              rolesByUserId[r.user_id].push(r.role);
            }
          });
          
          console.log("Roles filtered and grouped by user:", rolesByUserId);
        }
      }
      
      // Role priority - higher number = higher priority
      const rolePriority: { [key: string]: number } = {
        'admin': 4,
        'cashier': 3,
        'engineer': 2,
        'employee': 1
      };
      
      // Combine data and select highest priority role
      let combinedData = (profilesData || []).map((r: any) => {
        const userRoles = rolesByUserId[r.user_id] || [];
        let highestPriorityRole = 'employee';
        let highestPriority = 0;
        
        // Find the role with highest priority
        userRoles.forEach((role: string) => {
          const priority = rolePriority[role] || 0;
          if (priority > highestPriority) {
            highestPriority = priority;
            highestPriorityRole = role;
          }
        });
        
        console.log(`User ${r.name} (${r.user_id}): roles=${JSON.stringify(userRoles)}, selected=${highestPriorityRole}`);
        
        return {
          user_id: r.user_id,
          name: r.name,
          email: r.email,
          balance: typeof r.balance === 'number' ? r.balance : 0,
          role: highestPriorityRole,
          reporting_engineer_id: r.reporting_engineer_id,
          cashier_assigned_engineer_id: r.cashier_assigned_engineer_id,
        };
      });
      
      // Filter for cashiers: only show employees under their assigned engineer
      if (userRole === 'cashier' && user?.id) {
        // Get cashier's assigned engineer from the database directly
        const { data: cashierProfileData } = await supabase
          .from("profiles")
          .select("cashier_assigned_engineer_id")
          .eq("user_id", user.id)
          .single();
        
        const cashierAssignedEngineerId = cashierProfileData?.cashier_assigned_engineer_id;
        
        if (cashierAssignedEngineerId) {
          console.log('Filtering data for cashier with assigned engineer:', cashierAssignedEngineerId);
          combinedData = combinedData.filter((row: any) => {
            // Show ONLY:
            // 1. The cashier themselves
            // 2. The engineer they're assigned to (by user_id match)
            // 3. Employees assigned to that engineer (by reporting_engineer_id match)
            // DO NOT show: Admins, other cashiers, other engineers, employees from other zones
            
            // Show cashier themselves
            if (row.user_id === user.id) return true;
            
            // Show assigned engineer (must match by user_id)
            if (row.user_id === cashierAssignedEngineerId && row.role === 'engineer') return true;
            
            // Show employees under assigned engineer (must have matching reporting_engineer_id)
            if (row.role === 'employee' && row.reporting_engineer_id === cashierAssignedEngineerId) return true;
            
            // Hide everything else: admins, other cashiers, other engineers, other employees
            return false;
          });
          console.log('Filtered data for cashier:', combinedData.length, 'rows');
        } else {
          // If cashier has no assigned engineer, show all (backward compatibility)
          console.log('Cashier has no assigned engineer - showing all users');
        }
      }
      
      console.log("Final combined data:", combinedData);
      setRows(combinedData);
      
      // If user is cashier, fetch their balance
      if (userRole === 'cashier' && user?.id) {
        const cashierProfile = combinedData.find(p => p.user_id === user.id);
        setCashierBalance(cashierProfile?.balance || 0);
      }
    } catch (e: any) {
      console.error("Error loading balances", e);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load user balances",
      });
    } finally {
      setLoading(false);
    }
  };

  const addAmountToUser = async (userId: string, amountToAdd: number) => {
    try {
      setSavingId(userId);
      
      console.log('Adding amount:', amountToAdd, 'to user:', userId, 'by:', userRole);
      
      // Prevent cashier from adding money to themselves
      if (userRole === 'cashier' && user?.id && userId === user.id) {
        toast({ 
          variant: "destructive", 
          title: "Action Not Allowed", 
          description: "Cashiers cannot add money to their own account. Only administrators can allocate funds to cashiers." 
        });
        setSavingId(null);
        return;
      }
      
      const currentRow = rows.find(r => r.user_id === userId);
      if (!currentRow) throw new Error('User not found');
      
      console.log('Current user balance:', currentRow.balance);
      
      // Prevent cashier from adding money to admin
      if (userRole === 'cashier' && currentRow.role === 'admin') {
        toast({
          variant: "destructive",
          title: "Action Not Allowed",
          description: "Cashiers cannot add balance to administrators.",
        });
        setSavingId(null);
        return;
      }
      
      // If cashier is adding funds, validate they can manage this employee
      if (userRole === 'cashier' && amountToAdd > 0 && user?.id) {
        // Check if cashier can manage this employee (must be under their assigned engineer)
        const cashierProfile = rows.find(r => r.user_id === user.id);
        const cashierAssignedEngineerId = (cashierProfile as any)?.cashier_assigned_engineer_id;
        
        if (cashierAssignedEngineerId) {
          // Cashier has assigned engineer - check if employee is under that engineer
          const employeeEngineerId = (currentRow as any)?.reporting_engineer_id;
          
          if (currentRow.role === 'employee' && employeeEngineerId !== cashierAssignedEngineerId) {
            toast({
              variant: "destructive",
              title: "Access Denied",
              description: "You can only manage employees under your assigned engineer's zone/department.",
            });
            setSavingId(null);
            return;
          }
          
          if (currentRow.role === 'engineer' && currentRow.user_id !== cashierAssignedEngineerId) {
            toast({
              variant: "destructive",
              title: "Access Denied",
              description: "You can only manage your assigned engineer.",
            });
            setSavingId(null);
            return;
          }
        }
        
        // Check if they have sufficient balance and deduct from their account
        console.log('Cashier balance check - Current balance:', cashierBalance, 'Amount to add:', amountToAdd);
        if (cashierBalance < amountToAdd) {
          console.log('Insufficient balance - need:', amountToAdd, 'have:', cashierBalance);
          toast({ 
            variant: "destructive", 
            title: "Insufficient Balance", 
            description: `You need ${formatINR(amountToAdd)} but only have ${formatINR(cashierBalance)}` 
          });
          return;
        }
        
        console.log('Deducting from cashier balance:', cashierBalance, 'by:', amountToAdd);
        
        // Deduct from cashier's balance
        const { error: cashierError } = await supabase
          .from("profiles")
          .update({ balance: cashierBalance - amountToAdd })
          .eq("user_id", user.id);
        
        if (cashierError) {
          console.error('Cashier balance update error:', cashierError);
          throw cashierError;
        }
        
        // Update cashier balance in state
        setCashierBalance(cashierBalance - amountToAdd);
        console.log('Cashier balance updated in state');
      }
      
      // Add to target user's balance
      const newBalance = (currentRow.balance || 0) + amountToAdd;
      console.log('New balance for user:', newBalance);
      
      // Try to update the user's balance
      const { data, error } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("user_id", userId)
        .select();
      
      if (error) {
        console.error('User balance update error:', error);
        // If user balance update fails, we should rollback cashier balance
        if (userRole === 'cashier' && user?.id) {
          console.log('Rolling back cashier balance...');
          await supabase
            .from("profiles")
            .update({ balance: cashierBalance })
            .eq("user_id", user.id);
          setCashierBalance(cashierBalance);
        }
        throw error;
      }
      
      console.log('User balance updated successfully:', data);
      
      // Record money assignment if cashier is adding money to an employee/engineer
      // This tracks the path: cashier -> employee, so money can be returned to the same cashier
      if (userRole === 'cashier' && user?.id && amountToAdd > 0) {
        // Check if recipient is an employee or engineer (not admin or cashier)
        const recipientRole = currentRow.role;
        if (recipientRole === 'employee' || recipientRole === 'engineer') {
          // Verify cashier can manage this employee (respects zone/department assignment)
          const cashierProfile = rows.find(r => r.user_id === user.id);
          const cashierAssignedEngineerId = (cashierProfile as any)?.cashier_assigned_engineer_id;
          
          // Only record if:
          // 1. Cashier has no assigned engineer (can manage all - backward compatibility)
          // 2. OR employee is under cashier's assigned engineer
          // 3. OR recipient is the cashier's assigned engineer
          let shouldRecord = true;
          if (cashierAssignedEngineerId) {
            if (recipientRole === 'employee') {
              const employeeEngineerId = (currentRow as any)?.reporting_engineer_id;
              shouldRecord = employeeEngineerId === cashierAssignedEngineerId;
            } else if (recipientRole === 'engineer') {
              shouldRecord = userId === cashierAssignedEngineerId;
            }
          }
          
          if (shouldRecord) {
            // Record the assignment
            const { error: assignmentError } = await supabase
              .from("money_assignments")
              .insert({
                cashier_id: user.id,
                recipient_id: userId,
                amount: amountToAdd,
              });

            if (assignmentError) {
              console.error('Error recording money assignment:', assignmentError);
              // Don't throw error - assignment recording is not critical for the transaction
              // But log it for debugging
            } else {
              console.log('Money assignment recorded: cashier', user.id, '-> employee', userId, 'amount:', amountToAdd);
            }
          }
        }
      }
      
      // Get cashier/admin name for notification
      const { data: adderProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", user?.id)
        .single();

      // Create notification for the user who received the money (both cashier and admin can add)
      if ((userRole === 'cashier' || userRole === 'admin') && adderProfile) {
        await notifyBalanceAdded(
          userId,
          amountToAdd,
          adderProfile.name
        );
      }
      
      // Check if balance was negative and is now compensated
      const wasNegative = (currentRow.balance || 0) < 0;
      const isNowPositive = newBalance >= 0;
      const compensationMessage = wasNegative && isNowPositive 
        ? ` Added ${formatINR(amountToAdd)}. Negative balance compensated. New balance: ${formatINR(newBalance)}`
        : wasNegative
        ? ` Added ${formatINR(amountToAdd)}. Balance: ${formatINR(newBalance)} (still negative)`
        : ` Added ${formatINR(amountToAdd)}. New balance: ${formatINR(newBalance)}`;
      
      toast({ 
        title: "Amount added", 
        description: `${currentRow.name}'s account:${compensationMessage}` 
      });
      
      // Update both recipient's balance and cashier's balance in the rows state
      setRows(prev => prev.map(r => {
        if (r.user_id === userId) {
          // Update recipient's balance
          return { ...r, balance: newBalance };
        } else if (userRole === 'cashier' && user?.id && r.user_id === user.id) {
          // Update cashier's balance in the table
          const newCashierBalance = cashierBalance - amountToAdd;
          return { ...r, balance: newCashierBalance };
        }
        return r;
      }));
      
      // Clear the add amount input
      setAddAmounts(prev => ({ ...prev, [userId]: 0 }));
    } catch (e: any) {
      console.error('Error in addAmountToUser:', e);
      toast({ variant: "destructive", title: "Error", description: e.message || "Failed to add amount" });
    } finally {
      setSavingId(null);
    }
  };

  const updateBalance = async (userId: string, newBalance: number) => {
    try {
      setSavingId(userId);
      
      // Prevent cashier from adding money to themselves
      if (userRole === 'cashier' && user?.id && userId === user.id) {
        toast({ 
          variant: "destructive", 
          title: "Action Not Allowed", 
          description: "Cashiers cannot add money to their own account. Only administrators can allocate funds to cashiers." 
        });
        setSavingId(null);
        return;
      }
      
      const currentRow = rows.find(r => r.user_id === userId);
      if (!currentRow) throw new Error('User not found');
      
      const currentBalance = currentRow.balance || 0;
      const balanceDifference = newBalance - currentBalance;
      
      // If cashier is adding funds, check if they have sufficient balance
      if (userRole === 'cashier' && balanceDifference > 0 && user?.id) {
        if (cashierBalance < balanceDifference) {
          toast({ 
            variant: "destructive", 
            title: "Insufficient Balance", 
            description: `You need ${formatINR(balanceDifference)} but only have ${formatINR(cashierBalance)}` 
          });
          return;
        }
        
        // Deduct from cashier's balance
        const { error: cashierError } = await supabase
          .from("profiles")
          .update({ balance: cashierBalance - balanceDifference })
          .eq("user_id", user.id);
        
        if (cashierError) throw cashierError;
        
        // Update cashier balance in state
        setCashierBalance(cashierBalance - balanceDifference);
      }
      
      // Update target user's balance
      const { error } = await supabase
        .from("profiles")
        .update({ balance: newBalance })
        .eq("user_id", userId);
      
      if (error) throw error;
      
      toast({ 
        title: "Balance updated", 
        description: userRole === 'cashier' && balanceDifference > 0
          ? `Added ${formatINR(balanceDifference)} to ${currentRow.name}'s account`
          : "Employee balance has been saved" 
      });
      
      // Update both recipient's balance and cashier's balance in the rows state
      setRows(prev => prev.map(r => {
        if (r.user_id === userId) {
          // Update recipient's balance
          return { ...r, balance: newBalance };
        } else if (userRole === 'cashier' && balanceDifference > 0 && user?.id && r.user_id === user.id) {
          // Update cashier's balance in the table
          const newCashierBalance = cashierBalance - balanceDifference;
          return { ...r, balance: newCashierBalance };
        }
        return r;
      }));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message || "Failed to update balance" });
    } finally {
      setSavingId(null);
    }
  };

  if (!canEdit) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Access Denied</h1>
          <p className="text-muted-foreground">You don't have permission to access balances.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Employee Balances</h1>
        <p className="text-muted-foreground">
          {userRole === 'cashier' 
            ? `Manage employee balances. Your current balance: ${formatINR(cashierBalance)}`
            : "View and manage initial balances for employees"
          }
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Balances</CardTitle>
              <CardDescription>
                {userRole === 'cashier' 
                  ? "Add funds to employee accounts. Amount will be deducted from your balance."
                  : userRole === 'admin'
                  ? "Add funds to employee accounts. No deduction from your account."
                  : "Add funds to employee accounts"
                }
              </CardDescription>
            </div>
            {userRole === 'admin' && (
              <Button 
                onClick={() => setBulkAddDialogOpen(true)}
                className="flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Add to Multiple Users
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          {loading ? (
            <div className="min-h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[15%]">Name</TableHead>
                    <TableHead className="w-[20%]">Email</TableHead>
                    <TableHead className="w-[12%]">Role</TableHead>
                    <TableHead className="text-right w-[18%]">Current Balance</TableHead>
                    <TableHead className="text-right w-[20%]">Add Amount</TableHead>
                    <TableHead className="text-right w-[15%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (() => {
                  const filteredRows = rows.filter(r => {
                    if (!searchTerm) return true;
                    const search = searchTerm.toLowerCase();
                    return (
                      r.name.toLowerCase().includes(search) ||
                      r.email.toLowerCase().includes(search)
                    );
                  });
                  return filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No users match your search
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <Badge variant={r.role === 'admin' ? 'destructive' : r.role === 'engineer' ? 'default' : r.role === 'cashier' ? 'secondary' : 'outline'}>
                        {r.role.charAt(0).toUpperCase() + r.role.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-medium whitespace-nowrap ${(r.balance || 0) < 0 ? 'text-red-600' : ''}`}>
                        {formatINR(r.balance || 0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          type="number"
                          className="w-32 h-9 min-w-[120px]"
                          placeholder="Add amount"
                          value={addAmounts[r.user_id] || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value || '0');
                            setAddAmounts(prev => ({ ...prev, [r.user_id]: isNaN(val) ? 0 : val }));
                          }}
                          disabled={userRole === 'cashier' && user?.id === r.user_id}
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">INR</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          className="w-20 min-w-[80px]"
                          disabled={savingId === r.user_id || (userRole === 'cashier' && user?.id === r.user_id)}
                          onClick={() => {
                            console.log('Button clicked for user:', r.user_id, 'userRole:', userRole);
                            const amountToAdd = addAmounts[r.user_id] || 0;
                            console.log('Amount to add:', amountToAdd);
                            if (amountToAdd > 0) {
                              addAmountToUser(r.user_id, amountToAdd);
                            } else {
                              toast({ variant: "destructive", title: "Error", description: "Please enter an amount to add" });
                            }
                          }}
                        >
                          {savingId === r.user_id ? "Adding..." : "Add"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                    ))
                  );
                })()}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Add Dialog */}
      <Dialog open={bulkAddDialogOpen} onOpenChange={setBulkAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Amount to Multiple Users</DialogTitle>
            <DialogDescription>
              Select users and enter the amount to add to all selected accounts.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="bulk-amount">Amount to Add (INR)</Label>
              <Input
                id="bulk-amount"
                type="number"
                placeholder="Enter amount"
                value={bulkAmount || ''}
                onChange={(e) => setBulkAmount(parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
              />
            </div>

            {/* Select All / Deselect All */}
            <div className="flex items-center justify-between pb-2 border-b">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all"
                  checked={selectedUserIds.size === rows.length && rows.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedUserIds(new Set(rows.map(r => r.user_id)));
                    } else {
                      setSelectedUserIds(new Set());
                    }
                  }}
                />
                <Label htmlFor="select-all" className="font-medium cursor-pointer">
                  Select All ({rows.length} users)
                </Label>
              </div>
              <span className="text-sm text-muted-foreground">
                {selectedUserIds.size} selected
              </span>
            </div>

            {/* User List with Checkboxes */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No users available
                </p>
              ) : (
                rows.map((r) => (
                  <div key={r.user_id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-md">
                    <Checkbox
                      id={`user-${r.user_id}`}
                      checked={selectedUserIds.has(r.user_id)}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(selectedUserIds);
                        if (checked) {
                          newSet.add(r.user_id);
                        } else {
                          newSet.delete(r.user_id);
                        }
                        setSelectedUserIds(newSet);
                      }}
                    />
                    <Label 
                      htmlFor={`user-${r.user_id}`} 
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-sm text-muted-foreground">{r.email}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-medium ${(r.balance || 0) < 0 ? 'text-red-600' : ''}`}>
                            {formatINR(r.balance || 0)}
                          </div>
                          <Badge variant="outline" className="text-xs mt-1">
                            {r.role}
                          </Badge>
                        </div>
                      </div>
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setBulkAddDialogOpen(false);
                setSelectedUserIds(new Set());
                setBulkAmount(0);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (selectedUserIds.size === 0) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Please select at least one user",
                  });
                  return;
                }
                if (bulkAmount <= 0) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Please enter a valid amount greater than 0",
                  });
                  return;
                }

                try {
                  setBulkAdding(true);
                  
                  // Get admin name for notifications
                  const { data: adminProfile } = await supabase
                    .from("profiles")
                    .select("name")
                    .eq("user_id", user?.id)
                    .single();

                  const userIds = Array.from(selectedUserIds);
                  let successCount = 0;
                  let errorCount = 0;

                  // Add amount to each selected user
                  for (const userId of userIds) {
                    try {
                      const userRow = rows.find(r => r.user_id === userId);
                      if (!userRow) continue;

                      const currentBalance = userRow.balance || 0;
                      const newBalance = currentBalance + bulkAmount;

                      // Update balance in database
                      const { error: updateError } = await supabase
                        .from("profiles")
                        .update({ balance: newBalance })
                        .eq("user_id", userId);

                      if (updateError) throw updateError;

                      // Send notification
                      if (adminProfile) {
                        await notifyBalanceAdded(
                          userId,
                          bulkAmount,
                          adminProfile.name
                        );
                      }

                      successCount++;
                    } catch (error) {
                      console.error(`Error adding amount to user ${userId}:`, error);
                      errorCount++;
                    }
                  }

                  // Update local state
                  setRows(prev => prev.map(r => {
                    if (selectedUserIds.has(r.user_id)) {
                      return { ...r, balance: (r.balance || 0) + bulkAmount };
                    }
                    return r;
                  }));

                  // Show success/error message
                  if (errorCount === 0) {
                    toast({
                      title: "Success",
                      description: `Added ${formatINR(bulkAmount)} to ${successCount} user(s)`,
                    });
                  } else {
                    toast({
                      variant: "destructive",
                      title: "Partial Success",
                      description: `Added amount to ${successCount} user(s), ${errorCount} failed`,
                    });
                  }

                  // Close dialog and reset
                  setBulkAddDialogOpen(false);
                  setSelectedUserIds(new Set());
                  setBulkAmount(0);
                } catch (error: any) {
                  console.error("Error in bulk add:", error);
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: error.message || "Failed to add amount to users",
                  });
                } finally {
                  setBulkAdding(false);
                }
              }}
              disabled={bulkAdding || selectedUserIds.size === 0 || bulkAmount <= 0}
            >
              {bulkAdding 
                ? "Adding..." 
                : bulkAmount > 0 && selectedUserIds.size > 0
                  ? `Add ${formatINR(bulkAmount)} to ${selectedUserIds.size} User(s)`
                  : "Add to Selected Users"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
   
      
      <div className="text-sm text-muted-foreground">
        {userRole === 'cashier' 
          ? "Note: When you add funds to an employee's account, the amount will be deducted from your balance. Balance is automatically reduced when an expense is approved by admin."
          : userRole === 'admin'
          ? "Note: You can add funds to employee accounts without any deduction from your account. Balance is automatically reduced when an expense is approved by admin."
          : "Note: Balance is automatically reduced when an expense is approved by admin."
        }
      </div>
    </div>
  );
}


