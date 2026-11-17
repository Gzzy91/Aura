/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Quests } from './pages/Quests';
import { Habits } from './pages/Habits';
import { Skills } from './pages/Skills';
import { Avatar } from './pages/Avatar';
import { AICoach } from './pages/AICoach';
import { Calendar } from './pages/Calendar';
import { Diary } from './pages/Diary';
import { Visions } from './pages/Visions';
import { Focus } from './pages/Focus';
import { Mentaltraining } from './pages/Mentaltraining';
import { FoodJournal } from './pages/FoodJournal';
import { Settings } from './pages/Settings';
import { PinLock } from './components/PinLock';
import { Toaster, toast } from 'sonner';
import { NotificationManager } from './components/NotificationManager';
import { useStore } from './store/useStore';
import { triggerLevelUpConfetti } from './lib/confetti';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { format, startOfDay } from 'date-fns';
import { recordBrowserActivityHeartbeat } from './services/healthSyncService';
import {
  computeWeeklyRetrospectiveMetrics,
  getWeekBounds,
  shouldAutoGenerateSundayRetrospective,
} from './lib/retrospective';
import { generateWeeklyRetrospective } from './services/coachService';

import { Login } from './pages/Login';

const INACTIVITY_TIMEOUT = 1 * 60 * 1000; // 1 minute

function AppContent() {
  const { user, loading, isInitialized, questsSynced, focusSynced, quests, focusSessions, stats, settings, setLocked, setUser, syncWithFirestore } = useStore();
  const prevLevelRef = useRef(stats.level);
  const lastActivityRef = useRef<number>(Date.now());
  const autoRetroTriggeredRef = useRef<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    if (!settings.isPinEnabled || !user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastActivity = Date.now() - lastActivityRef.current;
        if (timeSinceLastActivity > 30000) { // Lock if backgrounded for more than 30 seconds
          setLocked(true);
        }
      }
    };

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const inactivityInterval = setInterval(() => {
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      if (timeSinceLastActivity > INACTIVITY_TIMEOUT) {
        setLocked(true);
      }
    }, 10000); // Check every 10 seconds

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('mousedown', handleActivity);
    document.addEventListener('keydown', handleActivity);
    document.addEventListener('touchstart', handleActivity);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('mousedown', handleActivity);
      document.removeEventListener('keydown', handleActivity);
      document.removeEventListener('touchstart', handleActivity);
      clearInterval(inactivityInterval);
    };
  }, [settings.isPinEnabled, user, setLocked]);

  useEffect(() => {
    let unsubSync: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      
      // Clean up previous sync listener if it exists
      if (unsubSync) {
        unsubSync();
        unsubSync = null;
      }

      if (user) {
        unsubSync = syncWithFirestore(user.uid);
      }
    });

    return () => {
      unsubscribe();
      if (unsubSync) unsubSync();
    };
  }, [setUser, syncWithFirestore]);

  useEffect(() => {
    if (stats.level > prevLevelRef.current) {
      triggerLevelUpConfetti();
      toast.success(`Level Up! Du hast Level ${stats.level} erreicht!`, {
        duration: 5000,
        icon: '🎉',
        id: 'level-up',
      });
    }
    prevLevelRef.current = stats.level;
  }, [stats.level]);

  const runAutoFailCheck = () => {
    const {
      user: currentUser,
      questsSynced: synced,
      quests: currentQuests,
      autoFailOverdueQuests,
    } = useStore.getState();
    if (currentUser && !synced) return;

    const startOfTodayMs = startOfDay(new Date()).getTime();
    const hasOverduePastQuests = currentQuests.some(
      (q) =>
        q.type !== 'habit' &&
        !q.completed &&
        typeof q.dueDate === 'number' &&
        q.dueDate < startOfTodayMs
    );
    if (!hasOverduePastQuests) return;

    const count = autoFailOverdueQuests();
    if (count > 0) {
      toast.info(
        `${count} überfällige ${count === 1 ? 'Quest' : 'Quests'} von früheren Tagen automatisch als nicht durchgeführt abgehakt`,
        { id: 'auto-fail-overdue' }
      );
    }
  };

  const runSkillDecayCheck = () => {
    const {
      user: currentUser,
      isInitialized: initialized,
      questsSynced: qSynced,
      focusSynced: fSynced,
      stats: beforeStats,
      checkAndApplySkillDecay,
    } = useStore.getState();
    if (currentUser && (!initialized || !qSynced || !fSynced)) return;

    const prevOverallLevel = beforeStats.level || 1;
    const decayed = checkAndApplySkillDecay();
    if (decayed.length > 0) {
      const nextOverallLevel = useStore.getState().stats.level || 1;
      const summary = decayed
        .map((d) =>
          d.newLevel < d.previousLevel
            ? `${d.skill} (-${d.xpLost} EP, Stufe ${d.previousLevel} → ${d.newLevel})`
            : `${d.skill} (-${d.xpLost} EP)`
        )
        .join(', ');
      const overallNote =
        nextOverallLevel < prevOverallLevel
          ? ` · Gesamt-Level ${prevOverallLevel} → ${nextOverallLevel}`
          : '';
      toast.warning(`Inaktivitäts-Abzug (7+ Tage ohne Training): ${summary}${overallNote}`, {
        id: 'weekly-skill-decay',
        duration: 8000,
      });
    }
  };

  useEffect(() => {
    runAutoFailCheck();
  }, [user, questsSynced, quests]);

  useEffect(() => {
    runSkillDecayCheck();
  }, [user, isInitialized, questsSynced, focusSynced, quests, focusSessions]);

  // Automatic Sunday Weekly Retrospective check
  useEffect(() => {
    if (user && (!isInitialized || !questsSynced)) return;

    const checkSundayRetrospective = async () => {
      const now = new Date();
      if (now.getDay() !== 0) return;

      const state = useStore.getState();
      if (!shouldAutoGenerateSundayRetrospective(now, state.weeklyRetrospectives)) {
        return;
      }

      const { weekKey } = getWeekBounds(now);
      const triggerKey = `${format(now, 'yyyy-MM-dd')}-${weekKey}`;
      if (autoRetroTriggeredRef.current.has(triggerKey)) return;
      autoRetroTriggeredRef.current.add(triggerKey);

      try {
        const metrics = computeWeeklyRetrospectiveMetrics({
          baseDate: now,
          quests: state.quests,
          diaryEntries: state.diaryEntries,
          focusSessions: state.focusSessions,
          visions: state.visions,
          stats: state.stats,
        });

        const response = await generateWeeklyRetrospective({
          weekLabel: metrics.weekLabel,
          loggedMoodDays: metrics.loggedMoodDays,
          avgMood: metrics.avgMood,
          minMood: metrics.minMood,
          maxMood: metrics.maxMood,
          moodSwingRange: metrics.moodSwingRange,
          moodVolatility: metrics.moodVolatility,
          stabilityLabel: metrics.stabilityLabel,
          biggestJump: metrics.biggestJump,
          peakDay: metrics.peakDay,
          lowDay: metrics.lowDay,
          completedQuestsCount: metrics.completedQuestsCount,
          failedQuestsCount: metrics.failedQuestsCount,
          pendingWeekQuestsCount: metrics.pendingWeekQuestsCount,
          questCompletionRate: metrics.questCompletionRate,
          habitPositiveCount: metrics.habitPositiveCount,
          habitNegativeCount: metrics.habitNegativeCount,
          totalXp: metrics.totalXp,
          totalFocusMinutes: metrics.totalFocusMinutes,
          topSkill: metrics.topSkill,
          completedQuestTitles: metrics.completedQuestTitles,
          failedQuestTitles: metrics.failedQuestTitles,
          visionProgress: metrics.visionProgress,
          dailyBreakdown: metrics.dailyBreakdown.map((d) => ({
            shortDay: d.shortDay,
            dateLabel: d.dateLabel,
            mood: d.mood,
            moodLabel: d.moodLabel,
            completedQuests: d.completedQuests,
            failedQuests: d.failedQuests,
            habitPositive: d.habitPositive,
            habitNegative: d.habitNegative,
            xp: d.xp,
            focusMinutes: d.focusMinutes,
            notes: d.notes,
            progress: d.progress,
          })),
          userLevel: metrics.userLevel,
          streak: metrics.streak,
        });

        const existing = state.weeklyRetrospectives.find((r) => r.id === metrics.weekKey);
        await state.saveWeeklyRetrospective({
          id: metrics.weekKey,
          weekStart: metrics.weekStart.getTime(),
          weekEnd: metrics.weekEnd.getTime(),
          headline: response.headline,
          moodFluctuationAnalysis: response.moodFluctuationAnalysis,
          goalAchievementAnalysis: response.goalAchievementAnalysis,
          nextWeekOutlook: response.nextWeekOutlook,
          focusRecommendations: response.focusRecommendations,
          avgMood: metrics.avgMood,
          minMood: metrics.minMood,
          maxMood: metrics.maxMood,
          moodSwingRange: metrics.moodSwingRange,
          moodVolatility: metrics.moodVolatility,
          loggedMoodDays: metrics.loggedMoodDays,
          completedQuestsCount: metrics.completedQuestsCount,
          failedQuestsCount: metrics.failedQuestsCount,
          questCompletionRate: metrics.questCompletionRate,
          habitPositiveCount: metrics.habitPositiveCount,
          habitNegativeCount: metrics.habitNegativeCount,
          totalXp: metrics.totalXp,
          totalFocusMinutes: metrics.totalFocusMinutes,
          adoptedRecommendationIds: existing?.adoptedRecommendationIds || [],
          generatedAt: Date.now(),
          triggerType: 'sunday_auto',
        });

        toast.success('Deine Sonntags-Retrospektive ist bereit!', {
          id: 'sunday-retrospective-ready',
          duration: 6000,
          action: {
            label: 'Ansehen',
            onClick: () => navigate('/dashboard'),
          },
        });
      } catch (err) {
        console.error('Automatic Sunday retrospective failed:', err);
        autoRetroTriggeredRef.current.delete(triggerKey);
      }
    };

    const timer = setTimeout(() => {
      void checkSundayRetrospective();
    }, 800);

    return () => clearTimeout(timer);
  }, [user, isInitialized, questsSynced, navigate]);

  useEffect(() => {
    recordBrowserActivityHeartbeat();

    let lastBeat = Date.now();
    const handleBeat = () => {
      const now = Date.now();
      if (now - lastBeat >= 30_000) {
        lastBeat = now;
        recordBrowserActivityHeartbeat(now);
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        runAutoFailCheck();
        runSkillDecayCheck();
        recordBrowserActivityHeartbeat();
      }
    };

    const interval = setInterval(() => {
      runAutoFailCheck();
      runSkillDecayCheck();
      if (document.visibilityState === 'visible') {
        recordBrowserActivityHeartbeat();
      }
    }, 60000);

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('pointerdown', handleBeat, { passive: true });
    document.addEventListener('keydown', handleBeat, { passive: true });

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('pointerdown', handleBeat);
      document.removeEventListener('keydown', handleBeat);
    };
  }, []);

  // Create a proxy for setActiveTab that navigates instead
  const handleSetActiveTab = (tab: string) => {
    navigate(`/${tab}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Toaster position="top-right" theme="dark" closeButton richColors />
        <Login />
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" theme="dark" closeButton richColors />
      <NotificationManager />
      <PinLock />
      <Layout setActiveTab={handleSetActiveTab}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard setActiveTab={handleSetActiveTab} />} />
          <Route path="/visions" element={<Visions />} />
          <Route path="/quests" element={<Quests />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/focus" element={<Focus />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/avatar" element={<Avatar />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/diary" element={<Diary />} />
          <Route path="/food" element={<FoodJournal />} />
          <Route path="/mentaltraining" element={<Mentaltraining setActiveTab={handleSetActiveTab} />} />
          <Route path="/coach" element={<AICoach />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}
