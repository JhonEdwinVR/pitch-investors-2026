import React, { useEffect, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  Send,
  Presentation,
  TrendingUp,
  ShieldAlert,
  UserCheck,
  UserPlus,
  User,
  KeyRound,
  Lock,
} from 'lucide-react';
import {
  CURRENT_EVENT_ID,
  Budget,
  EventConfig,
  Investment,
  Participant,
  Project,
  PublicTab,
  REACTION_DEFINITIONS,
  Reaction,
  ReactionType,
  formatCurrency,
  formatTimeMMSS,
} from '../types';
import {
  checkParticipantSecretStatus,
  executeInvestmentTransaction,
  recordCancelledOrRejectedInvestment,
  registerParticipant,
  SecretStatus,
  toggleProjectReaction,
  verifyAndClaimParticipantPin,
} from '../services/pitchService';
import { isValidStudentPin } from '../services/pinUtils';
import { RouletteWheel } from './RouletteWheel';

interface PresentationModuleProps {
  eventConfig: EventConfig;
  projects: Project[];
  investments: Investment[];
  reactions: Reaction[];
  currentParticipant: Participant | null;
  currentBudget: Budget | null;
  isProjectionMode: boolean;
  setIsProjectionMode: (val: boolean) => void;
  onNavigate: (tab: PublicTab) => void;
  participants?: Participant[];
  onSelectParticipant?: (p: Participant) => void;
}

export const PresentationModule: React.FC<PresentationModuleProps> = ({
  eventConfig,
  projects,
  investments,
  reactions,
  currentParticipant,
  currentBudget,
  isProjectionMode,
  setIsProjectionMode,
  onNavigate,
  participants = [],
  onSelectParticipant,
}) => {
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const [selectedAmount, setSelectedAmount] = useState<number>(10000);
  const [customAmountStr, setCustomAmountStr] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Estado para identificación rápida protegida por PIN en la misma vista de presentación
  const [quickPartId, setQuickPartId] = useState<string>('');
  const [quickSelectPin, setQuickSelectPin] = useState<string>('');
  const [quickSelectStatus, setQuickSelectStatus] = useState<SecretStatus | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false);
  const [quickName, setQuickName] = useState<string>('');
  const [quickProjectName, setQuickProjectName] = useState<string>('');
  const [quickPin, setQuickPin] = useState<string>('');
  const [quickAuthError, setQuickAuthError] = useState<string>('');
  const [isQuickRegistering, setIsQuickRegistering] = useState<boolean>(false);

  const activeProject =
    projects.find((p) => p.id === eventConfig.activeProjectId) ||
    projects.find((p) => p.status === 'active') ||
    null;

  // Sincronización del cronómetro con el timestamp objetivo del servidor
  useEffect(() => {
    const computeRemaining = () => {
      if (eventConfig.timerStatus === 'running' && eventConfig.timerEndsAtMs > 0) {
        const diff = Math.max(0, Math.ceil((eventConfig.timerEndsAtMs - Date.now()) / 1000));
        setRemainingSec(diff);
      } else if (eventConfig.timerStatus === 'paused') {
        setRemainingSec(Math.max(0, eventConfig.timerRemainingSecWhenPaused || 0));
      } else {
        setRemainingSec(0);
      }
    };

    computeRemaining();
    const timer = setInterval(computeRemaining, 250);
    return () => clearInterval(timer);
  }, [
    eventConfig.timerStatus,
    eventConfig.timerEndsAtMs,
    eventConfig.timerRemainingSecWhenPaused,
  ]);

  // Limpiar montos personalizados y mensajes al cambiar de proyecto activo
  useEffect(() => {
    setCustomAmountStr('');
    setFeedbackMsg(null);
    setShowConfirmModal(false);
  }, [eventConfig.activeProjectId]);

  // Dinámica de ventana de inversión: abierta mientras la presentación esté activa y no pausada
  const isInvestmentOpen =
    eventConfig.stage === 'presenting' &&
    Boolean(activeProject) &&
    eventConfig.timerStatus !== 'paused';

  const isPitchTimerRunning = isInvestmentOpen && remainingSec > 0;
  const isRoundRunning = isPitchTimerRunning;
  const isPaused = eventConfig.stage === 'paused' || eventConfig.timerStatus === 'paused';
  const showCapitalToPublic = eventConfig.visibilityMode !== 'admin_only';

  const activeAmount =
    customAmountStr.trim().length > 0
      ? Math.max(0, parseInt(customAmountStr.replace(/[^0-9]/g, ''), 10) || 0)
      : selectedAmount;

  // Identificación dinámica del propietario del proyecto activo
  const isMyProject = Boolean(
    currentParticipant &&
    activeProject &&
    (activeProject.entrepreneurId === currentParticipant.id ||
      currentParticipant.projectId === activeProject.id ||
      activeProject.entrepreneurName.toLowerCase().trim() ===
        currentParticipant.name.toLowerCase().trim())
  );

  const myConfirmedInvestmentsInActiveProject = activeProject
    ? investments.filter(
        (inv) =>
          inv.projectId === activeProject.id &&
          inv.investorId === currentParticipant?.id &&
          inv.status === 'confirmed'
      )
    : [];

  const myInvestedInThisProject = myConfirmedInvestmentsInActiveProject.reduce(
    (sum, inv) => sum + inv.amount,
    0
  );

  const myTotalInvestedOverall = investments
    .filter((i) => i.investorId === currentParticipant?.id && i.status === 'confirmed')
    .reduce((sum, i) => sum + i.amount, 0);

  // Presupuesto resiliente: si el documento aún no sincroniza desde Firestore, se calcula localmente
  const effectiveBudget: Budget = currentBudget || {
    id: currentParticipant ? `b_${currentParticipant.id}` : 'fallback_budget',
    eventId: eventConfig.id || CURRENT_EVENT_ID,
    investorId: currentParticipant?.id || '',
    investorName: currentParticipant?.name || 'Inversor',
    initialBudget: eventConfig.initialBudgetPerInvestor || 100000,
    availableBudget: Math.max(
      0,
      (eventConfig.initialBudgetPerInvestor || 100000) - myTotalInvestedOverall
    ),
    investedBudget: myTotalInvestedOverall,
    investmentCount: investments.filter(
      (i) => i.investorId === currentParticipant?.id && i.status === 'confirmed'
    ).length,
    updatedAt: new Date().toISOString(),
  };

  const handleQuickSelectChange = async (partId: string) => {
    setQuickPartId(partId);
    setQuickSelectPin('');
    setQuickAuthError('');
    setQuickSelectStatus(null);
    if (!partId) return;
    const status = await checkParticipantSecretStatus(partId);
    setQuickSelectStatus(status);
  };

  const handleQuickVerifyAndEnter = async () => {
    const target = participants.find((p) => p.id === quickPartId);
    if (!target || isVerifyingPin) return;
    setQuickAuthError('');
    if (!isValidStudentPin(quickSelectPin)) {
      setQuickAuthError('Ingresa un PIN válido de 4 dígitos numéricos.');
      return;
    }
    setIsVerifyingPin(true);
    try {
      await verifyAndClaimParticipantPin(target.id, quickSelectPin);
      if (onSelectParticipant) {
        onSelectParticipant(target);
      }
      setQuickPartId('');
      setQuickSelectPin('');
    } catch (err) {
      setQuickAuthError(err instanceof Error ? err.message : 'PIN incorrecto.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleQuickRegister = async () => {
    if (!quickName.trim() || isQuickRegistering) return;
    setQuickAuthError('');
    if (!isValidStudentPin(quickPin)) {
      setQuickAuthError('Debes definir un PIN secreto de 4 dígitos para proteger tu cuenta.');
      return;
    }
    setIsQuickRegistering(true);
    setFeedbackMsg(null);
    try {
      const reg = await registerParticipant({
        name: quickName.trim(),
        pin: quickPin.trim(),
        projectName: quickProjectName.trim() || `Proyecto de ${quickName.trim()}`,
        projectCategory: 'Innovación',
        existingParticipants: participants,
        existingProjects: projects,
        eventConfig,
        isAdminOverride: true,
      });
      if (onSelectParticipant) {
        onSelectParticipant(reg.participant);
      }
      setFeedbackMsg({
        type: 'ok',
        text: `¡Bienvenido/a ${reg.participant.name}! Tu perfil quedó protegido con PIN y tus $100.000 virtuales están listos.`,
      });
      setQuickName('');
      setQuickProjectName('');
      setQuickPin('');
    } catch (err) {
      setQuickAuthError(err instanceof Error ? err.message : 'Error al registrar perfil de participante.');
    } finally {
      setIsQuickRegistering(false);
    }
  };

  const handleOpenConfirm = async () => {
    setFeedbackMsg(null);
    if (!currentParticipant || !activeProject) {
      setFeedbackMsg({
        type: 'err',
        text: 'Selecciona o ingresa tu nombre abajo para poder invertir.',
      });
      return;
    }

    if (isMyProject) {
      setFeedbackMsg({
        type: 'err',
        text: 'Regla fundamental: No puedes invertir en tu propio proyecto.',
      });
      return;
    }

    if (!isInvestmentOpen) {
      setFeedbackMsg({
        type: 'err',
        text: isPaused
          ? 'La presentación se encuentra en pausa. Las inversiones están detenidas temporalmente.'
          : 'Las inversiones para este proyecto se encuentran cerradas.',
      });
      return;
    }

    if (activeAmount <= 0) {
      setFeedbackMsg({
        type: 'err',
        text: 'Ingresa un monto válido mayor a $0.',
      });
      return;
    }

    if (activeAmount > effectiveBudget.availableBudget) {
      await recordCancelledOrRejectedInvestment({
        investor: currentParticipant,
        project: activeProject,
        amount: activeAmount,
        availableBudget: effectiveBudget.availableBudget,
        roundNumber: eventConfig.activeRoundNumber || 1,
        status: 'rejected',
      });
      setFeedbackMsg({
        type: 'err',
        text: `Fondos insuficientes. Tu capital disponible actual es ${formatCurrency(
          effectiveBudget.availableBudget
        )}.`,
      });
      return;
    }

    setPendingAmount(activeAmount);
    setShowConfirmModal(true);
  };

  const handleConfirmInvestment = async () => {
    if (!currentParticipant || !activeProject || isSubmitting || isMyProject) return;
    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const inv = await executeInvestmentTransaction({
        investor: currentParticipant,
        projectId: activeProject.id,
        amount: pendingAmount,
        existingConfirmedInvestments: investments,
      });
      setShowConfirmModal(false);
      setCustomAmountStr('');
      setFeedbackMsg({
        type: 'ok',
        text: `¡Inversión confirmada! Has aportado ${formatCurrency(inv.amount)} al proyecto ${
          activeProject.name
        }.`,
      });
    } catch (err) {
      setShowConfirmModal(false);
      setFeedbackMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo procesar la inversión.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOperation = async () => {
    setShowConfirmModal(false);
    if (currentParticipant && activeProject) {
      await recordCancelledOrRejectedInvestment({
        investor: currentParticipant,
        project: activeProject,
        amount: pendingAmount,
        availableBudget: effectiveBudget.availableBudget,
        roundNumber: eventConfig.activeRoundNumber || 1,
        status: 'cancelled',
      });
    }
  };

  const handleToggleReaction = async (reactionType: ReactionType) => {
    if (!activeProject) return;
    if (!currentParticipant) {
      setFeedbackMsg({
        type: 'err',
        text: 'Identifícate en el panel de abajo para poder enviar reacciones en vivo.',
      });
      return;
    }
    if (isPaused) return;

    const reactionId = `${currentParticipant.id}_${activeProject.id}_${reactionType}`.replace(
      /[^a-zA-Z0-9_-]/g,
      ''
    );
    const existing = reactions.find((r) => r.id === reactionId);
    await toggleProjectReaction({
      participant: currentParticipant,
      project: activeProject,
      reactionType,
      existingReaction: existing,
    });
  };

  // =========================================================================
  // VISTA 1: RULETA EN CURSO (SI LA ETAPA ES ROULETTE Y NO HAY PROYECTO FIJO)
  // =========================================================================
  if (!activeProject && eventConfig.stage === 'roulette') {
    return (
      <div className="space-y-6">
        <RouletteWheel
          projects={projects}
          eventConfig={eventConfig}
          isAdminMode={false}
          onRequireAdmin={() => onNavigate('admin')}
        />
      </div>
    );
  }

  // =========================================================================
  // VISTA 2: PANTALLA DE ESPERA ANTES O ENTRE PRESENTACIONES
  // =========================================================================
  if (!activeProject) {
    const getStageDescription = () => {
      switch (eventConfig.stage) {
        case 'registration':
          return 'INSCRIPCIÓN DE PROYECTOS EN CURSO';
        case 'closed_registration':
          return 'REGISTRO CERRADO · EN ESPERA DEL PRIMER PITCH';
        case 'finished':
          return 'EVENTO FINALIZADO';
        default:
          return 'PREPARANDO SIGUIENTE RONDA';
      }
    };

    return (
      <section className="nb-card-lg bg-white p-8 sm:p-12 text-center space-y-6 max-w-2xl mx-auto">
        <div className="inline-block nb-sticker bg-[#FFDC00] px-4 py-1.5 text-xs font-bold">
          {eventConfig.stage === 'finished' ? 'RESULTADOS FINALES' : 'SALA DE ESPERA'}
        </div>

        <h2 className="font-black-display text-4xl sm:text-5xl">
          {eventConfig.stage === 'finished'
            ? 'EL EVENTO HA FINALIZADO'
            : 'PREPÁRATE PARA LA RONDA EN VIVO'}
        </h2>

        {eventConfig.stage !== 'finished' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto text-left">
            <div className="border-3 border-black p-4 bg-[#B8FF9F]">
              <div className="font-mono-data text-xs font-bold text-black/70">
                MI CAPITAL DISPONIBLE
              </div>
              <div className="font-mono-data font-bold text-3xl mt-1">
                {formatCurrency(currentBudget?.availableBudget ?? 100000)}
              </div>
              <div className="text-xs font-semibold text-black/70 mt-1">
                Para invertir en tus compañeros
              </div>
            </div>
            <div className="border-3 border-black p-4 bg-[#90A8ED]">
              <div className="font-mono-data text-xs font-bold text-black/70">
                PROYECTOS EN COMPETENCIA
              </div>
              <div className="font-mono-data font-bold text-3xl mt-1">
                {projects.length}
              </div>
              <div className="text-xs font-semibold text-black/70 mt-1">
                Incluyendo tu proyecto
              </div>
            </div>
          </div>
        )}

        <div className="border-3 border-black bg-[#F4F4F0] p-4 text-xs font-mono-data font-bold text-black/80 max-w-lg mx-auto">
          ESTADO DEL EVENTO: {getStageDescription()}
        </div>

        <p className="text-sm font-semibold max-w-md mx-auto text-black/85">
          {eventConfig.stage === 'finished'
            ? 'Todas las presentaciones han concluido. Consulta el Ranking Oficial en la sección de Resultados.'
            : 'Dinámica integrada: cuando presentes tu proyecto serás evaluado y recibirás capital; cuando tus compañeros presenten, podrás analizar sus propuestas e invertir tu presupuesto virtual. La pantalla se adaptará automáticamente.'}
        </p>

        <div className="pt-2">
          {eventConfig.stage === 'finished' ? (
            <button
              onClick={() => onNavigate('resultados')}
              className="nb-btn bg-[#B8FF9F] px-6 py-3 font-display font-bold text-sm"
            >
              VER RANKING OFICIAL TOP 05
            </button>
          ) : (
            <button
              onClick={() => onNavigate('proyectos')}
              className="nb-btn bg-white px-6 py-2.5 font-display font-bold text-xs"
            >
              IR A MI PROYECTO E INVERSIONES
            </button>
          )}
        </div>
      </section>
    );
  }

  const currentRoundDisplay = String(
    eventConfig.activeRoundNumber || activeProject.presentationOrder || 1
  ).padStart(2, '0');
  const totalProjectsDisplay = String(Math.max(projects.length, 1)).padStart(2, '0');

  // =========================================================================
  // VISTA 3: MODO PROYECCIÓN PÚBLICA (VIDEOBEAM / SALÓN DE CLASES)
  // =========================================================================
  if (isProjectionMode) {
    return (
      <div className="min-h-screen bg-[#F4F4F0] p-6 sm:p-10 flex flex-col justify-between gap-6">
        <div className="flex items-center justify-between gap-4 border-b-4 border-black pb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-display font-extrabold text-2xl">PITCHINVESTORS.</span>
            <span className="nb-sticker bg-[#FFDC00] px-3 py-1 text-sm font-bold">
              RONDA #{currentRoundDisplay} / {totalProjectsDisplay}
            </span>
            <span
              className={`nb-sticker px-3 py-1 text-sm font-bold ${
                isRoundRunning
                  ? 'bg-[#B8FF9F]'
                  : isPaused
                    ? 'bg-[#FF90E8]'
                    : 'bg-white'
              }`}
            >
              {isRoundRunning
                ? 'RONDA ACTIVA · INVERSIONES ABIERTAS'
                : isPaused
                  ? 'RONDA EN PAUSA'
                  : 'TIEMPO FINALIZADO'}
            </span>
          </div>

          <button
            onClick={() => setIsProjectionMode(false)}
            className="nb-btn bg-black text-white px-4 py-2 font-display font-bold text-xs flex items-center gap-2"
          >
            <Minimize2 className="w-4 h-4" />
            <span>SALIR DE MODO PROYECCIÓN</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch flex-1">
          <div className="lg:col-span-7 nb-card-lg bg-white p-8 flex flex-col justify-between">
            <div>
              <div className="font-mono-data text-sm font-bold text-black/70">
                {activeProject.code} · {activeProject.grade}
              </div>
              <h1 className="font-black-display text-5xl sm:text-7xl leading-none mt-2">
                {activeProject.name}
              </h1>
              <p className="text-xl font-semibold text-black/80 mt-4">
                {activeProject.category}
              </p>
            </div>

            <div className="border-t-4 border-black pt-6 mt-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="font-mono-data text-xs font-bold text-black/70">EXPOSITOR</div>
                <div className="font-display font-extrabold text-3xl mt-1">
                  {activeProject.entrepreneurName}
                </div>
              </div>
              <div className="bg-[#90A8ED] border-3 border-black p-4 min-w-[200px]">
                <div className="font-mono-data text-xs font-bold">INVERSORES PARTICIPANTES</div>
                <div className="font-mono-data font-bold text-4xl">
                  {activeProject.investorCount}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <div
              className={`nb-card-lg p-8 text-center ${
                remainingSec <= 15 && isRoundRunning
                  ? 'bg-[#FF90E8]'
                  : isPaused
                    ? 'bg-[#FFDC00]'
                    : 'bg-[#FFDC00]'
              }`}
            >
              <div className="font-mono-data text-sm font-bold flex items-center justify-center gap-2">
                <Clock className="w-5 h-5" />
                <span>TIEMPO RESTANTE</span>
              </div>
              <div className="font-mono-data font-bold text-7xl sm:text-8xl tracking-tight mt-2">
                {formatTimeMMSS(remainingSec)}
              </div>
            </div>

            <div className="nb-card-lg bg-[#B8FF9F] p-8 flex-1 flex flex-col justify-center">
              <div className="font-mono-data text-sm font-bold">CAPITAL ACUMULADO</div>
              <div className="font-mono-data font-bold text-5xl sm:text-6xl mt-2">
                {showCapitalToPublic ? formatCurrency(activeProject.totalInvested) : 'CONFIDENCIAL'}
              </div>
            </div>
          </div>
        </div>

        <div className="nb-card bg-white p-5">
          <div className="font-mono-data text-xs font-bold mb-3">
            REACCIONES EN VIVO ({activeProject.totalReactions} TOTALES)
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {REACTION_DEFINITIONS.map((r) => (
              <div
                key={r.type}
                className="border-2 border-black p-3 text-center bg-[#F4F4F0]"
              >
                <div className="text-3xl">{r.emoji}</div>
                <div className="font-mono-data font-bold text-sm mt-1">
                  {activeProject[r.countField] || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VISTA 4: DINÁMICA SEGÚN QUIÉN PRESENTA (CASO 1 vs CASO 2)
  // =========================================================================
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Botón de acceso a modo proyección */}
      <div className="flex justify-end">
        <button
          onClick={() => setIsProjectionMode(true)}
          className="nb-btn bg-white px-3 py-1.5 text-xs font-mono-data font-bold flex items-center gap-1.5"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>MODO PROYECCIÓN PÚBLICA</span>
        </button>
      </div>

      {/* CASO 1: EL PARTICIPANTE ESTÁ PRESENTANDO SU PROYECTO */}
      {isMyProject ? (
        <section className="nb-card-lg bg-white p-6 sm:p-8 space-y-6 border-4 border-black">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-3 border-black pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="nb-sticker bg-[#FF90E8] px-3 py-1 text-xs font-bold">
                ¡ES TU TURNO DE EXPONER! · DEFENDIENDO TU PROYECTO
              </span>
              <span className="font-mono-data text-xs font-bold">
                RONDA {currentRoundDisplay} / {totalProjectsDisplay}
              </span>
            </div>
            <span className="font-mono-data text-xs font-bold text-black/70">
              {activeProject.code}
            </span>
          </div>

          {/* Datos del Proyecto y Temporizador del Pitch */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
            <div className="sm:col-span-8 space-y-2">
              <div className="font-mono-data text-xs font-bold text-black/60">
                PROYECTO EN EXPOSICIÓN
              </div>
              <h1 className="font-black-display text-4xl sm:text-5xl leading-tight">
                {activeProject.name}
              </h1>
              <p className="text-base font-semibold text-black/85">{activeProject.category}</p>
              <div className="pt-2">
                <span className="font-mono-data text-xs font-bold text-black/65">
                  EXPOSITOR:{' '}
                </span>
                <span className="font-bold text-base text-[#000]">{activeProject.entrepreneurName} (TÚ)</span>
              </div>
            </div>

            <div
              className={`sm:col-span-4 border-4 border-black p-4 text-center shadow-[4px_4px_0px_#000] ${
                remainingSec <= 15 && isRoundRunning ? 'bg-[#FF90E8]' : 'bg-[#FFDC00]'
              }`}
            >
              <div className="font-mono-data text-xs font-bold flex items-center justify-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>TIEMPO RESTANTE</span>
              </div>
              <div className="font-mono-data font-bold text-4xl sm:text-5xl mt-1">
                {formatTimeMMSS(remainingSec)}
              </div>
            </div>
          </div>

          {/* Dos Métricas en Tiempo Real para el Expositor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border-3 border-black p-5 bg-[#B8FF9F]">
              <div className="font-mono-data text-xs font-bold text-black/70 flex items-center justify-between">
                <span>CAPITAL ACUMULADO RECIBIDO EN VIVO</span>
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                {formatCurrency(activeProject.totalInvested)}
              </div>
              <div className="text-xs font-semibold text-black/75 mt-1">
                Aportado por tus compañeros durante este pitch
              </div>
            </div>

            <div className="border-3 border-black p-5 bg-[#90A8ED]">
              <div className="font-mono-data text-xs font-bold text-black/70">
                INVERSORES QUE TE HAN RESPALDADO
              </div>
              <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                {activeProject.investorCount}
              </div>
              <div className="text-xs font-semibold text-black/75 mt-1">
                Estudiantes participando en tu ronda
              </div>
            </div>
          </div>

          {/* Alerta de Regla Fundamental */}
          <div className="border-3 border-black bg-[#FFDC00] p-4 text-xs sm:text-sm font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>
              Regla fundamental: Estás presentando tu propuesta. No puedes invertir en tu propio proyecto. Tu capital disponible se mantiene reservado para cuando tus compañeros expongan.
            </span>
          </div>

          {/* Reacciones en Vivo de los Compañeros */}
          <div className="border-t-2 border-black pt-4">
            <div className="font-mono-data text-xs font-bold mb-3 flex items-center justify-between">
              <span>REACCIONES DE TUS COMPAÑEROS EN VIVO</span>
              <span className="text-black/60">{activeProject.totalReactions} recibidas</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {REACTION_DEFINITIONS.map((r) => (
                <div
                  key={r.type}
                  className="border-2 border-black p-2 text-center bg-[#F4F4F0]"
                >
                  <div className="text-2xl">{r.emoji}</div>
                  <div className="font-mono-data font-bold text-xs mt-1">
                    {activeProject[r.countField] || 0}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        /* CASO 2: OTROS PARTICIPANTES ESTÁN PRESENTANDO (MODO INVERSOR AUTOMÁTICO) */
        <>
          <section className="nb-card-lg bg-white p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-3 border-black pb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`nb-sticker px-3 py-1 text-xs font-bold ${
                    isPitchTimerRunning
                      ? 'bg-[#B8FF9F]'
                      : isPaused
                        ? 'bg-[#FF90E8]'
                        : isInvestmentOpen
                          ? 'bg-[#FFDC00]'
                          : 'bg-[#F4F4F0]'
                  }`}
                >
                  {isPitchTimerRunning
                    ? 'RONDA EN VIVO · PITCH EN CURSO'
                    : isPaused
                      ? 'RONDA PAUSADA'
                      : isInvestmentOpen
                        ? 'TIEMPO DE PITCH CONCLUIDO · INVERSIONES ABIERTAS'
                        : 'RONDA FINALIZADA'}
                </span>
                <span className="font-mono-data text-xs font-bold">
                  RONDA {currentRoundDisplay} / {totalProjectsDisplay}
                </span>
              </div>
              <span className="font-mono-data text-xs font-bold text-black/70">
                {activeProject.code}
              </span>
            </div>

            {/* Título y Cronómetro Sincronizado */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
              <div className="sm:col-span-8 space-y-2">
                <div className="font-mono-data text-xs font-bold text-black/60">
                  PROYECTO EN EXPOSICIÓN
                </div>
                <h1 className="font-black-display text-3xl sm:text-5xl leading-tight">
                  {activeProject.name}
                </h1>
                <p className="text-sm font-semibold text-black/80">{activeProject.category}</p>
                <div className="pt-2">
                  <span className="font-mono-data text-xs font-bold text-black/65">
                    EXPOSITOR:{' '}
                  </span>
                  <span className="font-bold text-base">{activeProject.entrepreneurName}</span>
                </div>
              </div>

              <div
                className={`sm:col-span-4 border-4 border-black p-4 text-center shadow-[4px_4px_0px_#000] ${
                  remainingSec <= 15 && isPitchTimerRunning
                    ? 'bg-[#FF90E8]'
                    : remainingSec === 0 && isInvestmentOpen
                      ? 'bg-[#B8FF9F]'
                      : 'bg-[#FFDC00]'
                }`}
              >
                <div className="font-mono-data text-xs font-bold flex items-center justify-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>
                    {remainingSec > 0
                      ? 'TIEMPO RESTANTE DE PITCH'
                      : isInvestmentOpen
                        ? 'INVERSIONES ABIERTAS'
                        : 'TIEMPO CERRADO'}
                  </span>
                </div>
                <div className="font-mono-data font-bold text-4xl sm:text-5xl mt-1">
                  {formatTimeMMSS(remainingSec)}
                </div>
              </div>
            </div>

            {/* Mensaje de estado de la ronda */}
            {isInvestmentOpen && remainingSec <= 0 && (
              <div className="border-3 border-black bg-[#B8FF9F] p-4 text-xs sm:text-sm font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 shrink-0" />
                <span>
                  TIEMPO DE PITCH CONCLUIDO. Las inversiones continúan abiertas para {activeProject.name}. ¡Aporta tu capital antes de que el docente finalice la ronda!
                </span>
              </div>
            )}

            {!isInvestmentOpen && !isPaused && (
              <div className="border-3 border-black bg-[#FF90E8] p-4 text-xs sm:text-sm font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 shrink-0" />
                <span>
                  RONDA FINALIZADA. Las inversiones para {activeProject.name} se han cerrado. En breve comenzará el siguiente pitch.
                </span>
              </div>
            )}

            {/* Feedback de la operación */}
            {feedbackMsg && (
              <div
                className={`border-3 border-black p-4 text-sm font-bold flex items-start gap-2 ${
                  feedbackMsg.type === 'ok' ? 'bg-[#B8FF9F]' : 'bg-[#FF90E8]'
                }`}
              >
                {feedbackMsg.type === 'ok' ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                )}
                <span>{feedbackMsg.text}</span>
              </div>
            )}

            {/* Reacciones Rápidas */}
            <div className="border-t-2 border-black pt-4">
              <div className="font-mono-data text-xs font-bold mb-3 flex items-center justify-between">
                <span>REACCIONES RÁPIDAS EN VIVO</span>
                <span className="text-black/60">{activeProject.totalReactions} registradas</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {REACTION_DEFINITIONS.map((r) => {
                  const reactionId = currentParticipant
                    ? `${currentParticipant.id}_${activeProject.id}_${r.type}`.replace(
                        /[^a-zA-Z0-9_-]/g,
                        ''
                      )
                    : '';
                  const isSelected = Boolean(
                    reactions.find((rec) => rec.id === reactionId && rec.active)
                  );
                  const count = activeProject[r.countField] || 0;

                  return (
                    <button
                      key={r.type}
                      type="button"
                      onClick={() => handleToggleReaction(r.type)}
                      disabled={isPaused}
                      className={`nb-btn p-2 text-center flex flex-col items-center justify-center transition-transform active:scale-95 ${
                        isSelected ? 'bg-[#FFDC00]' : 'bg-[#F4F4F0]'
                      }`}
                      title={r.label}
                    >
                      <span className="text-2xl">{r.emoji}</span>
                      <span className="font-mono-data font-bold text-xs mt-1 bg-white border border-black px-1.5 py-0.2">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Panel de Inversión o Identificación Inmediata */}
          {currentParticipant ? (
            <section className="nb-card-lg bg-white p-6 sm:p-8 space-y-6">
              {/* Barra de participante activo con opción de cambiar */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F4F4F0] border-2 border-black px-3 py-2 text-xs font-mono-data">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-black/60 font-bold">ESTÁS INVIRTIENDO COMO:</span>
                  <span className="font-bold bg-[#FFDC00] border border-black px-2 py-0.5">
                    {currentParticipant.name}
                  </span>
                  <span className="text-black/60 hidden sm:inline">
                    · Tu proyecto: {currentParticipant.projectName || 'Sin proyecto asignado'}
                  </span>
                </div>
                {onSelectParticipant && (
                  <button
                    type="button"
                    onClick={() => onSelectParticipant({} as Participant)}
                    className="underline font-bold text-black hover:text-black/70 cursor-pointer"
                  >
                    Cambiar participante
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b-3 border-black pb-4">
                <h2 className="font-black-display text-2xl">PANEL DE INVERSIÓN</h2>
                <div className="font-mono-data text-xs font-bold text-black/70">
                  RONDA #{currentRoundDisplay}
                </div>
              </div>

              {/* Resumen de Capital del Inversor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border-3 border-black p-4 bg-[#B8FF9F]">
                  <div className="font-mono-data text-xs font-bold text-black/70">
                    MI CAPITAL DISPONIBLE
                  </div>
                  <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                    {formatCurrency(effectiveBudget.availableBudget)}
                  </div>
                  <div className="text-xs font-semibold text-black/75 mt-1">
                    Total asignado: {formatCurrency(effectiveBudget.initialBudget)}
                  </div>
                </div>

                <div className="border-3 border-black p-4 bg-[#90A8ED]">
                  <div className="font-mono-data text-xs font-bold text-black/70">
                    YA INVERTIDO EN ESTE PROYECTO
                  </div>
                  <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                    {formatCurrency(myInvestedInThisProject)}
                  </div>
                  <div className="text-xs font-semibold text-black/75 mt-1">
                    Total invertido en el evento: {formatCurrency(effectiveBudget.investedBudget)}
                  </div>
                </div>
              </div>

              {/* Selector de Monto */}
              <div className="space-y-3">
                <label className="block font-display font-extrabold text-base">
                  SELECCIONA CUÁNTO DESEAS INVERTIR EN {activeProject.name.toUpperCase()}
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[5000, 10000, 20000, 50000].map((preset) => {
                    const isSelected = customAmountStr === '' && selectedAmount === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        disabled={!isInvestmentOpen}
                        onClick={() => {
                          setCustomAmountStr('');
                          setSelectedAmount(preset);
                        }}
                        className={`nb-btn py-3 px-2 font-mono-data font-bold text-sm sm:text-base ${
                          isSelected ? 'bg-[#FFDC00]' : 'bg-white'
                        }`}
                      >
                        {formatCurrency(preset)}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="block font-mono-data text-xs font-bold mb-1.5 text-black/70">
                    O INGRESA OTRO VALOR PERSONALIZADO:
                  </label>
                  <div className="relative max-w-sm">
                    <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      disabled={!isInvestmentOpen}
                      value={customAmountStr}
                      onChange={(e) => setCustomAmountStr(e.target.value)}
                      placeholder="Ej. 15000"
                      className="nb-input w-full pl-9 pr-4 py-2.5 font-mono-data font-bold text-base"
                    />
                  </div>
                </div>
              </div>

              {/* Botón de Confirmación Principal */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={!isInvestmentOpen || activeAmount <= 0}
                  onClick={handleOpenConfirm}
                  className={`nb-btn w-full py-4 px-6 font-black-display text-lg sm:text-xl flex items-center justify-center gap-2 ${
                    isInvestmentOpen ? 'bg-[#B8FF9F]' : 'bg-[#F4F4F0] text-black/50'
                  }`}
                >
                  <Send className="w-5 h-5" />
                  <span>
                    {isInvestmentOpen
                      ? `CONFIRMAR INVERSIÓN DE ${formatCurrency(activeAmount)}`
                      : isPaused
                        ? 'RONDA PAUSADA (INVERSIONES DETENIDAS)'
                        : 'INVERSIONES CERRADAS (RONDA FINALIZADA)'}
                  </span>
                </button>
              </div>
            </section>
          ) : (
            /* Sección de Identificación Rápida en Vivo cuando no hay participante en esta sesión */
            <section className="nb-card-lg bg-white p-6 sm:p-8 space-y-6 border-4 border-black shadow-[6px_6px_0px_#000]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-3 border-black pb-4">
                <div className="flex items-center gap-2">
                  <span className="nb-sticker bg-[#FFDC00] px-3 py-1 text-xs font-bold">
                    PASO PREVIO · IDENTIFICACIÓN PARA INVERTIR
                  </span>
                  <span className="font-mono-data text-xs font-bold">
                    PRESUPUESTO: $100.000 VIRTUALES
                  </span>
                </div>
              </div>

              <div className="bg-[#FF90E8] border-3 border-black p-4 space-y-1">
                <h3 className="font-black-display text-xl sm:text-2xl">
                  ¿QUIÉN ERES? INGRESA CON TU PIN PARA ACTIVAR TUS $100.000
                </h3>
                <p className="text-xs sm:text-sm font-semibold text-black/85">
                  Cada cuenta está protegida con un PIN personal de 4 dígitos para evitar que nadie invierta en nombre de otro estudiante en <strong>{activeProject.name}</strong>.
                </p>
              </div>

              {quickAuthError && (
                <div className="bg-[#FFDC00] border-3 border-black p-3 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{quickAuthError}</span>
                </div>
              )}

              {/* Opción A: Selección en lista de estudiantes con verificación de PIN */}
              {participants && participants.length > 0 && (
                <div className="space-y-3">
                  <label className="block font-mono-data text-xs font-bold text-black/80">
                    OPCIÓN 1: SELECCIONA TU NOMBRE E INGRESA TU PIN SECRETO (4 DÍGITOS)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <select
                      value={quickPartId}
                      onChange={(e) => handleQuickSelectChange(e.target.value)}
                      className="nb-input sm:col-span-6 px-4 py-3 font-bold text-sm bg-white"
                    >
                      <option value="">-- Elige tu nombre de la lista --</option>
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.projectName ? `(Proyecto: ${p.projectName})` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="relative sm:col-span-3">
                      <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        disabled={!quickPartId}
                        value={quickSelectPin}
                        onChange={(e) =>
                          setQuickSelectPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                        }
                        placeholder={
                          quickSelectStatus === 'unclaimed' ? 'Crea PIN (4)' : 'PIN (4 díg.)'
                        }
                        className="nb-input w-full pl-9 pr-3 py-3 font-mono-data font-bold text-sm tracking-widest bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!quickPartId || quickSelectPin.length !== 4 || isVerifyingPin}
                      onClick={handleQuickVerifyAndEnter}
                      className="nb-btn sm:col-span-3 bg-[#B8FF9F] px-4 py-3 font-display font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 disabled:bg-[#F4F4F0] disabled:text-black/40"
                    >
                      <Lock className="w-4 h-4" />
                      <span>
                        {isVerifyingPin
                          ? 'VERIFICANDO...'
                          : quickSelectStatus === 'unclaimed'
                            ? 'CREAR PIN Y ENTRAR'
                            : 'VERIFICAR Y ENTRAR'}
                      </span>
                    </button>
                  </div>
                  {quickSelectStatus === 'unclaimed' && quickPartId && (
                    <div className="bg-[#B8FF9F] border-2 border-black p-2.5 text-xs font-bold">
                      Esta cuenta aún no tiene PIN asignado. Escribe 4 dígitos para protegerla e ingresar.
                    </div>
                  )}
                </div>
              )}

              {/* Opción B: Registro rápido inline con PIN */}
              <div className="border-t-2 border-black pt-5 space-y-3">
                <label className="block font-mono-data text-xs font-bold text-black/80">
                  OPCIÓN 2: ¿NO ESTÁS EN LA LISTA? REGÍSTRATE CON TU PIN EN 5 SEGUNDOS
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <input
                      type="text"
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      placeholder="Tu nombre completo..."
                      className="nb-input w-full px-4 py-2.5 font-bold text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={quickProjectName}
                      onChange={(e) => setQuickProjectName(e.target.value)}
                      placeholder="Nombre de tu proyecto propio..."
                      className="nb-input w-full px-4 py-2.5 font-bold text-sm"
                    />
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={quickPin}
                      onChange={(e) => setQuickPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="PIN secreto (4 díg.)"
                      className="nb-input w-full pl-9 pr-3 py-2.5 font-mono-data font-bold text-sm tracking-widest"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!quickName.trim() || quickPin.length !== 4 || isQuickRegistering}
                  onClick={handleQuickRegister}
                  className="nb-btn bg-[#90A8ED] px-6 py-3 font-display font-black text-sm flex items-center justify-center gap-2 w-full sm:w-auto disabled:bg-[#F4F4F0] disabled:text-black/40"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>
                    {isQuickRegistering
                      ? 'CREANDO PERFIL...'
                      : 'CREAR PERFIL PROTEGIDO Y ACTIVAR $100.000'}
                  </span>
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {/* Doble Confirmación Modal */}
      {showConfirmModal && activeProject && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="nb-card-lg bg-white max-w-md w-full p-6 sm:p-8 space-y-5">
            <div className="bg-[#FFDC00] border-3 border-black p-3">
              <div className="font-mono-data text-xs font-bold">CONFIRMACIÓN FINAL</div>
              <h3 className="font-black-display text-2xl">¿CONFIRMAR INVERSIÓN?</h3>
            </div>

            <p className="text-sm font-bold">
              Estás a punto de invertir{' '}
              <span className="bg-[#B8FF9F] border border-black px-1.5 font-mono-data">
                {formatCurrency(pendingAmount)}
              </span>{' '}
              en <strong>{activeProject.name}</strong>.
            </p>

            <div className="border-3 border-black bg-[#F4F4F0] p-4 space-y-2 font-mono-data text-sm">
              <div className="flex justify-between">
                <span>Capital actual</span>
                <span className="font-bold">{formatCurrency(effectiveBudget.availableBudget)}</span>
              </div>
              <div className="flex justify-between text-black">
                <span>Monto a invertir</span>
                <span className="font-bold">-{formatCurrency(pendingAmount)}</span>
              </div>
              <div className="border-t-2 border-black pt-2 flex justify-between text-base font-bold">
                <span>Saldo resultante</span>
                <span className="bg-[#B8FF9F] border border-black px-2">
                  {formatCurrency(effectiveBudget.availableBudget - pendingAmount)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                disabled={isSubmitting || !isInvestmentOpen}
                onClick={handleConfirmInvestment}
                className="nb-btn w-full bg-[#B8FF9F] py-3.5 font-black-display text-lg"
              >
                {isSubmitting ? 'PROCESANDO...' : 'CONFIRMAR OPERACIÓN'}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCancelOperation}
                className="nb-btn w-full bg-white py-2.5 font-display font-bold text-sm"
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
