import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/format";
import { Wallet, Pencil, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useNotificationManager } from "@/hooks/useNotificationManager";
import { NotificationPopup } from "@/components/NotificationPopup";

export function Layout({ children }: { children: React.ReactNode }) {
  const { userProfile, userRole, user, refreshUserProfile } = useAuth();
  const { toast } = useToast();
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  const { activeNotifications, removeNotification, handleViewNotification } = useNotificationManager();
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Administrator';
      case 'engineer':
        return 'Engineer';
      case 'employee':
        return 'Employee';
      case 'cashier':
        return 'Cashier';
      default:
        return 'User';
    }
  };

  useEffect(() => {
    if (user && (userRole === 'employee' || userRole === 'cashier')) {
      fetchUserBalance();
    }
  }, [user, userRole]);

  const fetchUserBalance = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("balance")
        .eq("user_id", user?.id)
        .single();

      if (error) throw error;
      setUserBalance(data?.balance ?? 0);
    } catch (error) {
      console.error("Error fetching user balance:", error);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0 relative">
          {/* Mobile-optimized Header */}
          <header className="border-b bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/60 shadow-sm sticky top-0 z-30">
            <div className="flex h-14 sm:h-16 items-center gap-2 sm:gap-4 px-3 sm:px-6">
              <SidebarTrigger className="hover:bg-gray-100 rounded-lg p-2 transition-colors flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h1 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                  Expense Management
                </h1>
                <p className="text-xs text-gray-500 hidden sm:block">
                  Expense Management System
                </p>
              </div>
              
              {/* User Profile Section */}
              <div className="flex items-center gap-3">
                {/* Balance indicator for employees and cashiers */}
                {(userRole === 'employee' || userRole === 'cashier') && userBalance !== null && (
                  <div className={`hidden md:flex items-center gap-2 px-3 py-1 border rounded-lg ${
                    userRole === 'cashier' 
                      ? 'bg-purple-50 border-purple-200' 
                      : 'bg-green-50 border-green-200'
                  }`}>
                    <Wallet className={`h-4 w-4 ${
                      userRole === 'cashier' ? 'text-purple-600' : 'text-green-600'
                    }`} />
                    <span className={`text-sm font-medium ${
                      userRole === 'cashier' ? 'text-purple-700' : 'text-green-700'
                    }`}>
                      {formatINR(userBalance)}
                    </span>
                  </div>
                )}
                
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">
                    {userProfile?.name || 'Loading...'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {userRole ? getRoleDisplayName(userRole) : ''}
                  </p>
                </div>
                <button
                  aria-label="Edit name"
                  className="p-2 rounded hover:bg-gray-100 hidden sm:inline-flex"
                  onClick={() => { setNameDraft(userProfile?.name || ""); setEditOpen(true); }}
                >
                  <Pencil className="h-4 w-4 text-gray-600" />
                </button>
                <Avatar className="h-8 w-8 sm:h-9 sm:w-9">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs sm:text-sm">
                    {userProfile?.name ? getInitials(userProfile.name) : 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </header>
          
          {/* Mobile-optimized Content */}
          <div className="flex-1 p-3 sm:p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </div>

          {/* Edit Profile Drawer */}
          <Sheet open={editOpen} onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) {
              // Reset all fields when closing
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setShowCurrentPassword(false);
              setShowNewPassword(false);
              setShowConfirmPassword(false);
            }
          }}>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Edit Profile</SheetTitle>
                <SheetDescription>Update your display name and password</SheetDescription>
              </SheetHeader>
              <div className="py-4 space-y-6">
                {/* Name Section */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700">Full Name</Label>
                  <Input 
                    id="name"
                    value={nameDraft} 
                    onChange={(e) => setNameDraft(e.target.value)} 
                    placeholder="Your name" 
                  />
                </div>

                <Separator />

                {/* Password Change Section */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Change Password</Label>
                    <p className="text-xs text-gray-500 mt-1">Enter your current password and set a new one</p>
                  </div>

                  {/* Current Password */}
                  <div className="space-y-2">
                    <Label htmlFor="current-password" className="text-sm font-medium text-gray-700">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="current-password"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter your current password"
                        className="pr-10"
                      />
                      {currentPassword && (
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                          aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                        >
                          {showCurrentPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* New Password */}
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-sm font-medium text-gray-700">New Password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password (min 8 characters)"
                        className={`pr-10 ${
                          newPassword && newPassword.length < 8 ? "border-red-300 focus:border-red-500" : ""
                        }`}
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                        {newPassword && newPassword.length >= 8 && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {newPassword && (
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                            aria-label={showNewPassword ? "Hide password" : "Show password"}
                          >
                            {showNewPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    {newPassword && newPassword.length < 8 && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Password must be at least 8 characters long
                      </p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-sm font-medium text-gray-700">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className={`pr-10 ${
                          confirmPassword && newPassword && confirmPassword !== newPassword ? "border-red-300 focus:border-red-500" : ""
                        }`}
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                        {confirmPassword && newPassword && confirmPassword === newPassword && newPassword.length >= 8 && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {confirmPassword && (
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    {confirmPassword && newPassword && confirmPassword !== newPassword && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Passwords do not match
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setEditOpen(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    disabled={savingName || changingPassword || !nameDraft.trim()} 
                    onClick={async () => {
                      if (!user?.id) return;
                      try {
                        setSavingName(true);
                        const { error } = await supabase
                          .from("profiles")
                          .update({ name: nameDraft.trim() })
                          .eq("user_id", user.id);
                        if (error) throw error;
                        await refreshUserProfile(user.id);
                        toast({
                          title: "Profile Updated",
                          description: "Your name has been updated successfully",
                        });
                      } catch (e: any) {
                        console.error("Failed to update name", e);
                        toast({
                          variant: "destructive",
                          title: "Error",
                          description: e.message || "Failed to update name",
                        });
                      } finally {
                        setSavingName(false);
                      }
                    }}
                    className="flex-1"
                  >
                    {savingName ? 'Saving...' : 'Save Name'}
                  </Button>
                </div>

                {/* Change Password Button */}
                {(currentPassword || newPassword || confirmPassword) && (
                  <Button 
                    disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword || newPassword.length < 8 || newPassword !== confirmPassword}
                    onClick={async () => {
                      if (!user?.email) return;
                      
                      try {
                        setChangingPassword(true);

                        // Verify current password by attempting to sign in
                        const { error: signInError } = await supabase.auth.signInWithPassword({
                          email: user.email,
                          password: currentPassword,
                        });

                        if (signInError) {
                          throw new Error("Current password is incorrect");
                        }

                        // Update password
                        const { error: updateError } = await supabase.auth.updateUser({
                          password: newPassword,
                        });

                        if (updateError) throw updateError;

                        toast({
                          title: "Password Changed",
                          description: "Your password has been updated successfully",
                        });

                        // Clear password fields
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                      } catch (e: any) {
                        console.error("Failed to change password", e);
                        toast({
                          variant: "destructive",
                          title: "Error",
                          description: e.message || "Failed to change password",
                        });
                      } finally {
                        setChangingPassword(false);
                      }
                    }}
                    className="w-full"
                  >
                    {changingPassword ? 'Changing Password...' : 'Change Password'}
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </main>
        
        {/* Notification Popups */}
        <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2">
          {activeNotifications.map((notification, index) => (
            <NotificationPopup
              key={notification.id}
              id={notification.id}
              type={notification.type}
              title={notification.title}
              message={notification.message}
              expenseId={notification.expense_id}
              createdAt={notification.created_at}
              onClose={() => removeNotification(notification.id)}
              onView={() => handleViewNotification(notification.expense_id)}
            />
          ))}
        </div>
      </div>
    </SidebarProvider>
  );
}
