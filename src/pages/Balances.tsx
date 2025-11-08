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

  const canEdit = userRole === "admin" || userRole === "cashier" || userRole === "engineer";

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      
      // Fetch profiles with roles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email, balance")
        .order("name", { ascending: true });
      
      if (profilesError) throw profilesError;
      
      // Fetch roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      
      if (rolesError) throw rolesError;
      
      // Create role map
      const roleMap = new Map(rolesData?.map(r => [r.user_id, r.role]) || []);
      
      // Combine data
      const combinedData = (profilesData || []).map((r: any) => ({
        user_id: r.user_id,
        name: r.name,
        email: r.email,
        balance: typeof r.balance === 'number' ? r.balance : 0,
        role: roleMap.get(r.user_id) || 'employee',
      }));
      
      setRows(combinedData);
      
      // If user is cashier, fetch their balance
      if (userRole === 'cashier' && user?.id) {
        console.log('Cashier user ID:', user.id);
        console.log('Available profiles:', combinedData.map(p => ({ user_id: p.user_id, name: p.name, balance: p.balance })));
        const cashierProfile = combinedData.find(p => p.user_id === user.id);
        console.log('Found cashier profile:', cashierProfile);
        setCashierBalance(cashierProfile?.balance || 0);
        console.log('Set cashier balance to:', cashierProfile?.balance || 0);
      }
    } catch (e: any) {
      console.error("Error loading balances", e);
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
      
      // If cashier is adding funds, check if they have sufficient balance and deduct from their account
      if (userRole === 'cashier' && amountToAdd > 0 && user?.id) {
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
      
      toast({ 
        title: "Amount added", 
        description: `Added ${formatINR(amountToAdd)} to ${currentRow.name}'s account` 
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
          <CardTitle>Balances</CardTitle>
          <CardDescription>
            {userRole === 'cashier' 
              ? "Add funds to employee accounts. Amount will be deducted from your balance."
              : userRole === 'admin'
              ? "Add funds to employee accounts. No deduction from your account."
              : "Add funds to employee accounts"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Current Balance</TableHead>
                  <TableHead className="text-right">Add Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <Badge variant={r.role === 'admin' ? 'destructive' : r.role === 'engineer' ? 'default' : r.role === 'cashier' ? 'secondary' : 'outline'}>
                        {r.role.charAt(0).toUpperCase() + r.role.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-medium">{formatINR(r.balance || 0)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          type="number"
                          className="w-32 h-9"
                          placeholder="Add amount"
                          value={addAmounts[r.user_id] || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value || '0');
                            setAddAmounts(prev => ({ ...prev, [r.user_id]: isNaN(val) ? 0 : val }));
                          }}
                          disabled={userRole === 'cashier' && user?.id === r.user_id}
                        />
                        <span className="text-xs text-muted-foreground">INR</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
   
      
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


