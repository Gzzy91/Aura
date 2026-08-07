export async function sendBrowserNotification(title: string, options?: NotificationOptions) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  // 1. Try ServiceWorkerRegistration.showNotification if available
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, options);
        return;
      }
    } catch (e) {
      console.warn('ServiceWorker showNotification failed:', e);
    }
  }

  // 2. Fallback to `new Notification()` inside a try/catch block
  // Note: On Android Chrome / mobile WebViews, `new Notification()` throws an Illegal constructor error.
  try {
    new Notification(title, options);
  } catch (err) {
    console.warn('Direct Notification constructor failed or unsupported:', err);
  }
}
