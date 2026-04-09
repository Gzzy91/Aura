import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';
import { ReminderTiming } from '@/types';

const getReminderOffset = (timing: ReminderTiming): number => {
  switch (timing) {
    case '0m': return 0;
    case '1h': return 60 * 60 * 1000;
    case '2h': return 2 * 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    case '2d': return 2 * 24 * 60 * 60 * 1000;
    default: return 0;
  }
};

export function NotificationManager() {
  const { quests, notifiedQuestIds, markNotified } = useStore();

  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      
      quests.forEach(quest => {
        if (quest.completed || !quest.dueDate || !quest.reminderTiming || quest.reminderTiming === 'none') return;
        if (notifiedQuestIds.includes(quest.id)) return;

        const offset = getReminderOffset(quest.reminderTiming);
        const reminderTime = quest.dueDate - offset;

        if (now >= reminderTime) {
          // Trigger in-app notification
          toast(quest.title, {
            description: `Erinnerung: Deine Quest "${quest.title}" ist bald fällig!`,
            icon: <Bell className="w-4 h-4 text-amber-500" />,
            duration: 10000,
          });

          // Trigger browser notification if permitted
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Quest Erinnerung', {
              body: `Deine Quest "${quest.title}" ist bald fällig!`,
              icon: '/favicon.ico' // Assuming a favicon exists
            });
          }

          markNotified(quest.id);
        }
      });
    };

    // Check immediately on mount
    checkReminders();

    // Check every minute
    const interval = setInterval(checkReminders, 60000);
    return () => clearInterval(interval);
  }, [quests, notifiedQuestIds, markNotified]);

  return null;
}
