import { Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

interface DeleteConfirmationModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export function DeleteConfirmationModal({
  onConfirm,
  onCancel,
  title = 'Quest löschen?',
  description = 'Diese Aktion kann nicht rückgängig gemacht werden. Der Eintrag wird dauerhaft gelöscht.',
  confirmLabel = 'Löschen',
}: DeleteConfirmationModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.16 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full space-y-6 shadow-2xl"
      >
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Trash2 className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <p className="text-neutral-400 text-sm leading-relaxed">{description}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-neutral-800 text-white py-2.5 px-4 rounded-xl font-semibold hover:bg-neutral-700 transition-colors text-sm"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 bg-rose-500 text-white py-2.5 px-4 rounded-xl font-bold hover:bg-rose-600 transition-colors text-sm"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
