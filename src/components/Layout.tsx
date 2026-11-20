import { ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  User as UserIcon,
  Target,
  Brain,
  Sparkles,
  Calendar,
  CalendarDays,
  Book,
  Repeat,
  LogIn,
  LogOut,
  LayoutDashboard,
  Timer,
  Compass,
  Menu,
  X,
  Lightbulb,
  Utensils,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { useStore } from '@/store/useStore';
import { signInWithGoogle, logout } from '@/firebase';
import { toast } from 'sonner';

interface LayoutProps {
  children: ReactNode;
  setActiveTab: (tab: string) => void;
}

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Tagesfokus',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { id: 'quests', icon: Target, label: 'Quests' },
      { id: 'habits', icon: Repeat, label: 'Habits' },
      { id: 'focus', icon: Timer, label: 'Fokus' },
      { id: 'calendar', icon: Calendar, label: 'Kalender' },
    ],
  },
  {
    label: 'Körper & Geist',
    items: [
      { id: 'food', icon: Utensils, label: 'Food Journal' },
      { id: 'diary', icon: Book, label: 'Tagebuch' },
      { id: 'mentaltraining', icon: Lightbulb, label: 'Mentaltraining' },
      { id: 'training-calendar', icon: CalendarDays, label: 'Trainings-Kalender' },
    ],
  },
  {
    label: 'Fortschritt & Konto',
    items: [
      { id: 'visions', icon: Compass, label: 'Lebensziele' },
      { id: 'skills', icon: Brain, label: 'Fähigkeiten' },
      { id: 'avatar', icon: UserIcon, label: 'Avatar' },
      { id: 'coach', icon: Sparkles, label: 'KI-Coach' },
      { id: 'settings', icon: SettingsIcon, label: 'Einstellungen' },
    ],
  },
];

const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
const MOBILE_PRIMARY_TABS = ['dashboard', 'quests', 'habits', 'focus'];

function UserAvatar({
  photoURL,
  displayName,
  sizeClass = 'w-9 h-9',
}: {
  photoURL?: string | null;
  displayName?: string | null;
  sizeClass?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const initials = (displayName || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  if (photoURL && !imgError) {
    return (
      <img
        src={photoURL}
        alt={displayName || 'Profil'}
        onError={() => setImgError(true)}
        className={cn(sizeClass, 'rounded-full border border-neutral-700 object-cover shrink-0')}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={cn(
        sizeClass,
        'rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-400 font-bold text-xs flex items-center justify-center shrink-0'
      )}
    >
      {initials || 'A'}
    </div>
  );
}

export function Layout({ children, setActiveTab }: LayoutProps) {
  const { user, stats } = useStore();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const activeTab = location.pathname.substring(1) || 'dashboard';

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeTab]);

  const handleLogin = async () => {
    try {
      toast.info('Anmeldung wird gestartet...');
      await signInWithGoogle();
      toast.success('Erfolgreich angemeldet!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unbekannter Fehler';
      toast.error(`Anmeldung fehlgeschlagen: ${msg}`);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Abgemeldet');
    } catch {
      toast.error('Abmeldung fehlgeschlagen');
    }
  };

  const primaryNavItems = ALL_NAV_ITEMS.filter((item) => MOBILE_PRIMARY_TABS.includes(item.id));
  const isMoreActive = !MOBILE_PRIMARY_TABS.includes(activeTab);

  return (
    <div className="h-full w-full overflow-hidden bg-neutral-950 text-neutral-100 font-sans flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <nav className="hidden md:flex w-64 bg-neutral-900/95 border-r border-neutral-800 flex-shrink-0 relative z-50 flex-col">
        <div className="px-5 py-4 flex items-center justify-between border-b border-neutral-800">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg"
          >
            <Logo />
          </button>
        </div>

        <div className="flex flex-col p-3 gap-4 justify-start flex-1 overflow-y-auto w-full">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-3 py-1 text-[11px] font-semibold text-neutral-500 tracking-wide">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors justify-start min-w-0 text-left text-sm font-medium whitespace-nowrap',
                      isActive
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60 border border-transparent'
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Auth Section Desktop */}
        <div className="p-3.5 border-t border-neutral-800">
          {user ? (
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => setActiveTab('avatar')}
                className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:bg-neutral-800/50 p-1.5 rounded-xl transition-colors"
                title="Zum Avatar-Profil"
              >
                <UserAvatar photoURL={user.photoURL} displayName={user.displayName} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-white">
                    {user.displayName || user.email || 'Nutzer'}
                  </p>
                  <p className="text-[11px] text-neutral-400 font-mono tabular-nums">
                    Level {stats.level} · {stats.xp}/{stats.xpToNextLevel} EP
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                title="Einstellungen"
                aria-label="Einstellungen"
                className={cn(
                  'p-2 rounded-lg transition-colors shrink-0',
                  activeTab === 'settings'
                    ? 'text-amber-400 bg-amber-500/10'
                    : 'text-neutral-500 hover:text-white hover:bg-neutral-800'
                )}
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title="Abmelden"
                aria-label="Abmelden"
                className="p-2 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Anmelden
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Top Header (compact <= 52px) */}
      <header className="md:hidden flex items-center justify-between px-4 py-2.5 pt-safe border-b border-neutral-800 bg-neutral-900/95 backdrop-blur-lg sticky top-0 z-40">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className="focus:outline-none"
        >
          <Logo />
        </button>

        {user ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={cn(
                'p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center',
                activeTab === 'settings'
                  ? 'text-amber-400 bg-amber-500/10'
                  : 'text-neutral-400 hover:text-white'
              )}
              aria-label="Einstellungen öffnen"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('avatar')}
              className="flex items-center gap-2 min-h-[36px]"
              aria-label="Profil öffnen"
            >
              <span className="text-xs font-mono font-semibold text-neutral-400 tabular-nums">
                Lv.{stats.level}
              </span>
              <UserAvatar
                photoURL={user.photoURL}
                displayName={user.displayName}
                sizeClass="w-8 h-8"
              />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleLogin}
            className="text-amber-500 text-xs font-bold flex items-center gap-1 bg-amber-500/10 px-3 py-1.5 rounded-lg"
          >
            <LogIn className="w-3.5 h-3.5" />
            Login
          </button>
        )}
      </header>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-xl flex flex-col pb-[5rem]">
          <div className="flex justify-between items-center px-4 py-3 border-b border-neutral-800">
            <h2 className="text-lg font-bold flex items-center gap-2 text-white">
              <Menu className="w-5 h-5 text-amber-500" />
              Navigation
            </h2>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Menü schließen"
              className="p-2 bg-neutral-900 rounded-xl text-neutral-400 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <div className="px-2 text-xs font-semibold text-neutral-500">
                  {group.label}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setIsMobileMenuOpen(false);
                        }}
                        className={cn(
                          'flex items-center gap-2.5 px-3.5 py-3 rounded-xl transition-colors text-left min-h-[48px]',
                          isActive
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-neutral-900/80 text-neutral-300 border border-neutral-800/80 hover:bg-neutral-800'
                        )}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-medium truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {user && (
            <div className="p-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-3 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl font-bold flex items-center justify-center gap-2 active:bg-rose-500/20"
              >
                <LogOut className="w-4 h-4" />
                Abmelden
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-neutral-950 flex flex-col pb-[5.5rem] md:pb-0 relative z-0">
        <div className="p-3.5 sm:p-6 md:p-8 max-w-6xl mx-auto w-full">{children}</div>
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="md:hidden bg-neutral-900/95 backdrop-blur-lg border-t border-neutral-800 fixed bottom-0 w-full z-40 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="grid grid-cols-5 items-center px-1 py-1.5">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id && !isMobileMenuOpen;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[48px] transition-colors rounded-xl',
                  isActive ? 'text-amber-500' : 'text-neutral-400 hover:text-neutral-200'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.25]')} />
                <span className={cn('text-[10px] font-medium whitespace-nowrap', isActive && 'font-bold')}>
                  {item.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[48px] transition-colors rounded-xl',
              isMobileMenuOpen || isMoreActive
                ? 'text-amber-400'
                : 'text-neutral-400 hover:text-neutral-200'
            )}
          >
            <Menu className="w-5 h-5" />
            <span className={cn('text-[10px] font-medium whitespace-nowrap', (isMobileMenuOpen || isMoreActive) && 'font-bold')}>
              Mehr
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
