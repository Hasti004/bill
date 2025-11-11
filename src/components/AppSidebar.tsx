import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Users,
  FileText,
  LogOut,
  BarChart3,
  Bell,
  Tag,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const { userRole, signOut } = useAuth();

  const employeeItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "My Expenses", url: "/expenses", icon: Receipt },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Notifications", url: "/notifications", icon: Bell },
  ];

  const engineerItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "My Expenses", url: "/expenses", icon: Receipt },
    { title: "Review Expenses", url: "/review", icon: FileText },
    { title: "Notifications", url: "/notifications", icon: Bell },
  ];

  const adminItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "All Expenses", url: "/admin/expenses", icon: Receipt },
    { title: "Balances", url: "/balances", icon: FileText },
    { title: "Manage Users", url: "/admin/users", icon: Users },
    { title: "Categories", url: "/admin/categories", icon: Tag },
    { title: "Reports", url: "/admin/reports", icon: FileText },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Settings", url: "/settings", icon: SettingsIcon },
    { title: "Notifications", url: "/notifications", icon: Bell },
  ];

  // Debug: Log admin items to console
  if (userRole === "admin") {
    console.log("Admin items:", adminItems.map(item => item.title));
  }

  const cashierItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "All Expenses", url: "/admin/expenses", icon: Receipt },
    { title: "Balances", url: "/balances", icon: FileText },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Notifications", url: "/notifications", icon: Bell },
  ];

  const items = 
    userRole === "admin" ? adminItems :
    userRole === "engineer" ? engineerItems :
    userRole === "cashier" ? cashierItems :
    employeeItems;

  return (
    <Sidebar className="border-r-0 sm:border-r">
      <SidebarContent className="px-2 sm:px-0">
        {/* Mobile-optimized Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
            <span className="font-bold text-base sm:text-lg truncate">ExpenseTracker</span>
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="px-4 sm:px-6 text-xs sm:text-sm">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="px-2 sm:px-0">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <NavLink 
                    to={item.url}
                    end={item.url === "/dashboard"}
                    className={({ isActive }) => {
                      const baseClasses = "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors h-10 sm:h-9";
                      if (isActive) {
                        return `${baseClasses} bg-gray-200 text-gray-900 font-semibold`;
                      }
                      return `${baseClasses} text-sidebar-foreground hover:bg-gray-100 hover:text-gray-900`;
                    }}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2 sm:px-0">
        <Button
          variant="ghost"
          className="w-full justify-start h-10 sm:h-9 text-sm"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="truncate">Sign Out</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
