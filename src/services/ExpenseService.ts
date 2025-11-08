import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Expense = Database["public"]["Tables"]["expenses"]["Row"];
type ExpenseInsert = Database["public"]["Tables"]["expenses"]["Insert"];
type ExpenseUpdate = Database["public"]["Tables"]["expenses"]["Update"];
type LineItem = Database["public"]["Tables"]["expense_line_items"]["Row"];
type LineItemInsert = Database["public"]["Tables"]["expense_line_items"]["Insert"];

export interface ExpenseWithLineItems extends Expense {
  expense_line_items: LineItem[];
}

export interface CreateExpenseData {
  title: string;
  destination: string;
  trip_start: string;
  trip_end: string;
  purpose?: string;
  amount: number;
  category: string;
}

export interface UpdateExpenseData {
  title?: string;
  destination?: string;
  trip_start?: string;
  trip_end?: string;
  purpose?: string;
  status?: "submitted" | "verified" | "approved";
  admin_comment?: string;
  assigned_engineer_id?: string;
  amount?: number;
  category?: string;
}

export class ExpenseService {
  /**
   * Create a new expense with line items
   * Automatically computes total amount from line items
   */
  static async createExpense(
    userId: string,
    data: CreateExpenseData
  ): Promise<ExpenseWithLineItems> {
    // No line items in creation flow; use provided amount as total
    const totalAmount = Number(data.amount || 0);

    // Start transaction
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        user_id: userId,
        title: data.title,
        destination: data.destination,
        trip_start: data.trip_start,
        trip_end: data.trip_end,
        purpose: data.purpose,
        category: data.category,
        total_amount: totalAmount,
        status: data.status || "submitted",
      })
      .select()
      .single();

    if (expenseError) {
      console.error("Expense creation error:", expenseError);
      throw new Error(`Failed to create expense: ${expenseError.message || 'Unknown error'}`);
    }

    // No line items to insert
    const lineItems: LineItem[] = [];

    // Log the action
    await this.logAction(expense.id, userId, "expense_created", "Expense created");

    return {
      ...expense,
      expense_line_items: lineItems,
    };
  }

  /**
   * Update an existing expense
   * Recalculates total amount if line items are updated
   */
  static async updateExpense(
    expenseId: string,
    userId: string,
    data: UpdateExpenseData
  ): Promise<ExpenseWithLineItems> {
    // Check if user can edit this expense
    const canEdit = await this.canUserEditExpense(expenseId, userId);
    if (!canEdit) {
      throw new Error("You don't have permission to edit this expense");
    }

    // Get current expense
    const { data: currentExpense, error: fetchError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .single();

    if (fetchError) throw fetchError;

    // Check if expense can be edited (only submitted expenses can be edited, not verified or approved)
    if (currentExpense.status !== "submitted" && !data.status) {
      throw new Error("Only submitted expenses can be edited. Verified or approved expenses cannot be modified.");
    }

    const totalAmount = currentExpense.total_amount;

    // Update expense
    const updateData: ExpenseUpdate = {
      ...data,
      total_amount: typeof data.amount === 'number' ? data.amount : totalAmount,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedExpense, error: updateError } = await supabase
      .from("expenses")
      .update(updateData)
      .eq("id", expenseId)
      .select()
      .single();

    if (updateError) throw updateError;

    // No line item updates; fetch none
    const lineItems: LineItem[] = [];

    // Log the action
    const action = data.status ? `status_changed_to_${data.status}` : "expense_updated";
    await this.logAction(expenseId, userId, action, data.admin_comment);

    return {
      ...updatedExpense,
      expense_line_items: lineItems,
    };
  }

  /**
   * Submit an expense for review
   */
  static async submitExpense(expenseId: string, userId: string): Promise<Expense> {
    // Check if user can submit this expense
    const canEdit = await this.canUserEditExpense(expenseId, userId);
    if (!canEdit) {
      throw new Error("You don't have permission to submit this expense");
    }

    // Get current expense
    const { data: expense, error: fetchError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .single();

    if (fetchError) throw fetchError;

    if (expense.status !== "submitted") {
      throw new Error("Only submitted expenses can be re-submitted");
    }

    // Line items are not required anymore for submission

    // Find employee's reporting engineer
    const { data: profileRaw, error: profileError } = await supabase
      .from("profiles")
      .select("reporting_engineer_id")
      .eq("user_id", userId)
      .single();

    const profile = profileRaw as unknown as { reporting_engineer_id: string | null } | null;

    if (profileError) throw profileError;

    // Require a reporting engineer so the expense always routes to someone
    if (!profile?.reporting_engineer_id) {
      throw new Error(
        "No reporting engineer is assigned to your profile. Please contact admin to set your reporting engineer before submitting the expense."
      );
    }

    // Auto-assign to reporting engineer and move to submitted
    const updatePayload: any = {
      status: "submitted",
      assigned_engineer_id: profile?.reporting_engineer_id,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedExpense, error: updateError } = await supabase
      .from("expenses")
      .update(updatePayload)
      .eq("id", expenseId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log the action
    const logMsg = `Expense submitted and auto-assigned to engineer ${profile?.reporting_engineer_id}`;
    await this.logAction(expenseId, userId, "expense_submitted", logMsg);

    return updatedExpense;
  }

  /**
   * Assign expense to an engineer
   */
  static async assignToEngineer(
    expenseId: string,
    engineerId: string,
    adminId: string
  ): Promise<Expense> {
    // Check if admin has permission
    const isAdmin = await this.hasRole(adminId, "admin");
    if (!isAdmin) {
      throw new Error("Only administrators can assign expenses to engineers");
    }

    // Check if engineer exists and has engineer role
    const isEngineer = await this.hasRole(engineerId, "engineer");
    if (!isEngineer) {
      throw new Error("Assigned user must have engineer role");
    }

    // Update expense
    const { data: updatedExpense, error: updateError } = await supabase
      .from("expenses")
      .update({
        assigned_engineer_id: engineerId,
        status: "submitted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log the action
    await this.logAction(expenseId, adminId, "expense_assigned", `Assigned to engineer ${engineerId}`);

    return updatedExpense;
  }

  /**
   * Verify expense (engineer action)
   */
  static async verifyExpense(
    expenseId: string,
    engineerId: string,
    comment?: string
  ): Promise<Expense> {
    // Check if engineer has permission
    const canReview = await this.canEngineerReviewExpense(expenseId, engineerId);
    if (!canReview) {
      throw new Error("You don't have permission to review this expense");
    }

    // Ensure expense is not finalized
    const { data: current, error: curErr } = await supabase
      .from("expenses")
      .select("status")
      .eq("id", expenseId)
      .single();
    if (curErr) throw curErr;
    if (current.status === "approved") {
      throw new Error("This expense is already approved and cannot be updated");
    }
    if (current.status !== "submitted") {
      throw new Error("Only submitted expenses can be verified");
    }

    // Update expense status to verified
    const { data: updatedExpense, error: updateError } = await supabase
      .from("expenses")
      .update({
        status: "verified",
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log the action
    await this.logAction(expenseId, engineerId, "expense_verified", comment);

    return updatedExpense;
  }

  /**
   * Approve expense (admin action)
   */
  static async approveExpense(
    expenseId: string,
    adminId: string,
    comment?: string
  ): Promise<Expense> {
    // Check if admin has permission
    const isAdmin = await this.hasRole(adminId, "admin");
    if (!isAdmin) {
      throw new Error("Only administrators can approve expenses");
    }

    // Fetch expense first for amount and user_id
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('id, user_id, total_amount, title, status')
      .eq('id', expenseId)
      .single();

    if (fetchError) throw fetchError;

    // Check if expense is verified (engineer approval required)
    if (expense.status === "approved") {
      throw new Error("This expense is already approved");
    }
    if (expense.status !== "verified") {
      throw new Error("Expense must be verified by an engineer before admin approval");
    }

    // Get current balance before approval
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('balance, name')
      .eq('user_id', expense.user_id)
      .single();

    if (profError) throw profError;

    const currentBalance = Number(profile?.balance ?? 0);
    const expenseAmount = Number(expense.total_amount);
    
    // Check if user has sufficient balance
    if (currentBalance < expenseAmount) {
      throw new Error(
        `Insufficient balance. Employee ${profile?.name} has ₹${currentBalance.toFixed(2)} but expense requires ₹${expenseAmount.toFixed(2)}. Please add balance before approving.`
      );
    }

    // Update expense
    const { data: updatedExpense, error: updateError } = await supabase
      .from("expenses")
      .update({
        status: "approved",
        admin_comment: comment,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Deduct employee balance
    const newBalance = currentBalance - expenseAmount;
    const { error: balanceUpdateError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('user_id', expense.user_id);

    if (balanceUpdateError) {
      // If balance update fails, revert expense status
      await supabase
        .from("expenses")
        .update({
          status: "verified",
          updated_at: new Date().toISOString(),
        })
        .eq("id", expenseId);
      
      throw new Error("Failed to deduct balance. Expense approval reverted.");
    }

    // Log the action with balance information
    const logComment = `${comment || ''} Balance deducted: ₹${expenseAmount.toFixed(2)}. Remaining balance: ₹${newBalance.toFixed(2)}`.trim();
    await this.logAction(expenseId, adminId, "expense_approved", logComment);

    return updatedExpense;
  }

  /**
   * Reject expense (admin action)
   */
  static async rejectExpense(
    expenseId: string,
    adminId: string,
    comment?: string
  ): Promise<Expense> {
    // Check if admin has permission
    const isAdmin = await this.hasRole(adminId, "admin");
    if (!isAdmin) {
      throw new Error("Only administrators can reject expenses");
    }

    // Update expense
    const { data: updatedExpense, error: updateError } = await supabase
      .from("expenses")
      .update({
        status: "rejected",
        admin_comment: comment,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log the action
    await this.logAction(expenseId, adminId, "expense_rejected", comment);

    return updatedExpense;
  }

  /**
   * Get expense with line items
   */
  static async getExpense(expenseId: string): Promise<ExpenseWithLineItems | null> {
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .single();

    if (expenseError) return null;

    const { data: lineItems, error: lineItemsError } = await supabase
      .from("expense_line_items")
      .select("*")
      .eq("expense_id", expenseId);

    if (lineItemsError) return null;

    return {
      ...expense,
      expense_line_items: lineItems || [],
    };
  }

  /**
   * Check if user can edit expense
   */
  private static async canUserEditExpense(expenseId: string, userId: string): Promise<boolean> {
    // Check if user is admin
    const isAdmin = await this.hasRole(userId, "admin");
    if (isAdmin) return true;

    // Check if user owns the expense
    const { data: expense, error } = await supabase
      .from("expenses")
      .select("user_id, status")
      .eq("id", expenseId)
      .single();

    if (error) return false;

    return expense.user_id === userId && expense.status === "submitted";
  }

  /**
   * Check if engineer can review expense
   */
  private static async canEngineerReviewExpense(expenseId: string, engineerId: string): Promise<boolean> {
    const { data: expense, error } = await supabase
      .from("expenses")
      .select("assigned_engineer_id")
      .eq("id", expenseId)
      .single();

    if (error) return false;

    return expense.assigned_engineer_id === engineerId;
  }

  /**
   * Check if user has specific role
   */
  private static async hasRole(userId: string, role: "admin" | "engineer" | "employee"): Promise<boolean> {
    // Return false if userId is empty or invalid
    if (!userId || userId.trim() === "") {
      return false;
    }

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", role)
      .maybeSingle();

    if (error) return false;

    return !!data;
  }

  /**
   * Log action in audit trail
   */
  private static async logAction(
    expenseId: string,
    userId: string,
    action: string,
    comment?: string
  ): Promise<void> {
    await supabase
      .from("audit_logs")
      .insert({
        expense_id: expenseId,
        user_id: userId,
        action,
        comment,
      });
  }
}
