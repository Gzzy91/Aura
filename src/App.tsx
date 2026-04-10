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
import { Toaster, toast } from 'sonner';
import { NotificationManager } from './components/NotificationManager';
import { useStore } from './store/useStore';
import { triggerLevelUpConfetti } from './lib/confetti';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { stats, quests, setUser, syncWithFirestore } = useStore();
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
      });
    }
    prevLevelRef.current = stats.level;
  }, [stats.level]);

  return (
    <>
      <Toaster position="top-right" theme="dark" closeButton richColors />
      <NotificationManager />
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'quests' && <Quests />}
        {activeTab === 'habits' && <Habits />}
        {activeTab === 'skills' && <Skills />}
        {activeTab === 'avatar' && <Avatar />}
        {activeTab === 'calendar' && <Calendar />}
        {activeTab === 'diary' && <Diary />}
        {activeTab === 'coach' && <AICoach />}
      </Layout>
    </>
  );
}
