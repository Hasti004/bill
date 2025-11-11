import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Save } from "lucide-react";
import { formatINR } from "@/lib/format";

export default function Settings() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  
  const [engineerApprovalLimit, setEngineerApprovalLimit] = useState<string>("50000");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userRole === "admin") {
      fetchSettings();
    }
  }, [userRole]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("key", "engineer_approval_limit")
        .maybeSingle();

      if (error) {
        // If table doesn't exist, show helpful message
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          console.warn("Settings table does not exist. Please run the SQL migration first.");
          // Keep default value of 50000
          setLoading(false);
          return;
        }
        throw error;
      }

      if (data) {
        setEngineerApprovalLimit(data.value);
      }
    } catch (error: any) {
      console.error("Error fetching settings:", error);
      // Don't show error toast if table doesn't exist - just use default
      if (error.code !== '42P01' && !error.message?.includes('does not exist')) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load settings. Using default value.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const limitValue = parseFloat(engineerApprovalLimit);
      
      if (isNaN(limitValue) || limitValue < 0) {
        toast({
          variant: "destructive",
          title: "Invalid Input",
          description: "Please enter a valid positive number",
        });
        return;
      }

      // Upsert the setting
      const { error } = await supabase
        .from("settings")
        .upsert({
          key: "engineer_approval_limit",
          value: limitValue.toString(),
          description: "Maximum amount (in rupees) that engineers can approve directly. Expenses below this limit can be approved by engineers, above this limit must go to admin.",
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "key"
        });

      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          toast({
            variant: "destructive",
            title: "Database Table Missing",
            description: "Please run the SQL migration to create the settings table first. Check supabase/migrations/20250113000000_create_settings_table.sql",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Settings Saved",
        description: "Engineer approval limit has been updated successfully",
      });
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save settings",
      });
    } finally {
      setSaving(false);
    }
  };

  if (userRole !== "admin") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage system-wide configuration settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            <CardTitle>Engineer Approval Settings</CardTitle>
          </div>
          <CardDescription>
            Configure the maximum amount that engineers can approve directly for their assigned employees
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">Loading settings...</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="approval-limit">Engineer Approval Limit (₹)</Label>
                <Input
                  id="approval-limit"
                  type="number"
                  min="0"
                  step="1"
                  value={engineerApprovalLimit}
                  onChange={(e) => setEngineerApprovalLimit(e.target.value)}
                  placeholder="50000"
                  className="max-w-xs"
                />
                <p className="text-sm text-muted-foreground">
                  Expenses below {formatINR(parseFloat(engineerApprovalLimit) || 0)} can be approved directly by engineers.
                  Expenses at or above this limit must be verified by engineers and then approved by administrators.
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={saveSettings} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

