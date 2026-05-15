import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<number>(5000);

  // Fetch unread count + list
  const unreadCountQuery = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: pollingInterval,
  });

  const notificationsQuery = trpc.notifications.list.useQuery(
    { limit: 10 },
    { enabled: isOpen }
  );

  const markRead = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      unreadCountQuery.refetch();
      notificationsQuery.refetch();
    },
  });

  // Stop polling when bell is closed to save bandwidth
  useEffect(() => {
    setPollingInterval(isOpen ? 2000 : 10000);
  }, [isOpen]);

  const unreadCount = (unreadCountQuery.data as { count: number } | undefined)?.count ?? 0;
  const notifications = notificationsQuery.data ?? [];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-accent rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-600 rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-popover border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="sticky top-0 bg-popover border-b px-4 py-3 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  // Mark all as read
                  notifications
                    .filter((n) => !n.readAt)
                    .forEach((n) => {
                      markRead.mutate({ notificationId: n.id as number });
                    });
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Mark all read
              </button>
            )}
          </div>

          {notificationsQuery.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Loading…
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 text-xs cursor-pointer hover:bg-accent transition-colors ${
                    !n.readAt ? "bg-accent/50" : ""
                  }`}
                  onClick={() => {
                    if (!n.readAt) {
                      markRead.mutate({ notificationId: n.id as number });
                    }
                  }}
                >
                  <div className="font-medium">
                    {n.type === "comment_mention"
                      ? "You were mentioned in a comment"
                      : n.type === "comment_resolved"
                      ? "A comment was resolved"
                      : "New notification"}
                  </div>
                  <div className="text-muted-foreground mt-1">
                    Deal: {n.dealId?.slice(0, 12)}…
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
