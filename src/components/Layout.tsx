import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/format";
import { Wallet, Pencil } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { userProfile, userRole, user, refreshUserProfile } = useAuth();
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  
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
        <main className="flex-1 flex flex-col min-w-0">
          {/* Mobile-optimized Header */}
          <header className="border-b bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/60 shadow-sm sticky top-0 z-40">
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

          {/* Edit Name Drawer */}
          <Sheet open={editOpen} onOpenChange={setEditOpen}>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Edit Profile</SheetTitle>
                <SheetDescription>Update your display name</SheetDescription>
              </SheetHeader>
              <div className="py-4 space-y-3">
                <label className="text-sm font-medium text-gray-700">Full Name</label>
                <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Your name" />
                <div className="pt-2 flex gap-2">
                  <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button disabled={savingName || !nameDraft.trim()} onClick={async () => {
                    if (!user?.id) return;
                    try {
                      setSavingName(true);
                      const { error } = await supabase
                        .from("profiles")
                        .update({ name: nameDraft.trim() })
                        .eq("user_id", user.id);
                      if (error) throw error;
                      await refreshUserProfile(user.id);
                      setEditOpen(false);
                    } catch (e) {
                      console.error("Failed to update name", e);
                    } finally {
                      setSavingName(false);
                    }
                  }}>{savingName ? 'Saving...' : 'Save'}</Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </main>
      </div>
    </SidebarProvider>
  );
}
