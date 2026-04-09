import { Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

interface DeleteConfirmationModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmationModal({ onConfirm, onCancel }: DeleteConfirmationModalProps) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full space-y-6 shadow-2xl"
      >
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white">Quest löschen?</h3>
          <p className="text-neutral-400 text-sm">
            Diese Aktion kann nicht rückgängig gemacht werden. Die Quest wird dauerhaft aus deinem Verlauf gelöscht.
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 bg-neutral-800 text-white py-3 rounded-xl font-bold hover:bg-neutral-700 transition-colors"
          >
            Abbrechen
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 transition-colors"
          >
            Löschen
          </button>
        </div>
      </motion.div>
    </div>
  );
}
