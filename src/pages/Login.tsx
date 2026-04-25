import { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
import { signInWithGoogle, auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { toast } from 'sonner';
import { Logo } from '../components/Logo';

export function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      toast.success('Erfolgreich angemeldet!');
    } catch (error: any) {
      toast.error(error.message || 'Fehler bei der Anmeldung');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          toast.error('Bitte verifiziere deine Email-Adresse, bevor du dich anmeldest. Schau in dein Postfach.');
          // Optional: resend verification
          // await sendEmailVerification(userCredential.user);
        } else {
          toast.success('Willkommen zurück!');
        }
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        toast.success('Konto erfolgreich erstellt! Bitte prüfe deine Emails zur Verifizierung.');
        setIsLogin(true);
      }
    } catch (error: any) {
      console.error(error);
      let message = 'Fehler bei der Authentifizierung';
      if (error.code === 'auth/user-not-found') message = 'Benutzer nicht gefunden.';
      if (error.code === 'auth/wrong-password') message = 'Falsches Passwort.';
      if (error.code === 'auth/email-already-in-use') message = 'Email wird bereits verwendet.';
      if (error.code === 'auth/weak-password') message = 'Passwort ist zu schwach.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center">
          <div className="flex justify-center mb-8">
            <Logo className="scale-150" showText={false} />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-2 uppercase">AURA</h1>
          <p className="text-neutral-400">Dein persönlicher Begleiter für Wachstum und Wohlbefinden.</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            {isLogin ? 'Anmelden' : 'Registrieren'}
          </h2>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Email Adresse</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-medium"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Passwort</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-medium"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Verarbeite...' : (isLogin ? 'Jetzt einloggen' : 'Konto erstellen')}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-800"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-neutral-900 text-neutral-500 uppercase tracking-widest font-bold">Oder</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-neutral-800 text-white font-bold py-4 rounded-2xl hover:bg-neutral-700 transition-all flex items-center justify-center gap-3 border border-neutral-700"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Mit Google anmelden
          </button>

          <div className="mt-8 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-neutral-500 hover:text-white text-sm font-medium transition-colors"
            >
              {isLogin ? 'Noch kein Konto? Registrieren' : 'Bereits ein Konto? Anmelden'}
            </button>
          </div>
        </div>
        
        <p className="text-center text-xs text-neutral-600 px-8">
          Deine Daten werden sicher in der Cloud verschlüsselt gespeichert und sind nur für dich zugänglich.
        </p>
      </div>
    </div>
  );
}
