import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Save, Bell, Volume2, VolumeX } from "lucide-react";
import { formatINR } from "@/lib/format";

interface NotificationSettings {
  popup_enabled: boolean;
  sound_enabled: boolean;
  desktop_enabled: boolean;
}

export default function Settings() {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  
  // Admin settings
  const [engineerApprovalLimit, setEngineerApprovalLimit] = useState<string>("50000");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    popup_enabled: true,
    sound_enabled: true,
    desktop_enabled: true, // Enable by default for Windows notifications
  });
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  useEffect(() => {
    if (userRole === "admin") {
      fetchSettings();
    }
    if (user) {
      loadNotificationSettings();
    }
  }, [userRole, user]);

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

  const loadNotificationSettings = async () => {
    try {
      setLoadingNotifications(true);
      // Try to load from database first
      const { data, error } = await supabase
        .from("profiles")
        .select("notification_settings")
        .eq("user_id", user?.id)
        .single();

      if (!error && data?.notification_settings) {
        setNotificationSettings({
          popup_enabled: data.notification_settings.popup_enabled ?? true,
          sound_enabled: data.notification_settings.sound_enabled ?? true,
          desktop_enabled: data.notification_settings.desktop_enabled ?? false,
        });
      } else {
        // Fallback to localStorage
        const stored = localStorage.getItem(`notification_settings_${user?.id}`);
        if (stored) {
          setNotificationSettings(JSON.parse(stored));
        }
      }
    } catch (error) {
      console.error("Error loading notification settings:", error);
      // Fallback to localStorage
      const stored = localStorage.getItem(`notification_settings_${user?.id}`);
      if (stored) {
        setNotificationSettings(JSON.parse(stored));
      }
    } finally {
      setLoadingNotifications(false);
    }
  };

  const saveNotificationSettings = async (newSettings: NotificationSettings) => {
    try {
      setNotificationSettings(newSettings);
      
      // Save to localStorage immediately
      localStorage.setItem(`notification_settings_${user?.id}`, JSON.stringify(newSettings));

      // Try to save to database
      const { error } = await supabase
        .from("profiles")
        .update({
          notification_settings: newSettings,
        })
        .eq("user_id", user?.id);

      if (error) {
        console.error("Error saving to database, using localStorage only:", error);
      }

      toast({
        title: "Settings saved",
        description: "Your notification preferences have been updated",
      });
    } catch (error) {
      console.error("Error saving notification settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings",
      });
    }
  };

  const updateNotificationSetting = (key: keyof NotificationSettings, value: boolean) => {
    const newSettings = { ...notificationSettings, [key]: value };
    saveNotificationSettings(newSettings);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your preferences and system configuration
        </p>
      </div>

      {/* Notification Settings - Available for all users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Control how notifications appear and behave
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loadingNotifications ? (
            <p className="text-muted-foreground">Loading notification settings...</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="popup" className="text-base">
                    Popup Notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Show WhatsApp-style popup notifications when new notifications arrive
                  </p>
                </div>
                <Switch
                  id="popup"
                  checked={notificationSettings.popup_enabled}
                  onCheckedChange={(checked) => updateNotificationSetting("popup_enabled", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sound" className="text-base flex items-center gap-2">
                    {notificationSettings.sound_enabled ? (
                      <Volume2 className="h-4 w-4" />
                    ) : (
                      <VolumeX className="h-4 w-4" />
                    )}
                    Sound Notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Play a sound when new notifications arrive
                  </p>
                </div>
                <Switch
                  id="sound"
                  checked={notificationSettings.sound_enabled}
                  onCheckedChange={(checked) => updateNotificationSetting("sound_enabled", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="desktop" className="text-base">
                    Windows Desktop Notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Show native Windows notifications in the notification center (like WhatsApp). Click to open the expense.
                  </p>
                </div>
                <Switch
                  id="desktop"
                  checked={notificationSettings.desktop_enabled}
                  onCheckedChange={async (checked) => {
                    if (checked && "Notification" in window) {
                      const permission = await Notification.requestPermission();
                      if (permission === "granted") {
                        updateNotificationSetting("desktop_enabled", true);
                        toast({
                          title: "Notifications enabled",
                          description: "You'll receive Windows desktop notifications for new updates",
                        });
                      } else if (permission === "denied") {
                        toast({
                          variant: "destructive",
                          title: "Permission denied",
                          description: "Please enable desktop notifications in your browser settings (Site Settings > Notifications)",
                        });
                        updateNotificationSetting("desktop_enabled", false);
                      } else {
                        updateNotificationSetting("desktop_enabled", false);
                      }
                    } else {
                      updateNotificationSetting("desktop_enabled", checked);
                    }
                  }}
                />
              </div>
              {notificationSettings.desktop_enabled && "Notification" in window && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-xs text-blue-800">
                    ✓ Windows notifications are enabled. You'll see notifications in the Windows notification center when new updates arrive.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Admin Settings - Only for admins */}
      {userRole === "admin" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              <CardTitle>Admin Settings</CardTitle>
            </div>
            <CardDescription>
              Configure system-wide settings (Admin only)
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
      )}
    </div>
  );
}

