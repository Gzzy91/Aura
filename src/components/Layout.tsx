import { ReactNode, useState, useEffect } from 'react';
import { User as UserIcon, Target, Brain, Sparkles, Calendar, Book, Repeat, LogIn, LogOut, LayoutDashboard, Shield, Timer, Compass, Menu, X, Lightbulb } from 'lucide-react';
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
  { id: 'visions', icon: Compass, label: 'Lebensziele' },
  { id: 'quests', icon: Target, label: 'Quests' },
  { id: 'habits', icon: Repeat, label: 'Habits' },
  { id: 'focus', icon: Timer, label: 'Fokus' },
  { id: 'mentaltraining', icon: Lightbulb, label: 'Mentaltraining' },
  { id: 'avatar', icon: UserIcon, label: 'Avatar' },
  { id: 'calendar', icon: Calendar, label: 'Kalender' },
  { id: 'diary', icon: Book, label: 'Tagebuch' },
  { id: 'skills', icon: Brain, label: 'Fähigkeiten' },
  { id: 'coach', icon: Sparkles, label: 'KI-Coach' },
];

const MOBILE_PRIMARY_TABS = ['dashboard', 'visions', 'quests', 'focus'];

export function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const { user } = useStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeTab]);

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

  const primaryNavItems = NAV_ITEMS.filter(item => MOBILE_PRIMARY_TABS.includes(item.id));
  const isMoreActive = !MOBILE_PRIMARY_TABS.includes(activeTab);

  return (
    <div className="h-full w-full overflow-hidden bg-neutral-950 text-neutral-100 font-sans flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <nav className="hidden md:flex w-64 bg-neutral-900 border-r border-neutral-800 flex-shrink-0 relative z-50 flex-col">
        <div className="p-4 flex items-center gap-3 border-b border-neutral-800">
          <Logo />
        </div>
        <div className="flex flex-col p-4 gap-2 justify-start flex-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-colors flex-none justify-start min-w-0",
                  isActive 
                    ? "bg-neutral-800 text-amber-500" 
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
                )}
              >
                <Icon className="w-6 h-6" />
                <span className="block font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
        {/* Auth Section Desktop */}
        <div className="p-4 border-t border-neutral-800">
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
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Anmelden
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 pt-safe flex-wrap border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-lg sticky top-0 z-40">
        <Logo />
        {user ? (
          <img 
            src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`} 
            alt="Profile" 
            className="w-8 h-8 rounded-full border border-neutral-700"
            referrerPolicy="no-referrer"
            onClick={() => setActiveTab('avatar')}
          />
        ) : (
          <button 
            onClick={handleLogin}
            className="text-amber-500 text-sm font-bold flex items-center gap-1 bg-amber-500/10 px-3 py-1.5 rounded-lg"
          >
            <LogIn className="w-4 h-4" />
            Login
          </button>
        )}
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-xl flex flex-col pb-[5rem]">
          <div className="flex justify-between items-center p-4 border-b border-neutral-800">
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <Menu className="w-6 h-6 text-amber-500" />
              Menü
            </h2>
            <button 
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 bg-neutral-900 rounded-full text-neutral-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl transition-colors",
                    isActive 
                      ? "bg-neutral-800 text-amber-500 border border-neutral-700" 
                      : "text-neutral-300 hover:bg-neutral-900 active:bg-neutral-800"
                  )}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-lg font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
          {user && (
            <div className="p-4 border-t border-neutral-800">
              <button 
                onClick={handleLogout}
                className="w-full py-3 bg-red-500/10 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2 active:bg-red-500/20"
              >
                <LogOut className="w-5 h-5" />
                Abmelden
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto bg-neutral-950 flex flex-col pb-[6rem] md:pb-0 relative z-0">
        <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
          {children}
        </div>
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="md:hidden bg-neutral-900/95 backdrop-blur-lg border-t border-neutral-800 fixed bottom-0 w-full z-40 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="flex justify-around items-center p-2">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id && !isMobileMenuOpen;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 min-w-[3.5rem] transition-colors rounded-xl",
                  isActive 
                    ? "text-amber-500" 
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                <div className={cn("p-1.5 rounded-full transition-colors", isActive && "bg-amber-500/10")}>
                   <Icon className={cn("w-6 h-6", isActive ? "fill-amber-500/20" : "")} />
                </div>
                <span className={cn("text-[10px] font-medium text-center", isActive && "font-bold")}>{item.label}</span>
              </button>
            );
          })}
          
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 min-w-[3.5rem] transition-colors rounded-xl",
              (isMobileMenuOpen || isMoreActive)
                ? "text-blue-500" 
                : "text-neutral-400 hover:text-neutral-200"
            )}
          >
            <div className={cn("p-1.5 rounded-full transition-colors", (isMobileMenuOpen || isMoreActive) && "bg-blue-500/10")}>
               <Menu className="w-6 h-6" />
            </div>
            <span className={cn("text-[10px] font-medium", (isMobileMenuOpen || isMoreActive) && "font-bold")}>Mehr</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
