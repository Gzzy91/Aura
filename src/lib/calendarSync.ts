import { Quest } from '@/types';
import { format } from 'date-fns';

export function generateICS(quests: Quest[]): string {
  let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//LifeQuest//DE\nCALSCALE:GREGORIAN\n';

  quests.forEach(quest => {
    if (!quest.dueDate) return;

    const startDate = new Date(quest.dueDate);
    // Standard duration: 1 hour if no end time is specified
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    ics += 'BEGIN:VEVENT\n';
    ics += `UID:${quest.id}@lifequest.app\n`;
    ics += `DTSTAMP:${formatICSDate(new Date())}\n`;
    ics += `DTSTART:${formatICSDate(startDate)}\n`;
    ics += `DTEND:${formatICSDate(endDate)}\n`;
    ics += `SUMMARY:${quest.title}\n`;
    if (quest.description) {
      ics += `DESCRIPTION:${quest.description.replace(/\n/g, '\\n')}\n`;
    }
    ics += 'END:VEVENT\n';
  });

  ics += 'END:VCALENDAR';
  return ics;
}

export function downloadICS(quests: Quest[], filename: string = 'lifequest.ics') {
  const icsContent = generateICS(quests);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getGoogleCalendarLink(quest: Quest): string | null {
  if (!quest.dueDate) return null;

  const startDate = new Date(quest.dueDate);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

  const formatGoogleDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.append('action', 'TEMPLATE');
  url.searchParams.append('text', quest.title);
  url.searchParams.append('dates', `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`);
  
  if (quest.description) {
    url.searchParams.append('details', quest.description);
  }

  return url.toString();
}
