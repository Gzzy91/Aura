import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Eye, EyeOff, HeartPulse, Lock, Unlock, User as UserIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { HealthSourcesSettings } from '@/components/HealthSourcesSettings';

export function Settings() {
  const { user, stats, settings, updateSettings, setLocked } = useStore();
  const navigate = useNavigate();

  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        setPermission(Notification.permission);
      } catch (e) {
        console.warn('Could not read Notification permission:', e);
      }
    }
  }, []);

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Dein Browser unterstützt keine Desktop-Benachrichtigungen.');
      return;
    }

    try {
      if (Notification.permission === 'denied') {
        toast.error(
          'Benachrichtigungen sind blockiert. Klicke auf das Schloss-Symbol in der Adressleiste deines Browsers, wähle "Benachrichtigungen" und setze sie auf "Zulassen". Lade die Seite danach neu.',
          { duration: 6000 }
        );
        return;
      }

      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        toast.success('Benachrichtigungen aktiviert!');
      } else if (result === 'denied') {
        toast.error(
          'Benachrichtigungen wurden blockiert. Klicke auf das Schloss-Symbol in der Adressleiste deines Browsers, wähle "Benachrichtigungen" und setze sie auf "Zulassen". Lade die Seite danach neu.',
          { duration: 6000 }
        );
      }
    } catch (err) {
      console.warn('Error requesting Notification permission:', err);
      toast.error('Benachrichtigungen werden von diesem Gerät/Browser nicht unterstützt.');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Einstellungen</h2>
          <p className="text-neutral-400">
            Verbundene Energie- &amp; Erholungsquellen, Benachrichtigungen und Sicherheit
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/avatar')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-amber-500/40 text-xs font-bold text-neutral-200 hover:text-amber-400 transition-colors self-start sm:self-auto min-h-[40px]"
        >
          <UserIcon className="w-4 h-4 text-amber-500" />
          <span>Avatar &amp; Ausrüstung (Lv. {stats.level})</span>
        </button>
      </header>

      {/* Energy & Recovery Sources */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="border-b border-neutral-800 pb-4">
          <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-white">
            <HeartPulse className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Energie &amp; Erholung · Quellen &amp; Kalibrierung</span>
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            Verbinde Garmin Connect, Google Health / Google Fit, Browser-Sensoren oder importiere
            Export-Dateien. Der aktuelle Recovery-Score erscheint automatisch im Dashboard.
          </p>
        </div>

        <HealthSourcesSettings />
      </section>

      {/* Notifications & Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Notifications */}
        <section className="bg-neutral-900 p-5 sm:p-6 rounded-2xl border border-neutral-800 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              Benachrichtigungen
            </h3>

            <div className="space-y-1">
              <div className="text-sm font-medium text-white">Desktop-Benachrichtigungen</div>
              <div className="text-xs text-neutral-400">
                {permission === 'granted'
                  ? 'Aktiviert – Du erhältst Erinnerungen für Quests und Fokus-Timer.'
                  : permission === 'denied'
                  ? 'Blockiert – Bitte in den Browser-Einstellungen für diese Seite zulassen.'
                  : 'Nicht konfiguriert – Aktuell sind nur In-App-Hinweise aktiv.'}
              </div>
            </div>
          </div>

          {permission !== 'granted' ? (
            <button
              type="button"
              onClick={requestPermission}
              className="bg-amber-500 text-neutral-950 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-400 transition-colors w-full min-h-[42px]"
            >
              {permission === 'denied' ? 'Freigabe prüfen' : 'Benachrichtigungen erlauben'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                toast('Test-Benachrichtigung', {
                  description: 'So sehen deine Erinnerungen aus!',
                  icon: <Bell className="w-4 h-4 text-amber-500" />,
                });
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification('Test-Benachrichtigung', {
                    body: 'So sehen deine Erinnerungen aus!',
                  });
                }
              }}
              className="bg-neutral-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-neutral-700 transition-colors w-full flex items-center justify-center gap-2 min-h-[42px]"
            >
              <Bell className="w-4 h-4" />
              Test-Benachrichtigung senden
            </button>
          )}
        </section>

        {/* Security / PIN Lock */}
        <section className="bg-neutral-900 p-5 sm:p-6 rounded-2xl border border-neutral-800 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              Sicherheit
            </h3>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium text-white">PIN-Sperre</div>
                <div className="text-xs text-neutral-400">
                  Schützt dein Tagebuch und deine Daten automatisch nach 1 Minute Inaktivität.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.isPinEnabled}
                aria-label="PIN-Sperre umschalten"
                onClick={() => {
                  if (settings.isPinEnabled) {
                    updateSettings({ isPinEnabled: false, pin: null });
                    toast.success('PIN-Sperre deaktiviert');
                  } else {
                    setIsPinModalOpen(true);
                  }
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none',
                  settings.isPinEnabled ? 'bg-amber-500' : 'bg-neutral-800 border border-neutral-700'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    settings.isPinEnabled ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
          </div>

          {settings.isPinEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsPinModalOpen(true)}
                className="py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[42px]"
              >
                <Lock className="w-3.5 h-3.5" />
                PIN ändern
              </button>
              <button
                type="button"
                onClick={() => {
                  setLocked(true);
                  toast.info('App gesperrt');
                }}
                className="py-2.5 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[42px]"
              >
                <Unlock className="w-3.5 h-3.5" />
                Jetzt sperren
              </button>
            </div>
          ) : (
            <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-800/70">
              Angemeldet als {user?.displayName || user?.email || 'Nutzer'}
            </div>
          )}
        </section>
      </div>

      {/* PIN Modal */}
      <AnimatePresence>
        {isPinModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsPinModalOpen(false);
                setNewPin('');
                setConfirmPin('');
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden p-6"
            >
              <div className="flex flex-col items-center text-center gap-4 mb-8">
                <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Lock className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold">
                  PIN {settings.isPinEnabled ? 'ändern' : 'einrichten'}
                </h3>
                <p className="text-neutral-400 text-sm italic leading-relaxed">
                  Gib einen 4-stelligen Code ein, um den Zugriff auf dein Tagebuch und deine Daten
                  zu sichern.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 px-1">
                    Neuer PIN
                  </label>
                  <div className="relative">
                    <input
                      type={showPins ? 'text' : 'password'}
                      maxLength={4}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full bg-black border border-neutral-800 rounded-xl py-4 px-4 text-center text-2xl font-black tracking-[1em] text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-mono"
                      placeholder="••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPins(!showPins)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                    >
                      {showPins ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 px-1">
                    PIN bestätigen
                  </label>
                  <input
                    type={showPins ? 'text' : 'password'}
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full bg-black border border-neutral-800 rounded-xl py-4 px-4 text-center text-2xl font-black tracking-[1em] text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-mono"
                    placeholder="••••"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPinModalOpen(false);
                      setNewPin('');
                      setConfirmPin('');
                    }}
                    className="flex-1 py-4 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl font-bold transition-all"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    disabled={newPin.length !== 4 || newPin !== confirmPin}
                    onClick={() => {
                      updateSettings({ isPinEnabled: true, pin: newPin });
                      setIsPinModalOpen(false);
                      setNewPin('');
                      setConfirmPin('');
                      toast.success('PIN erfolgreich gespeichert!');
                    }}
                    className="flex-1 py-4 bg-amber-500 disabled:opacity-50 disabled:grayscale text-neutral-950 rounded-2xl font-black transition-all shadow-lg shadow-amber-500/20"
                  >
                    Speichern
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
