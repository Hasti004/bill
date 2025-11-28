import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Save, Bell, Volume2, VolumeX, MapPin, Plus, Edit, Trash2 } from "lucide-react";
import { formatINR } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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

  // Location management
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [locationToEdit, setLocationToEdit] = useState<{ id: string; name: string } | null>(null);
  const [locationName, setLocationName] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [deleteLocationDialogOpen, setDeleteLocationDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingLocation, setDeletingLocation] = useState(false);

  useEffect(() => {
    if (userRole === "admin") {
      fetchSettings();
      fetchLocations();
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
        description: "Manager approval limit has been updated successfully",
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

  // Location management functions
  const fetchLocations = async () => {
    try {
      setLoadingLocations(true);
      const { data, error } = await supabase
        .from("locations")
        .select("id, name")
        .order("name", { ascending: true });

      if (error) throw error;
      setLocations(data || []);
    } catch (error: any) {
      console.error("Error fetching locations:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load locations",
      });
    } finally {
      setLoadingLocations(false);
    }
  };

  const openLocationDialog = (location?: { id: string; name: string }) => {
    if (location) {
      setLocationToEdit(location);
      setLocationName(location.name);
    } else {
      setLocationToEdit(null);
      setLocationName("");
    }
    setLocationDialogOpen(true);
  };

  const saveLocation = async () => {
    if (!locationName.trim()) {
      toast({
        variant: "destructive",
        title: "Invalid Input",
        description: "Location name cannot be empty",
      });
      return;
    }

    try {
      setSavingLocation(true);
      if (locationToEdit) {
        // Update existing location
        const { error } = await supabase
          .from("locations")
          .update({ name: locationName.trim(), updated_at: new Date().toISOString() })
          .eq("id", locationToEdit.id);

        if (error) throw error;
        toast({
          title: "Location Updated",
          description: `Location "${locationName}" has been updated successfully`,
        });
      } else {
        // Create new location
        const { error } = await supabase
          .from("locations")
          .insert({ name: locationName.trim() });

        if (error) throw error;
        toast({
          title: "Location Created",
          description: `Location "${locationName}" has been created successfully`,
        });
      }
      setLocationDialogOpen(false);
      setLocationName("");
      setLocationToEdit(null);
      fetchLocations();
    } catch (error: any) {
      console.error("Error saving location:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save location",
      });
    } finally {
      setSavingLocation(false);
    }
  };

  const openDeleteLocationDialog = (location: { id: string; name: string }) => {
    setLocationToDelete(location);
    setDeleteLocationDialogOpen(true);
  };

  const deleteLocation = async () => {
    if (!locationToDelete) return;

    try {
      setDeletingLocation(true);
      const { error } = await supabase
        .from("locations")
        .delete()
        .eq("id", locationToDelete.id);

      if (error) throw error;
      toast({
        title: "Location Deleted",
        description: `Location "${locationToDelete.name}" has been deleted`,
      });
      setDeleteLocationDialogOpen(false);
      setLocationToDelete(null);
      fetchLocations();
    } catch (error: any) {
      console.error("Error deleting location:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete location",
      });
    } finally {
      setDeletingLocation(false);
    }
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
                    {window.location.hostname === "localhost" && (
                      <span className="block mt-1 text-blue-700">
                        Note: Some browsers may restrict notifications on localhost. If notifications don't appear, try deploying to a production URL with HTTPS.
                      </span>
                    )}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Admin Settings - Only for admins */}
      {userRole === "admin" && (
        <>
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
                    <Label htmlFor="approval-limit">Manager Approval Limit (₹)</Label>
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
                    Expenses below {formatINR(parseFloat(engineerApprovalLimit) || 0)} can be approved directly by managers.
                    Expenses at or above this limit must be verified by managers and then approved by administrators.
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

          {/* Location Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  <CardTitle>Location Management</CardTitle>
                </div>
                <Button onClick={() => openLocationDialog()} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Location
                </Button>
              </div>
              <CardDescription>
                Manage locations for organizing engineers and teams. Useful for income tax audits and organizational structure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLocations ? (
                <p className="text-muted-foreground">Loading locations...</p>
              ) : locations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No locations created yet.</p>
                  <p className="text-sm mt-2">Click "Add Location" to create your first location.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {locations.map((location) => (
                    <div
                      key={location.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">{location.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openLocationDialog(location)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteLocationDialog(location)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Location Dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {locationToEdit ? "Edit Location" : "Add New Location"}
            </DialogTitle>
            <DialogDescription>
              {locationToEdit
                ? "Update the location name"
                : "Create a new location for organizing engineers and teams"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="location-name">Location Name</Label>
              <Input
                id="location-name"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g., London, Mumbai, Delhi"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    saveLocation();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLocationDialogOpen(false);
                setLocationName("");
                setLocationToEdit(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveLocation} disabled={savingLocation || !locationName.trim()}>
              {savingLocation ? "Saving..." : locationToEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Location Confirmation Dialog */}
      <AlertDialog open={deleteLocationDialogOpen} onOpenChange={setDeleteLocationDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{locationToDelete?.name}"? This will remove all engineer assignments to this location. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteLocation}
              className="bg-red-600 hover:bg-red-700"
              disabled={deletingLocation}
            >
              {deletingLocation ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

