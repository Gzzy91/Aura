/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
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
import { Toaster, toast } from 'sonner';
import { NotificationManager } from './components/NotificationManager';
import { useStore } from './store/useStore';
import { triggerLevelUpConfetti } from './lib/confetti';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

import { Login } from './pages/Login';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { user, loading, stats, setUser, syncWithFirestore } = useStore();
  const prevLevelRef = useRef(stats.level);

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
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'visions' && <Visions />}
        {activeTab === 'quests' && <Quests />}
        {activeTab === 'habits' && <Habits />}
        {activeTab === 'focus' && <Focus />}
        {activeTab === 'skills' && <Skills />}
        {activeTab === 'avatar' && <Avatar />}
        {activeTab === 'calendar' && <Calendar />}
        {activeTab === 'diary' && <Diary />}
        {activeTab === 'mentaltraining' && <Mentaltraining setActiveTab={setActiveTab} />}
        {activeTab === 'coach' && <AICoach />}
      </Layout>
    </>
  );
}
