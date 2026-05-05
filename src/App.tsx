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
import { PinLock } from './components/PinLock';
import { Toaster, toast } from 'sonner';
import { NotificationManager } from './components/NotificationManager';
import { useStore } from './store/useStore';
import { triggerLevelUpConfetti } from './lib/confetti';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

import { Login } from './pages/Login';

const INACTIVITY_TIMEOUT = 1 * 60 * 1000; // 1 minute

function AppContent() {
  const { user, loading, stats, settings, setLocked, setUser, syncWithFirestore } = useStore();
  const prevLevelRef = useRef(stats.level);
  const lastActivityRef = useRef<number>(Date.now());
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
