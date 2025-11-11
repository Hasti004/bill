import { supabase } from "@/integrations/supabase/client";

export type NotificationType = 
  | "expense_verified" 
  | "expense_approved" 
  | "expense_submitted" 
  | "balance_added";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  expenseId?: string;
}

/**
 * Create a notification for a user
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const { error } = await supabase
      .from("notifications")
      .insert({
        user_id: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        expense_id: params.expenseId || null,
      });

    if (error) {
      console.error("Error creating notification:", error);
      // Don't throw - notifications are non-critical
    }
  } catch (error) {
    console.error("Error creating notification:", error);
    // Don't throw - notifications are non-critical
  }
}

/**
 * Create notification when expense is verified
 */
export async function notifyExpenseVerified(
  expenseId: string,
  expenseTitle: string,
  employeeUserId: string,
  engineerName: string
): Promise<void> {
  await createNotification({
    userId: employeeUserId,
    type: "expense_verified",
    title: "Expense Verified",
    message: `Your expense "${expenseTitle}" has been verified by ${engineerName}`,
    expenseId,
  });
}

/**
 * Create notification when expense is approved
 */
export async function notifyExpenseApproved(
  expenseId: string,
  expenseTitle: string,
  employeeUserId: string,
  approverName: string,
  amount: number
): Promise<void> {
  await createNotification({
    userId: employeeUserId,
    type: "expense_approved",
    title: "Expense Approved",
    message: `Your expense "${expenseTitle}" (₹${amount.toFixed(2)}) has been approved by ${approverName}`,
    expenseId,
  });
}

/**
 * Create notification when new expense is submitted (for engineers/admins)
 */
export async function notifyExpenseSubmitted(
  expenseId: string,
  expenseTitle: string,
  employeeName: string,
  engineerUserId?: string | null,
  adminUserIds?: string[]
): Promise<void> {
  // Notify assigned engineer
  if (engineerUserId) {
    await createNotification({
      userId: engineerUserId,
      type: "expense_submitted",
      title: "New Expense Claim",
      message: `${employeeName} has submitted a new expense: "${expenseTitle}"`,
      expenseId,
    });
  }

  // Notify all admins if no engineer assigned (engineer expenses go to admin)
  if (adminUserIds && adminUserIds.length > 0) {
    const notifications = adminUserIds.map(adminId =>
      createNotification({
        userId: adminId,
        type: "expense_submitted",
        title: "New Expense Claim",
        message: `${employeeName} has submitted a new expense: "${expenseTitle}"`,
        expenseId,
      })
    );
    await Promise.all(notifications);
  }
}

/**
 * Create notification when cashier adds money to account
 */
export async function notifyBalanceAdded(
  userId: string,
  amount: number,
  cashierName: string
): Promise<void> {
  await createNotification({
    userId,
    type: "balance_added",
    title: "Balance Added",
    message: `${cashierName} has added ₹${amount.toFixed(2)} to your account`,
  });
}

/**
 * Create notification when engineer's expense is approved by admin
 */
export async function notifyEngineerExpenseApproved(
  expenseId: string,
  expenseTitle: string,
  engineerUserId: string,
  adminName: string,
  amount: number
): Promise<void> {
  await createNotification({
    userId: engineerUserId,
    type: "expense_approved",
    title: "Expense Approved",
    message: `Your expense "${expenseTitle}" (₹${amount.toFixed(2)}) has been approved by ${adminName}`,
    expenseId,
  });
}

