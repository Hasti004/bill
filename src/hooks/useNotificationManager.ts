import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { NotificationPopup } from "@/components/NotificationPopup";
import { useNavigate } from "react-router-dom";

interface Notification {
  id: string;
  type: "expense_submitted" | "expense_approved" | "expense_rejected" | "expense_assigned" | "expense_verified" | "balance_added";
  title: string;
  message: string;
  expense_id: string | null;
  created_at: string;
}

interface NotificationSettings {
  popup_enabled: boolean;
  sound_enabled: boolean;
  desktop_enabled: boolean;
}

export function useNotificationManager() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeNotifications, setActiveNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    popup_enabled: true,
    sound_enabled: true,
    desktop_enabled: false,
  });

  useEffect(() => {
    if (user) {
      loadSettings();
      // Request notification permission on mount
      requestNotificationPermission();
    }
  }, [user]);

  const requestNotificationPermission = async () => {
    if ("Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.error("Error requesting notification permission:", error);
      }
    }
  };

  useEffect(() => {
    if (user) {
      const cleanup = setupRealtimeSubscription();
      return cleanup;
    }
  }, [user, settings]);

  const loadSettings = () => {
    try {
      const stored = localStorage.getItem(`notification_settings_${user?.id}`);
      if (stored) {
        setSettings(JSON.parse(stored));
      } else {
        // Default to enabled for Windows notifications
        setSettings({
          popup_enabled: true,
          sound_enabled: true,
          desktop_enabled: true,
        });
      }
    } catch (error) {
      console.error("Error loading notification settings:", error);
    }
  };

  const playNotificationSound = () => {
    if (settings.sound_enabled) {
      // Create a simple notification sound
      const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGWi77+efTRAMUKfj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBhou+/nn00QDFCn4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC");
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Ignore errors if audio can't play
      });
    }
  };

  const showDesktopNotification = (notification: Notification) => {
    // Check if browser supports notifications
    if (!("Notification" in window)) {
      console.log("This browser does not support desktop notifications");
      return;
    }

    // Check permission
    if (Notification.permission === "granted") {
      try {
        const desktopNotif = new Notification(notification.title, {
          body: notification.message,
          icon: window.location.origin + "/favicon.ico",
          badge: window.location.origin + "/favicon.ico",
          tag: notification.id,
          requireInteraction: false,
          silent: !settings.sound_enabled,
          timestamp: new Date(notification.created_at).getTime(),
          dir: "ltr",
        });

        // Make notification clickable - navigate to expense if available
        desktopNotif.onclick = (event) => {
          event.preventDefault();
          window.focus();
          if (notification.expense_id) {
            navigate(`/expenses/${notification.expense_id}`);
          } else {
            navigate("/notifications");
          }
          desktopNotif.close();
        };

        // Auto-close after 5 seconds
        setTimeout(() => {
          desktopNotif.close();
        }, 5000);
      } catch (error) {
        console.error("Error showing desktop notification:", error);
      }
    } else if (Notification.permission === "default") {
      // Request permission if not yet asked
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          // Retry showing notification
          showDesktopNotification(notification);
        }
      });
    } else {
      console.log("Notification permission denied");
    }
  };

  const setupRealtimeSubscription = () => {
    if (!user?.id) return () => {};

    const channel = supabase
      .channel('notification-popups')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, 
        (payload) => {
          const newNotif = payload.new as any;
          const notification: Notification = {
            id: newNotif.id,
            type: newNotif.type,
            title: newNotif.title,
            message: newNotif.message,
            expense_id: newNotif.expense_id,
            created_at: newNotif.created_at,
          };

          // Show popup if enabled
          if (settings.popup_enabled) {
            setActiveNotifications(prev => [...prev, notification]);
          }

          // Play sound if enabled
          playNotificationSound();

          // Show native Windows desktop notification (like WhatsApp) if enabled
          // This appears in Windows notification center
          if (settings.desktop_enabled) {
            showDesktopNotification(notification);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const removeNotification = useCallback((id: string) => {
    setActiveNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const handleViewNotification = useCallback((expenseId: string | null) => {
    if (expenseId) {
      navigate(`/expenses/${expenseId}`);
    }
  }, [navigate]);

  return {
    activeNotifications,
    removeNotification,
    handleViewNotification,
  };
}

