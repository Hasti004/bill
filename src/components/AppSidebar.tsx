import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Users,
  FileText,
  LogOut,
  BarChart3,
  FileType,
  Bell,
  Tag,
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
    { title: "Templates", url: "/templates", icon: FileType },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Notifications", url: "/notifications", icon: Bell },
  ];

  const engineerItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Review Expenses", url: "/review", icon: FileText },
    { title: "Balances", url: "/balances", icon: FileText },
    { title: "Templates", url: "/templates", icon: FileType },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Notifications", url: "/notifications", icon: Bell },
  ];

  const adminItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "All Expenses", url: "/admin/expenses", icon: Receipt },
    { title: "Balances", url: "/balances", icon: FileText },
    { title: "Manage Users", url: "/admin/users", icon: Users },
    { title: "Categories", url: "/admin/categories", icon: Tag },
    { title: "Reports", url: "/admin/reports", icon: FileText },
    { title: "Templates", url: "/templates", icon: FileType },
    { title: "Analytics", url: "/analytics", icon: BarChart3 },
    { title: "Notifications", url: "/notifications", icon: Bell },
  ];

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
                  <SidebarMenuButton asChild className="h-10 sm:h-9">
                    <NavLink 
                      to={item.url}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive 
                            ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
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
