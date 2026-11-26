/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db, ensureAnonymousAuth, handleFirestoreError, OperationType } from './firebase';
import {
  AdminLog,
  Budget,
  CURRENT_EVENT_ID,
  EventConfig,
  Investment,
  Participant,
  Presentation,
  Project,
  PublicTab,
  Reaction,
} from './types';
import { ensureDefaultEvent, verifyActiveSessionOnBoot } from './services/pitchService';
import { enrichProjectsWithConfirmedInvestments } from './services/projectStats';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { RegistrationModule } from './components/RegistrationModule';
import { ProjectsModule } from './components/ProjectsModule';
import { PresentationModule } from './components/PresentationModule';
import { ResultsModule } from './components/ResultsModule';
import { AdminPanel } from './components/AdminPanel';

const PARTICIPANT_STORAGE_KEY = 'pitch_investors_participant_id';

function PitchInvestorsApp() {
  const [activeTab, setActiveTab] = useState<PublicTab>('registro');
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [currentParticipantId, setCurrentParticipantId] = useState<string>(() => {
    return localStorage.getItem(PARTICIPANT_STORAGE_KEY) || '';
  });
  const [isProjectionMode, setIsProjectionMode] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    ensureAnonymousAuth().then(async () => {
      if (!mounted) return;
      const storedId = localStorage.getItem(PARTICIPANT_STORAGE_KEY) || '';
      if (storedId) {
        const valid = await verifyActiveSessionOnBoot(storedId);
        if (!valid && mounted) {
          setCurrentParticipantId('');
          localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
        }
      }
    });

    ensureDefaultEvent()
      .then((cfg) => {
        if (mounted) {
          setEventConfig(cfg);
          setBootLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setBootLoading(false);
      });

    const unsubEvent = onSnapshot(
      doc(db, 'events', CURRENT_EVENT_ID),
      (snap) => {
        if (snap.exists()) {
          setEventConfig(snap.data() as EventConfig);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `events/${CURRENT_EVENT_ID}`)
    );

    const unsubParticipants = onSnapshot(
      query(collection(db, 'participants'), where('eventId', '==', CURRENT_EVENT_ID)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Participant);
        list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        setParticipants(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'participants')
    );

    const unsubProjects = onSnapshot(
      query(collection(db, 'projects'), where('eventId', '==', CURRENT_EVENT_ID)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Project);
        list.sort((a, b) => a.code.localeCompare(b.code));
        setProjects(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'projects')
    );

    const unsubBudgets = onSnapshot(
      query(collection(db, 'budgets'), where('eventId', '==', CURRENT_EVENT_ID)),
      (snap) => {
        setBudgets(snap.docs.map((d) => d.data() as Budget));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'budgets')
    );

    const unsubInvestments = onSnapshot(
      query(collection(db, 'investments'), where('eventId', '==', CURRENT_EVENT_ID)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Investment);
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setInvestments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'investments')
    );

    const unsubReactions = onSnapshot(
      query(collection(db, 'reactions'), where('eventId', '==', CURRENT_EVENT_ID)),
      (snap) => {
        setReactions(snap.docs.map((d) => d.data() as Reaction));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reactions')
    );

    const unsubPresentations = onSnapshot(
      query(collection(db, 'presentations'), where('eventId', '==', CURRENT_EVENT_ID)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Presentation);
        list.sort((a, b) => a.roundNumber - b.roundNumber);
        setPresentations(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'presentations')
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'admin_logs'), where('eventId', '==', CURRENT_EVENT_ID)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as AdminLog);
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setAdminLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'admin_logs')
    );

    return () => {
      mounted = false;
      unsubEvent();
      unsubParticipants();
      unsubProjects();
      unsubBudgets();
      unsubInvestments();
      unsubReactions();
      unsubPresentations();
      unsubLogs();
    };
  }, []);

  const currentParticipant =
    participants.find((p) => p.id === currentParticipantId) || null;
  const currentBudget =
    budgets.find((b) => b.investorId === currentParticipantId) || null;
  const myInvestments = investments.filter(
    (inv) => inv.investorId === currentParticipantId
  );
  const liveProjects = useMemo(
    () => enrichProjectsWithConfirmedInvestments(projects, investments),
    [projects, investments]
  );

  // Requisito 4: Dinámica durante las presentaciones
  // Cuando el evento pasa a 'presenting', todos los participantes registrados
  // ingresan automáticamente a la ronda en vivo (adaptada según si es su proyecto o el de otro).
  useEffect(() => {
    if (
      currentParticipant &&
      eventConfig?.stage === 'presenting' &&
      activeTab !== 'presentaciones'
    ) {
      setActiveTab('presentaciones');
    }
  }, [currentParticipant, eventConfig?.stage, eventConfig?.activeProjectId, activeTab]);

  const handleSelectParticipant = (p: Participant) => {
    if (!p || !p.id) {
      setCurrentParticipantId('');
      localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
      return;
    }
    setCurrentParticipantId(p.id);
    localStorage.setItem(PARTICIPANT_STORAGE_KEY, p.id);
  };

  const handleLogoutParticipant = () => {
    setCurrentParticipantId('');
    localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
  };

  if (bootLoading || !eventConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="nb-card-lg bg-[#FFDC00] p-8 max-w-md w-full text-center space-y-3">
          <div className="font-black-display text-3xl">PITCHINVESTORS.</div>
          <div className="font-mono-data text-sm font-bold">
            CONECTANDO EN TIEMPO REAL CON FIRESTORE...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentParticipant={currentParticipant}
        onLogoutParticipant={handleLogoutParticipant}
        eventConfig={eventConfig}
        isProjectionMode={isProjectionMode}
      />

      <main
        className={
          isProjectionMode
            ? 'flex-1'
            : 'flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-8'
        }
      >
        {activeTab === 'registro' && (
          <RegistrationModule
            eventConfig={eventConfig}
            participants={participants}
            projects={liveProjects}
            currentParticipant={currentParticipant}
            currentBudget={currentBudget}
            onSelectParticipant={handleSelectParticipant}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'proyectos' && (
          <ProjectsModule
            eventConfig={eventConfig}
            projects={liveProjects}
            allInvestments={investments}
            currentParticipant={currentParticipant}
            currentBudget={currentBudget}
            myInvestments={myInvestments}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'presentaciones' && (
          <PresentationModule
            eventConfig={eventConfig}
            projects={liveProjects}
            investments={investments}
            reactions={reactions}
            currentParticipant={currentParticipant}
            currentBudget={currentBudget}
            isProjectionMode={isProjectionMode}
            setIsProjectionMode={setIsProjectionMode}
            onNavigate={setActiveTab}
            participants={participants}
            onSelectParticipant={handleSelectParticipant}
          />
        )}

        {activeTab === 'resultados' && (
          <ResultsModule
            eventConfig={eventConfig}
            projects={liveProjects}
            investments={investments}
            currentParticipant={currentParticipant}
            currentBudget={currentBudget}
          />
        )}

        {activeTab === 'admin' && (
          <AdminPanel
            eventConfig={eventConfig}
            participants={participants}
            projects={liveProjects}
            budgets={budgets}
            investments={investments}
            reactions={reactions}
            presentations={presentations}
            adminLogs={adminLogs}
            isAdminUnlocked={isAdminUnlocked}
            setIsAdminUnlocked={setIsAdminUnlocked}
          />
        )}
      </main>

      {!isProjectionMode && (
        <footer className="border-t-4 border-black bg-white px-6 py-4">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4 font-mono-data text-xs font-bold">
            <span>PITCH INVESTORS · SIMULACIÓN DE INVERSIÓN GRADO 12</span>
            <span>VALORES SIMULADOS — SIN DINERO REAL</span>
          </div>
        </footer>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PitchInvestorsApp />
    </ErrorBoundary>
  );
}
