import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Lock, Delete, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function PinLock() {
  const { isLocked, setLocked, settings } = useStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === settings.pin) {
        setLocked(false);
        setPin('');
      } else {
        setError(true);
        setTimeout(() => {
          setError(false);
          setPin('');
        }, 1000);
      }
    }
  }, [pin, settings.pin, setLocked]);

  if (!isLocked || !settings.isPinEnabled || !settings.pin || settings.pin.length !== 4) return null;

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6"
      >
        <div className="w-full max-w-xs text-center space-y-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Lock className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-2xl font-bold text-white uppercase tracking-widest">App gesperrt</h2>
            <p className="text-neutral-500 text-sm">Bitte gib deinen 4-stelligen PIN ein</p>
          </div>

          <div className="flex justify-center gap-4">
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                animate={error ? { x: [0, -10, 10, -10, 10, 0] } : {}}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                  pin.length > i 
                    ? "bg-amber-500 border-amber-500" 
                    : "border-neutral-800"
                } ${error ? "border-red-500 bg-red-500" : ""}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-6">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                onClick={() => handleNumberClick(num)}
                className="w-16 h-16 rounded-full bg-neutral-900 text-2xl font-bold text-white flex items-center justify-center hover:bg-neutral-800 active:scale-90 transition-all border border-neutral-800"
              >
                {num}
              </button>
            ))}
            <div />
            <button
              onClick={() => handleNumberClick('0')}
              className="w-16 h-16 rounded-full bg-neutral-900 text-2xl font-bold text-white flex items-center justify-center hover:bg-neutral-800 active:scale-90 transition-all border border-neutral-800"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="w-16 h-16 rounded-full flex items-center justify-center text-neutral-500 hover:text-white transition-colors"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
