import confetti from 'canvas-confetti';

export const triggerQuestCompleteConfetti = () => {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#10b981', '#34d399', '#059669'] // Green shades for success
  });
};

export const triggerHabitPositiveConfetti = () => {
  confetti({
    particleCount: 50,
    spread: 50,
    origin: { y: 0.7 },
    colors: ['#f59e0b', '#fbbf24', '#d97706'] // Amber shades
  });
};

export const triggerLevelUpConfetti = () => {
  const duration = 3000;
  const end = Date.now() + duration;

  const frame = () => {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#f59e0b', '#fbbf24', '#d97706', '#ef4444', '#3b82f6', '#a855f7']
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#f59e0b', '#fbbf24', '#d97706', '#ef4444', '#3b82f6', '#a855f7']
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };
  frame();
};
