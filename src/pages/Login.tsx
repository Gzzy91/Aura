import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { signInWithGoogle, auth } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from 'firebase/auth';
import { toast } from 'sonner';
import { Logo } from '../components/Logo';

export function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      toast.success('Erfolgreich angemeldet!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Fehler bei der Anmeldung';
      toast.error(msg);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          toast.error('Bitte verifiziere deine E-Mail-Adresse über den Link in deinem Postfach.');
        } else {
          toast.success('Willkommen zurück!');
        }
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        toast.success('Konto erstellt! Bitte prüfe deine E-Mails zur Verifizierung.');
        setIsLogin(true);
      }
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      let message = 'Fehler bei der Authentifizierung';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        message = 'E-Mail oder Passwort ungültig.';
      } else if (code === 'auth/wrong-password') {
        message = 'Falsches Passwort.';
      } else if (code === 'auth/email-already-in-use') {
        message = 'E-Mail wird bereits verwendet.';
      } else if (code === 'auth/weak-password') {
        message = 'Das Passwort muss mindestens 6 Zeichen lang sein.';
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-7">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <Logo className="scale-125" showText={false} />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-wider">AURA</h1>
          <p className="text-sm text-neutral-400">
            Dein Begleiter für Fokus, Gewohnheiten, Ernährung und Erholung.
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <h2 className="text-xl font-bold text-white text-center">
            {isLogin ? 'Anmelden' : 'Konto erstellen'}
          </h2>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                E-Mail-Adresse
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                Passwort
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 pl-10 pr-11 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
            >
              {loading ? 'Wird verarbeitet...' : isLogin ? 'Jetzt anmelden' : 'Registrieren'}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-neutral-900 text-neutral-500 font-semibold">Oder</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2.5 border border-neutral-700 text-sm"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>Mit Google anmelden</span>
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-neutral-400 hover:text-white text-xs font-medium transition-colors"
            >
              {isLogin ? 'Noch kein Konto? Registrieren' : 'Bereits ein Konto? Anmelden'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-neutral-500 px-6">
          Deine Daten werden sicher in deinem persönlichen Cloud-Konto gespeichert.
        </p>
      </div>
    </div>
  );
}
