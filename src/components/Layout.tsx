import { ReactNode } from 'react';
import { User as UserIcon, Target, Brain, Sparkles, Calendar, Book, Repeat, LogIn, LogOut, LayoutDashboard, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { useStore } from '@/store/useStore';
import { signInWithGoogle, logout } from '@/firebase';
import { toast } from 'sonner';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'quests', icon: Target, label: 'Quests' },
  { id: 'habits', icon: Repeat, label: 'Habits' },
  { id: 'avatar', icon: UserIcon, label: 'Avatar' },
  { id: 'calendar', icon: Calendar, label: 'Kalender' },
  { id: 'diary', icon: Book, label: 'Tagebuch' },
  { id: 'skills', icon: Brain, label: 'Fähigkeiten' },
  { id: 'coach', icon: Sparkles, label: 'KI-Coach' },
];

export function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const { user } = useStore();

  const handleLogin = async () => {
    try {
      console.log("Attempting login...");
      toast.info("Anmeldung wird gestartet...");
      await signInWithGoogle();
      toast.success("Erfolgreich angemeldet!");
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error(`Anmeldung fehlgeschlagen: ${error.message || 'Unbekannter Fehler'}`);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Abgemeldet");
    } catch (error: any) {
      toast.error("Abmeldung fehlgeschlagen");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-neutral-100 font-sans flex flex-col md:flex-row">
      {/* Sidebar / Bottom Nav */}
      <nav className="md:w-64 bg-neutral-900 border-r border-neutral-800 flex-shrink-0 fixed bottom-0 w-full md:relative z-50 flex flex-col pb-safe">
        <div className="p-4 hidden md:flex items-center gap-3 border-b border-neutral-800">
          <Logo />
        </div>
        <div className="flex md:flex-col p-2 md:p-4 gap-2 justify-around md:justify-start md:flex-1 overflow-x-auto md:overflow-x-visible">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-colors flex-1 md:flex-none justify-center md:justify-start min-w-[60px] md:min-w-0",
                  isActive 
                    ? "bg-neutral-800 text-amber-500" 
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
                )}
              >
                <Icon className="w-6 h-6" />
                <span className="hidden md:block font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Auth Section */}
        <div className="p-4 border-t border-neutral-800 hidden md:block">
          {user ? (
            <div className="flex items-center gap-3">
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`} 
                alt="Profile" 
                className="w-10 h-10 rounded-full border border-neutral-700"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate text-white">{user.displayName}</p>
                <button 
                  onClick={handleLogout}
                  className="text-[10px] text-neutral-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  Abmelden
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-500 text-black font-bold hover:bg-amber-400 transition-colors"
            >
              <LogIn className="w-5 h-5" />
              <span>Synchronisieren</span>
            </button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative">
        <div className="flex-1 overflow-y-auto">
          {/* Top Right Logo & Auth (Mobile) */}
          <div className="flex justify-between items-center p-4 md:p-8 pb-0 md:pb-0">
            <div className="md:hidden">
              {user ? (
                <button onClick={handleLogout} className="p-2 bg-neutral-800 rounded-full text-neutral-400">
                  <LogOut className="w-5 h-5" />
                </button>
              ) : (
                <button onClick={handleLogin} className="p-2 bg-amber-500 rounded-full text-black">
                  <LogIn className="w-5 h-5" />
                </button>
              )}
            </div>
            <Logo showText={false} className="scale-125 md:scale-150 opacity-80 pointer-events-none" />
          </div>
          
          <div className="p-4 md:p-8 pt-4 md:pt-4 pb-28 md:pb-8 max-w-4xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
