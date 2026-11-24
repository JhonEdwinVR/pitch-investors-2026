import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Play,
  Pause,
  Square,
  CheckCircle2,
  Users,
  DollarSign,
  BarChart3,
  Database,
  Download,
  RefreshCw,
  AlertTriangle,
  Edit3,
  Ban,
  Eye,
  X,
  ArrowUpDown,
  Clock,
  KeyRound,
} from 'lucide-react';
import { auth, signInAdminWithGoogle, signOutAdmin } from '../firebase';
import {
  AdminLog,
  Budget,
  EventConfig,
  Investment,
  Participant,
  Presentation,
  Project,
  REACTION_DEFINITIONS,
  Reaction,
  formatCurrency,
} from '../types';
import {
  adminResetParticipantPin,
  assignBudgetsToAllInvestors,
  closeEventAndPublishRanking,
  extendPresentationTimer,
  finishCurrentPresentation,
  pausePresentationTimer,
  resetAllEventData,
  resumePresentationTimer,
  seedDemoGrade12Data,
  startPresentationRound,
  toggleParticipantSuspension,
  updateEventConfig,
  updateParticipantDetailsAdmin,
} from '../services/pitchService';
import { RouletteWheel } from './RouletteWheel';

interface AdminPanelProps {
  eventConfig: EventConfig;
  participants: Participant[];
  projects: Project[];
  budgets: Budget[];
  investments: Investment[];
  reactions: Reaction[];
  presentations: Presentation[];
  adminLogs: AdminLog[];
  isAdminUnlocked: boolean;
  setIsAdminUnlocked: (val: boolean) => void;
}

type AdminSubTab = 'control' | 'participantes' | 'inversiones' | 'analiticas' | 'database';
type DbTableName =
  | 'Participantes'
  | 'Proyectos'
  | 'Presupuestos'
  | 'Inversiones'
  | 'Reacciones'
  | 'Presentaciones'
  | 'Eventos'
  | 'Historial Admin';

function exportToCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );
  const escapeCell = (val: unknown) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };
  const csvContent = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  eventConfig,
  participants,
  projects,
  budgets,
  investments,
  reactions,
  presentations,
  adminLogs,
  isAdminUnlocked,
  setIsAdminUnlocked,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [subTab, setSubTab] = useState<AdminSubTab>('control');
  const [customBudgetInput, setCustomBudgetInput] = useState(
    String(eventConfig.initialBudgetPerInvestor || 100000)
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');
  const [selectedProjToPresent, setSelectedProjToPresent] = useState<string>('');
  const [directDurationSec, setDirectDurationSec] = useState<number>(180);

  // Section B state
  const [partSearch, setPartSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'investor' | 'entrepreneur'>('all');
  const [editingPart, setEditingPart] = useState<Participant | null>(null);
  const [editName, setEditName] = useState('');
  const [editProjectName, setEditProjectName] = useState('');
  const [pinResetPart, setPinResetPart] = useState<Participant | null>(null);
  const [newPinInput, setNewPinInput] = useState('');
  const [googleAdminEmail, setGoogleAdminEmail] = useState<string>(
    () => auth.currentUser?.email || ''
  );

  // Section C state
  const [invSearch, setInvSearch] = useState('');
  const [invStatusFilter, setInvStatusFilter] = useState<
    'all' | 'confirmed' | 'cancelled' | 'rejected'
  >('all');

  // Section E (Database) state
  const [dbTable, setDbTable] = useState<DbTableName>('Participantes');
  const [dbSearch, setDbSearch] = useState('');
  const [dbSortKey, setDbSortKey] = useState<string>('');
  const [dbSortAsc, setDbSortAsc] = useState<boolean>(true);
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(null);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const expectedPin = eventConfig.adminPin || '1212';
    if (pinInput.trim() === expectedPin) {
      setIsAdminUnlocked(true);
      setPinError('');
    } else {
      setPinError('PIN incorrecto. Verifica el código de administrador.');
    }
  };

  if (!isAdminUnlocked) {
    return (
      <div className="max-w-md mx-auto my-10 nb-card-lg bg-white p-8 space-y-5">
        <div className="flex items-center gap-3 bg-[#FF90E8] border-3 border-black p-4">
          <Lock className="w-7 h-7 shrink-0" />
          <div>
            <div className="font-mono-data text-xs font-bold">ENTORNO PRIVADO</div>
            <h2 className="font-display font-extrabold text-xl">PANEL DE ADMINISTRACIÓN</h2>
          </div>
        </div>
        <p className="text-sm font-semibold">
          Ingresa el PIN de administrador para controlar rondas, asignar presupuestos, supervisar inversiones y explorar la base de datos.
        </p>
        {pinError && (
          <div className="bg-[#FFDC00] border-2 border-black p-3 text-xs font-bold">
            {pinError}
          </div>
        )}
        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label className="block font-mono-data text-xs font-bold mb-1.5">
              PIN DE ACCESO (Por defecto: 1212)
            </label>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              className="nb-input w-full px-4 py-3 font-mono-data text-xl tracking-widest"
              required
            />
          </div>
          <button
            type="submit"
            className="nb-btn w-full bg-black text-white py-3.5 font-display font-bold text-sm"
          >
            DESBLOQUEAR ADMINISTRACIÓN
          </button>
        </form>
      </div>
    );
  }

  const activeProject = projects.find((p) => p.id === eventConfig.activeProjectId);
  const activePresentation = presentations.find(
    (p) => p.id === eventConfig.activePresentationId
  );

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setActionBusy(true);
    setStatusBanner('');
    try {
      await fn();
      setStatusBanner(`Operación completada: ${label}`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Error ejecutando operación.');
    } finally {
      setActionBusy(false);
    }
  };

  // Duplicate detection by normalized first+last or exact normalizedName
  const nameCounts = participants.reduce<Record<string, number>>((acc, p) => {
    acc[p.normalizedName] = (acc[p.normalizedName] || 0) + 1;
    return acc;
  }, {});

  // Analytics calculations
  const confirmedInvestments = investments.filter((i) => i.status === 'confirmed');
  const cancelledInvestments = investments.filter((i) => i.status === 'cancelled');
  const rejectedInvestments = investments.filter((i) => i.status === 'rejected');
  const activeInvestorsCount = budgets.filter((b) => b.investmentCount > 0).length;
  const totalUnusedCapital = budgets.reduce((sum, b) => sum + b.availableBudget, 0);
  const totalInvestedCapital = confirmedInvestments.reduce((sum, i) => sum + i.amount, 0);
  const investorsWithoutInvestments = budgets.filter((b) => b.investmentCount === 0);

  // Database table rows mapper
  const getDbRows = (): Record<string, unknown>[] => {
    switch (dbTable) {
      case 'Participantes':
        return participants.map((p) => ({ ...p }));
      case 'Proyectos':
        return projects.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          entrepreneurName: p.entrepreneurName,
          status: p.status,
          presentationOrder: p.presentationOrder,
          totalInvested: p.totalInvested,
          investorCount: p.investorCount,
          totalReactions: p.totalReactions,
          createdAt: p.createdAt,
        }));
      case 'Presupuestos':
        return budgets.map((b) => ({ ...b }));
      case 'Inversiones':
        return investments.map((i) => ({ ...i }));
      case 'Reacciones':
        return reactions.map((r) => ({ ...r }));
      case 'Presentaciones':
        return presentations.map((pr) => ({ ...pr }));
      case 'Eventos':
        return [{ ...eventConfig }];
      case 'Historial Admin':
        return adminLogs.map((l) => ({ ...l }));
    }
  };

  const rawDbRows = getDbRows();
  const filteredDbRows = rawDbRows.filter((row) => {
    const q = dbSearch.toLowerCase().trim();
    if (!q) return true;
    return JSON.stringify(row).toLowerCase().includes(q);
  });

  const sortedDbRows = [...filteredDbRows].sort((a, b) => {
    if (!dbSortKey) return 0;
    const va = a[dbSortKey];
    const vb = b[dbSortKey];
    if (typeof va === 'number' && typeof vb === 'number') {
      return dbSortAsc ? va - vb : vb - va;
    }
    return dbSortAsc
      ? String(va ?? '').localeCompare(String(vb ?? ''))
      : String(vb ?? '').localeCompare(String(va ?? ''));
  });

  const dbColumns = sortedDbRows.length > 0 ? Object.keys(sortedDbRows[0]) : [];

  return (
    <div className="space-y-6">
      {/* Admin Top Header */}
      <div className="nb-card-lg bg-[#FF90E8] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-black text-white p-2.5 border-2 border-black">
            <ShieldCheck className="w-6 h-6 text-[#FFDC00]" />
          </div>
          <div>
            <div className="font-mono-data text-xs font-bold">
              PANEL DE ADMINISTRACIÓN PRIVADO · ETAPA ACTUAL: {eventConfig.stage.toUpperCase()}
            </div>
            <h1 className="font-black-display text-2xl sm:text-3xl">
              CONTROL CENTRAL DEL EVENTO
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'control', label: 'A. Control y Ruletas' },
              { id: 'participantes', label: 'B. Participantes' },
              { id: 'inversiones', label: 'C. Inversiones' },
              { id: 'analiticas', label: 'D. Analíticas' },
              { id: 'database', label: 'E. Base de Datos' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`nb-btn px-3 py-2 text-xs font-display font-bold whitespace-nowrap ${
                subTab === tab.id ? 'bg-[#FFDC00]' : 'bg-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {statusBanner && (
        <div className="nb-card bg-[#B8FF9F] px-4 py-3 font-bold text-sm flex items-center justify-between">
          <span>{statusBanner}</span>
          <button onClick={() => setStatusBanner('')} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Google Admin Auth Banner para gestionar credenciales PIN en Firestore */}
      <div className="nb-card bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono-data">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 shrink-0" />
          {googleAdminEmail ? (
            <span>
              <strong>CUENTA GOOGLE ADMIN ACTIVA:</strong> {googleAdminEmail} (habilitada para restablecer PINs de estudiantes).
            </span>
          ) : (
            <span>
              <strong>SESIÓN GOOGLE ADMIN:</strong> Conecta tu cuenta Google verificada para poder restablecer PINs olvidados de estudiantes en Firestore.
            </span>
          )}
        </div>
        {googleAdminEmail ? (
          <button
            type="button"
            onClick={async () => {
              await signOutAdmin();
              setGoogleAdminEmail('');
            }}
            className="nb-btn bg-[#F4F4F0] px-3 py-1.5 text-[11px] font-bold"
          >
            Desconectar Google
          </button>
        ) : (
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await signInAdminWithGoogle();
                setGoogleAdminEmail(res.user.email || '');
                setStatusBanner(`Conectado como Google Admin: ${res.user.email}`);
              } catch (err) {
                setStatusBanner(
                  err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.'
                );
              }
            }}
            className="nb-btn bg-[#FFDC00] px-3 py-1.5 text-[11px] font-bold"
          >
            Conectar Google Admin
          </button>
        )}
      </div>

      {/* ================================================================= */}
      {/* SECTION A: EVENT CONTROL & ROULETTE                               */}
      {/* ================================================================= */}
      {subTab === 'control' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Stage & Timer Controls */}
            <div className="lg:col-span-7 nb-card bg-white p-6 space-y-5">
              <div className="border-b-2 border-black pb-3">
                <div className="font-mono-data text-xs font-bold">SECCIÓN A · FLUJO DE ETAPAS</div>
                <h2 className="font-display font-extrabold text-xl">
                  ACCIONES DE CONTROL DEL EVENTO
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  disabled={actionBusy}
                  onClick={() =>
                    runAction('Registro abierto', () =>
                      updateEventConfig(
                        {
                          stage: 'registration',
                          lastNotification: 'Registro habilitado para nuevos participantes.',
                        },
                        eventConfig,
                        'Abrir registro'
                      )
                    )
                  }
                  className={`nb-btn p-3 text-left font-bold text-xs ${
                    eventConfig.stage === 'registration' ? 'bg-[#B8FF9F]' : 'bg-[#F4F4F0]'
                  }`}
                >
                  <div className="font-display text-sm">1. ABRIR REGISTRO</div>
                  <div className="text-[11px] font-normal">Habilita inscripciones públicas</div>
                </button>

                <button
                  disabled={actionBusy}
                  onClick={() =>
                    runAction('Registro cerrado', () =>
                      updateEventConfig(
                        {
                          stage: 'closed_registration',
                          lastNotification: 'Registro cerrado. Lista definitiva de proyectos generada.',
                        },
                        eventConfig,
                        'Cerrar registro'
                      )
                    )
                  }
                  className={`nb-btn p-3 text-left font-bold text-xs ${
                    eventConfig.stage === 'closed_registration' ? 'bg-[#FFDC00]' : 'bg-[#F4F4F0]'
                  }`}
                >
                  <div className="font-display text-sm">2. CERRAR REGISTRO</div>
                  <div className="text-[11px] font-normal">Bloquea nuevas inscripciones</div>
                </button>

                <button
                  disabled={actionBusy}
                  onClick={() =>
                    runAction('Evento iniciado (Ruletas habilitadas)', () =>
                      updateEventConfig(
                        {
                          stage: 'roulette',
                          lastNotification: '¡Evento iniciado! Ruleta de selección habilitada.',
                        },
                        eventConfig,
                        'Iniciar evento'
                      )
                    )
                  }
                  className={`nb-btn p-3 text-left font-bold text-xs ${
                    eventConfig.stage === 'roulette' ? 'bg-[#90A8ED]' : 'bg-[#F4F4F0]'
                  }`}
                >
                  <div className="font-display text-sm">3. INICIAR EVENTO (RULETAS)</div>
                  <div className="text-[11px] font-normal">Habilita selección de proyectos</div>
                </button>

                <button
                  disabled={actionBusy}
                  onClick={() =>
                    runAction('Evento cerrado y Ranking publicado', () =>
                      closeEventAndPublishRanking(eventConfig, projects)
                    )
                  }
                  className={`nb-btn p-3 text-left font-bold text-xs ${
                    eventConfig.stage === 'finished' ? 'bg-[#FF90E8]' : 'bg-[#F4F4F0]'
                  }`}
                >
                  <div className="font-display text-sm">4. CERRAR EVENTO (TOP 05)</div>
                  <div className="text-[11px] font-normal">Calcula y publica resultados finales</div>
                </button>
              </div>

              {/* Active Round Controls */}
              <div className="border-t-2 border-black pt-4 space-y-3">
                <div className="font-mono-data text-xs font-bold flex items-center justify-between">
                  <span>
                    CONTROL DE RONDA ACTIVA:{' '}
                    {activeProject ? `${activeProject.name} (${activeProject.entrepreneurName})` : 'NINGUNA'}
                  </span>
                  {activeProject && (
                    <span className="nb-sticker bg-[#B8FF9F] px-2 py-0.5 text-[10px]">
                      ESTADO: {eventConfig.timerStatus.toUpperCase()}
                    </span>
                  )}
                </div>

                {activeProject ? (
                  <div className="space-y-3 bg-[#F4F4F0] border-2 border-black p-3.5">
                    <div className="flex flex-wrap gap-2.5">
                      {eventConfig.timerStatus === 'running' ? (
                        <button
                          disabled={actionBusy}
                          onClick={() =>
                            runAction('Presentación pausada', () =>
                              pausePresentationTimer(eventConfig)
                            )
                          }
                          className="nb-btn bg-[#FFDC00] px-4 py-2 font-display font-bold text-xs flex items-center gap-1.5"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>PAUSAR</span>
                        </button>
                      ) : (
                        <button
                          disabled={actionBusy || eventConfig.timerStatus !== 'paused'}
                          onClick={() =>
                            runAction('Presentación reanudada', () =>
                              resumePresentationTimer(eventConfig)
                            )
                          }
                          className="nb-btn bg-[#B8FF9F] px-4 py-2 font-display font-bold text-xs flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>REANUDAR</span>
                        </button>
                      )}

                      <button
                        disabled={actionBusy}
                        onClick={() =>
                          runAction('Tiempo extendido +60s', () =>
                            extendPresentationTimer(eventConfig, 60)
                          )
                        }
                        className="nb-btn bg-[#90A8ED] px-3 py-2 font-display font-bold text-xs flex items-center gap-1"
                        title="Sumar 60 segundos al temporizador del pitch"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>+60s</span>
                      </button>

                      <button
                        disabled={actionBusy}
                        onClick={() =>
                          runAction('Tiempo extendido +30s', () =>
                            extendPresentationTimer(eventConfig, 30)
                          )
                        }
                        className="nb-btn bg-[#90A8ED] px-3 py-2 font-display font-bold text-xs flex items-center gap-1"
                        title="Sumar 30 segundos al temporizador del pitch"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>+30s</span>
                      </button>

                      <button
                        disabled={actionBusy}
                        onClick={() =>
                          runAction('Presentación finalizada', () =>
                            finishCurrentPresentation(
                              eventConfig,
                              activeProject,
                              activePresentation
                            )
                          )
                        }
                        className="nb-btn bg-black text-white px-4 py-2 font-display font-bold text-xs flex items-center gap-1.5 ml-auto"
                      >
                        <Square className="w-3.5 h-3.5" />
                        <span>FINALIZAR RONDA Y VOLVER A RULETA</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Lanzador directo de presentación para el Administrador */
                  <div className="bg-[#FFDC00]/30 border-2 border-black p-4 space-y-3">
                    <div className="font-mono-data text-xs font-bold text-black/80">
                      LANZAR PRESENTACIÓN DIRECTA DE UN PROYECTO (SIN RULETA)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                      <div className="sm:col-span-6">
                        <select
                          value={selectedProjToPresent}
                          onChange={(e) => setSelectedProjToPresent(e.target.value)}
                          className="nb-input w-full px-3 py-2 text-xs font-bold bg-white"
                        >
                          <option value="">-- Selecciona proyecto a presentar --</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} · {p.name} ({p.entrepreneurName}) · {p.status}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <select
                          value={directDurationSec}
                          onChange={(e) => setDirectDurationSec(Number(e.target.value))}
                          className="nb-input w-full px-3 py-2 text-xs font-bold bg-white"
                        >
                          <option value={60}>1:00 min (60s)</option>
                          <option value={120}>2:00 min (120s)</option>
                          <option value={180}>3:00 min (180s)</option>
                          <option value={240}>4:00 min (240s)</option>
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <button
                          type="button"
                          disabled={actionBusy || !selectedProjToPresent}
                          onClick={() => {
                            const target = projects.find((p) => p.id === selectedProjToPresent);
                            if (target) {
                              runAction(`Presentando ${target.name}`, () =>
                                startPresentationRound(
                                  target,
                                  directDurationSec,
                                  projects,
                                  eventConfig
                                )
                              );
                            }
                          }}
                          className="nb-btn w-full bg-[#B8FF9F] py-2 px-3 font-display font-black text-xs flex items-center justify-center gap-1 disabled:bg-[#F4F4F0] disabled:text-black/40"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>LANZAR EN VIVO</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* System Utilities */}
              <div className="border-t-2 border-black pt-4 flex flex-wrap gap-3">
                <button
                  disabled={actionBusy}
                  onClick={() =>
                    runAction('Datos de demostración cargados', () =>
                      seedDemoGrade12Data(true)
                    )
                  }
                  className="nb-btn bg-[#90A8ED] px-4 py-2 text-xs font-mono-data font-bold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>CARGAR DEMO GRADO 12 (6 PROYECTOS)</span>
                </button>
                <button
                  disabled={actionBusy}
                  onClick={() =>
                    runAction('Evento reiniciado en blanco', () =>
                      resetAllEventData(eventConfig)
                    )
                  }
                  className="nb-btn bg-white px-4 py-2 text-xs font-mono-data font-bold"
                >
                  REINICIAR EVENTO (LIMPIAR BD)
                </button>
              </div>
            </div>

            {/* Budget & Governance Config */}
            <div className="lg:col-span-5 nb-card bg-white p-6 space-y-5">
              <div className="border-b-2 border-black pb-3">
                <div className="font-mono-data text-xs font-bold">PRESUPUESTO Y REGLAS</div>
                <h2 className="font-display font-extrabold text-xl">
                  CONFIGURACIÓN DEL MERCADO
                </h2>
              </div>

              {/* Budget Presets */}
              <div className="space-y-2">
                <label className="block font-mono-data text-xs font-bold">
                  CAPITAL POR INVERSOR (ACTUAL: {formatCurrency(eventConfig.initialBudgetPerInvestor)})
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[50000, 100000, 200000].map((val) => (
                    <button
                      key={val}
                      disabled={actionBusy}
                      onClick={() => {
                        setCustomBudgetInput(String(val));
                        runAction(`Presupuesto ${formatCurrency(val)}`, () =>
                          assignBudgetsToAllInvestors(
                            val,
                            participants,
                            budgets,
                            eventConfig
                          )
                        );
                      }}
                      className={`nb-btn py-2 px-2 font-mono-data font-bold text-xs ${
                        eventConfig.initialBudgetPerInvestor === val
                          ? 'bg-[#FFDC00]'
                          : 'bg-[#F4F4F0]'
                      }`}
                    >
                      {formatCurrency(val)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <input
                    type="number"
                    min={1000}
                    step={5000}
                    value={customBudgetInput}
                    onChange={(e) => setCustomBudgetInput(e.target.value)}
                    className="nb-input px-3 py-2 text-sm font-mono-data font-bold flex-1"
                  />
                  <button
                    disabled={actionBusy}
                    onClick={() =>
                      runAction('Presupuesto personalizado asignado', () =>
                        assignBudgetsToAllInvestors(
                          Number(customBudgetInput) || 100000,
                          participants,
                          budgets,
                          eventConfig
                        )
                      )
                    }
                    className="nb-btn bg-[#B8FF9F] px-4 py-2 font-display font-bold text-xs"
                  >
                    ASIGNAR
                  </button>
                </div>
              </div>

              {/* Registration Mode */}
              <div className="space-y-1.5">
                <label className="block font-mono-data text-xs font-bold">
                  MODALIDAD DE REGISTRO
                </label>
                <select
                  value={eventConfig.registrationMode}
                  onChange={(e) =>
                    runAction('Modo de registro actualizado', () =>
                      updateEventConfig(
                        { registrationMode: e.target.value as 'single' | 'dual' },
                        eventConfig,
                        'Cambiar modo de registro'
                      )
                    )
                  }
                  className="nb-input w-full px-3 py-2 text-xs font-bold"
                >
                  <option value="single">Único (Nombre + Proyecto opcional)</option>
                  <option value="dual">Dual («Soy emprendedor» o «Soy inversor»)</option>
                </select>
              </div>

              {/* Visibility Mode */}
              <div className="space-y-1.5">
                <label className="block font-mono-data text-xs font-bold">
                  VISIBILIDAD DE LAS INVERSIONES
                </label>
                <select
                  value={eventConfig.visibilityMode}
                  onChange={(e) =>
                    runAction('Visibilidad actualizada', () =>
                      updateEventConfig(
                        {
                          visibilityMode: e.target.value as
                            | 'admin_only'
                            | 'private_totals'
                            | 'public',
                        },
                        eventConfig,
                        'Cambiar visibilidad de inversiones'
                      )
                    )
                  }
                  className="nb-input w-full px-3 py-2 text-xs font-bold"
                >
                  <option value="private_totals">
                    Privadas (Público ve acumulados; Admin ve detalle)
                  </option>
                  <option value="public">Públicas (Todos ven quién invirtió y cuánto)</option>
                  <option value="admin_only">Solo Administrador (Acumulados ocultos)</option>
                </select>
              </div>

              {/* Entrepreneur Can Invest in Others */}
              <label className="flex items-center gap-2.5 border-2 border-black p-3 bg-[#F4F4F0] cursor-pointer text-xs font-bold">
                <input
                  type="checkbox"
                  checked={eventConfig.entrepreneurCanInvest}
                  onChange={(e) =>
                    runAction('Permiso de inversión para emprendedores actualizado', () =>
                      updateEventConfig(
                        { entrepreneurCanInvest: e.target.checked },
                        eventConfig,
                        'Configurar inversión de emprendedores'
                      )
                    )
                  }
                  className="w-4 h-4 accent-black"
                />
                <span>Permitir a emprendedores invertir en otros proyectos (nunca en el suyo)</span>
              </label>

              {/* Change Admin PIN */}
              <div className="space-y-1">
                <label className="block font-mono-data text-xs font-bold">
                  PIN DE ADMINISTRADOR ACTUAL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    defaultValue={eventConfig.adminPin}
                    maxLength={16}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val.length >= 4 && val !== eventConfig.adminPin) {
                        runAction('PIN actualizado', () =>
                          updateEventConfig({ adminPin: val }, eventConfig, 'Actualizar PIN')
                        );
                      }
                    }}
                    className="nb-input px-3 py-1.5 font-mono-data text-xs font-bold w-32"
                  />
                  <span className="text-[11px] font-medium self-center text-black/70">
                    (Edita y haz clic fuera para guardar)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Embedded Admin Roulette */}
          <RouletteWheel projects={projects} eventConfig={eventConfig} isAdminMode={true} />
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION B: PARTICIPANTS & PROJECTS                                */}
      {/* ================================================================= */}
      {subTab === 'participantes' && (
        <div className="nb-card bg-white p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-black pb-4">
            <div>
              <div className="font-mono-data text-xs font-bold">SECCIÓN B</div>
              <h2 className="font-display font-extrabold text-2xl">
                PARTICIPANTES Y PROYECTOS ({participants.length})
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
                placeholder="Buscar participante o proyecto..."
                className="nb-input px-3 py-2 text-xs font-bold"
              />
              {(['all', 'investor', 'entrepreneur'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`nb-btn px-3 py-2 text-xs font-mono-data font-bold ${
                    roleFilter === r ? 'bg-[#FFDC00]' : 'bg-[#F4F4F0]'
                  }`}
                >
                  {r === 'all' ? 'Todos' : r === 'investor' ? 'Inversores' : 'Emprendedores'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono-data text-xs">
              <thead>
                <tr className="border-b-3 border-black bg-[#F4F4F0]">
                  <th className="p-3">PARTICIPANTE</th>
                  <th className="p-3">ROL</th>
                  <th className="p-3">PROYECTO</th>
                  <th className="p-3 text-right">PRESUPUESTO DISP.</th>
                  <th className="p-3">ESTADO</th>
                  <th className="p-3 text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {participants
                  .filter((p) => {
                    if (roleFilter !== 'all' && p.role !== roleFilter) return false;
                    const q = partSearch.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      p.name.toLowerCase().includes(q) ||
                      p.projectName.toLowerCase().includes(q)
                    );
                  })
                  .map((p) => {
                    const b = budgets.find((bg) => bg.investorId === p.id);
                    const isDup = (nameCounts[p.normalizedName] || 0) > 1;
                    return (
                      <tr key={p.id} className="border-b border-black/20 hover:bg-[#FFFDF0]">
                        <td className="p-3 font-bold">
                          {p.name}
                          {isDup && (
                            <span className="ml-2 bg-[#FF90E8] border border-black px-1.5 py-0.5 text-[10px]">
                              DUPLICADO
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {p.role === 'entrepreneur' ? 'Emprendedor' : 'Inversor'}
                        </td>
                        <td className="p-3">{p.projectName || '—'}</td>
                        <td className="p-3 text-right font-bold">
                          {b ? formatCurrency(b.availableBudget) : '—'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 border border-black font-bold ${
                              p.status === 'active' ? 'bg-[#B8FF9F]' : 'bg-[#FF90E8]'
                            }`}
                          >
                            {p.status === 'active' ? 'Activo' : 'Suspendido'}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setEditingPart(p);
                              setEditName(p.name);
                              setEditProjectName(p.projectName);
                            }}
                            className="nb-btn bg-white px-2.5 py-1 text-[11px] inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              setPinResetPart(p);
                              setNewPinInput(String(Math.floor(1000 + Math.random() * 9000)));
                            }}
                            className="nb-btn bg-[#90A8ED] px-2.5 py-1 text-[11px] inline-flex items-center gap-1"
                          >
                            <KeyRound className="w-3 h-3" />
                            Reset PIN
                          </button>
                          <button
                            onClick={() =>
                              runAction('Estado de participante actualizado', () =>
                                toggleParticipantSuspension(p)
                              )
                            }
                            className="nb-btn bg-[#FFDC00] px-2.5 py-1 text-[11px] inline-flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" />
                            {p.status === 'active' ? 'Suspender' : 'Reactivar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION C: INVESTMENT LEDGER                                      */}
      {/* ================================================================= */}
      {subTab === 'inversiones' && (
        <div className="nb-card bg-white p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-black pb-4">
            <div>
              <div className="font-mono-data text-xs font-bold">SECCIÓN C · AUDITORÍA</div>
              <h2 className="font-display font-extrabold text-2xl">
                SEGUIMIENTO DE INVERSIONES ({investments.length})
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                placeholder="Buscar inversor, proyecto o ID..."
                className="nb-input px-3 py-2 text-xs font-bold"
              />
              {(['all', 'confirmed', 'cancelled', 'rejected'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setInvStatusFilter(st)}
                  className={`nb-btn px-3 py-2 text-xs font-mono-data font-bold ${
                    invStatusFilter === st ? 'bg-[#B8FF9F]' : 'bg-[#F4F4F0]'
                  }`}
                >
                  {st === 'all'
                    ? 'Todas'
                    : st === 'confirmed'
                      ? 'Confirmadas'
                      : st === 'cancelled'
                        ? 'Canceladas'
                        : 'Rechazadas'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono-data text-xs">
              <thead>
                <tr className="border-b-3 border-black bg-[#F4F4F0]">
                  <th className="p-2.5">HORA</th>
                  <th className="p-2.5">RONDA</th>
                  <th className="p-2.5">INVERSOR</th>
                  <th className="p-2.5">PROYECTO</th>
                  <th className="p-2.5 text-right">MONTO</th>
                  <th className="p-2.5 text-right">RESTANTE</th>
                  <th className="p-2.5">ESTADO</th>
                  <th className="p-2.5">ID ÚNICO</th>
                </tr>
              </thead>
              <tbody>
                {investments
                  .filter((inv) => {
                    if (invStatusFilter !== 'all' && inv.status !== invStatusFilter) return false;
                    const q = invSearch.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      inv.investorName.toLowerCase().includes(q) ||
                      inv.projectName.toLowerCase().includes(q) ||
                      inv.id.toLowerCase().includes(q)
                    );
                  })
                  .map((inv) => (
                    <tr key={inv.id} className="border-b border-black/20 hover:bg-[#FFFDF0]">
                      <td className="p-2.5">{inv.timeFormatted}</td>
                      <td className="p-2.5">#{inv.roundNumber}</td>
                      <td className="p-2.5 font-bold">{inv.investorName}</td>
                      <td className="p-2.5 font-bold">{inv.projectName}</td>
                      <td className="p-2.5 text-right font-bold">
                        {formatCurrency(inv.amount)}
                      </td>
                      <td className="p-2.5 text-right">
                        {formatCurrency(inv.remainingCapital)}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 border border-black font-bold ${
                            inv.status === 'confirmed'
                              ? 'bg-[#B8FF9F]'
                              : inv.status === 'cancelled'
                                ? 'bg-[#FFDC00]'
                                : 'bg-[#FF90E8]'
                          }`}
                        >
                          {inv.status === 'confirmed'
                            ? 'Confirmada'
                            : inv.status === 'cancelled'
                              ? 'Cancelada'
                              : 'Rechazada'}
                        </span>
                      </td>
                      <td className="p-2.5 text-[10px] text-black/70">{inv.id}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION D: ANALYTICS & INTERACTIONS                               */}
      {/* ================================================================= */}
      {subTab === 'analiticas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="nb-card p-5 bg-white">
              <div className="font-mono-data text-xs font-bold flex items-center justify-between">
                <span>PARTICIPANTES</span>
                <Users className="w-4 h-4" />
              </div>
              <div className="font-mono-data font-bold text-4xl mt-1">{participants.length}</div>
            </div>
            <div className="nb-card p-5 bg-[#90A8ED]">
              <div className="font-mono-data text-xs font-bold flex items-center justify-between">
                <span>INVERSORES ACTIVOS</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="font-mono-data font-bold text-4xl mt-1">{activeInvestorsCount}</div>
            </div>
            <div className="nb-card p-5 bg-[#B8FF9F]">
              <div className="font-mono-data text-xs font-bold flex items-center justify-between">
                <span>INVERSIONES REALIZADAS</span>
                <DollarSign className="w-4 h-4" />
              </div>
              <div className="font-mono-data font-bold text-4xl mt-1">
                {confirmedInvestments.length}
              </div>
              <div className="text-xs font-mono-data font-bold mt-1">
                Total: {formatCurrency(totalInvestedCapital)}
              </div>
            </div>
            <div className="nb-card p-5 bg-[#FFDC00]">
              <div className="font-mono-data text-xs font-bold flex items-center justify-between">
                <span>REACCIONES TOTALES</span>
                <BarChart3 className="w-4 h-4" />
              </div>
              <div className="font-mono-data font-bold text-4xl mt-1">
                {projects.reduce((s, p) => s + (p.totalReactions || 0), 0)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Capital distribution across projects */}
            <div className="nb-card bg-white p-6 space-y-4">
              <h3 className="font-display font-extrabold text-xl">
                DISTRIBUCIÓN DE CAPITAL ENTRE PROYECTOS
              </h3>
              <div className="space-y-3">
                {[...projects]
                  .sort((a, b) => b.totalInvested - a.totalInvested)
                  .map((p) => {
                    const maxCap = Math.max(
                      1,
                      ...projects.map((pr) => pr.totalInvested)
                    );
                    const pct = Math.round((p.totalInvested / maxCap) * 100);
                    return (
                      <div key={p.id} className="space-y-1">
                        <div className="flex justify-between font-mono-data text-xs font-bold">
                          <span>
                            {p.name} ({p.investorCount} inv.)
                          </span>
                          <span>{formatCurrency(p.totalInvested)}</span>
                        </div>
                        <div className="w-full h-4 border-2 border-black bg-[#F4F4F0]">
                          <div
                            className="h-full bg-[#B8FF9F] border-r-2 border-black"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Most Used Reactions & Unspent Budget */}
            <div className="space-y-6">
              <div className="nb-card bg-white p-6 space-y-3">
                <h3 className="font-display font-extrabold text-xl">
                  REACCIONES MÁS UTILIZADAS
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {REACTION_DEFINITIONS.map((r) => {
                    const total = projects.reduce(
                      (sum, p) => sum + (p[r.countField] || 0),
                      0
                    );
                    return (
                      <div
                        key={r.type}
                        className="border-2 border-black p-2.5 bg-[#F4F4F0] text-center"
                      >
                        <div className="text-xl">{r.emoji}</div>
                        <div className="font-mono-data font-bold text-lg">{total}</div>
                        <div className="text-[11px] font-bold">{r.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="nb-card bg-white p-6 space-y-3">
                <h3 className="font-display font-extrabold text-xl">
                  RESUMEN DE LIQUIDEZ Y ALERTAS
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono-data text-xs">
                  <div className="border-2 border-black p-3 bg-[#FFDC00]">
                    <div className="font-bold">SIN UTILIZAR</div>
                    <div className="text-lg font-bold mt-1">
                      {formatCurrency(totalUnusedCapital)}
                    </div>
                  </div>
                  <div className="border-2 border-black p-3 bg-[#FF90E8]">
                    <div className="font-bold">CANCELADAS / RECHAZADAS</div>
                    <div className="text-lg font-bold mt-1">
                      {cancelledInvestments.length} / {rejectedInvestments.length}
                    </div>
                  </div>
                  <div className="border-2 border-black p-3 bg-[#F4F4F0]">
                    <div className="font-bold">SIN INVERTIR AÚN</div>
                    <div className="text-lg font-bold mt-1">
                      {investorsWithoutInvestments.length} inversores
                    </div>
                  </div>
                </div>
                {investorsWithoutInvestments.length > 0 && (
                  <div className="text-xs font-mono-data bg-[#F4F4F0] border-2 border-black p-3">
                    <strong>Participantes que no han invertido:</strong>{' '}
                    {investorsWithoutInvestments.map((b) => b.investorName).join(', ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION E: EXPLORABLE DATABASE                                    */}
      {/* ================================================================= */}
      {subTab === 'database' && (
        <div className="nb-card bg-white p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b-2 border-black pb-4">
            <div className="flex items-center gap-2">
              <Database className="w-6 h-6" />
              <div>
                <div className="font-mono-data text-xs font-bold">SECCIÓN E · HISTORIAL COMPLETO</div>
                <h2 className="font-display font-extrabold text-2xl">BASE DE DATOS</h2>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={dbSearch}
                onChange={(e) => setDbSearch(e.target.value)}
                placeholder="Búsqueda general en tabla..."
                className="nb-input px-3 py-2 text-xs font-bold"
              />
              <button
                onClick={() => exportToCSV(`pitch_investors_${dbTable}`, sortedDbRows)}
                disabled={sortedDbRows.length === 0}
                className="nb-btn bg-[#B8FF9F] px-4 py-2 text-xs font-display font-bold flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>EXPORTAR CSV</span>
              </button>
            </div>
          </div>

          {/* 7 + 1 Table Tabs */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                'Participantes',
                'Proyectos',
                'Presupuestos',
                'Inversiones',
                'Reacciones',
                'Presentaciones',
                'Eventos',
                'Historial Admin',
              ] as DbTableName[]
            ).map((tName) => (
              <button
                key={tName}
                onClick={() => {
                  setDbTable(tName);
                  setDbSortKey('');
                }}
                className={`nb-btn px-3 py-1.5 text-xs font-mono-data font-bold ${
                  dbTable === tName ? 'bg-[#FFDC00]' : 'bg-[#F4F4F0]'
                }`}
              >
                {tName}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto max-h-[480px] border-2 border-black">
            {sortedDbRows.length === 0 ? (
              <div className="p-8 text-center font-mono-data text-xs">
                No hay registros en {dbTable} que coincidan con la búsqueda.
              </div>
            ) : (
              <table className="w-full text-left border-collapse font-mono-data text-xs">
                <thead className="sticky top-0 bg-[#FFDC00] border-b-2 border-black">
                  <tr>
                    <th className="p-2.5 border-r border-black">VER</th>
                    {dbColumns.map((col) => (
                      <th
                        key={col}
                        onClick={() => {
                          if (dbSortKey === col) {
                            setDbSortAsc(!dbSortAsc);
                          } else {
                            setDbSortKey(col);
                            setDbSortAsc(true);
                          }
                        }}
                        className="p-2.5 border-r border-black cursor-pointer hover:bg-[#FF90E8] whitespace-nowrap"
                      >
                        <span className="inline-flex items-center gap-1">
                          {col}
                          <ArrowUpDown className="w-3 h-3" />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedDbRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-black/20 hover:bg-[#FFFDF0]">
                      <td className="p-2 border-r border-black/20">
                        <button
                          onClick={() => setSelectedRecord(row)}
                          className="nb-btn bg-white px-2 py-1 text-[10px] inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          Detalle
                        </button>
                      </td>
                      {dbColumns.map((col) => (
                        <td
                          key={col}
                          className="p-2 border-r border-black/20 max-w-[200px] truncate"
                        >
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Edit Participant Modal */}
      {editingPart && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="nb-card-lg bg-white max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <h3 className="font-display font-extrabold text-lg">EDITAR REGISTRO</h3>
              <button onClick={() => setEditingPart(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block font-mono-data text-xs font-bold mb-1">
                  NOMBRE COMPLETO
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="nb-input w-full px-3 py-2 text-sm font-bold"
                />
              </div>
              {editingPart.role === 'entrepreneur' && (
                <div>
                  <label className="block font-mono-data text-xs font-bold mb-1">
                    NOMBRE DEL PROYECTO
                  </label>
                  <input
                    type="text"
                    value={editProjectName}
                    onChange={(e) => setEditProjectName(e.target.value)}
                    className="nb-input w-full px-3 py-2 text-sm font-bold"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={async () => {
                  await runAction('Registro modificado', () =>
                    updateParticipantDetailsAdmin(
                      editingPart,
                      editName,
                      editProjectName,
                      projects,
                      budgets
                    )
                  );
                  setEditingPart(null);
                }}
                className="nb-btn bg-[#B8FF9F] flex-1 py-2.5 font-display font-bold text-sm"
              >
                GUARDAR CAMBIOS
              </button>
              <button
                onClick={() => setEditingPart(null)}
                className="nb-btn bg-white px-4 py-2.5 font-display font-bold text-sm"
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Student PIN Modal */}
      {pinResetPart && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="nb-card-lg bg-white max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <h3 className="font-display font-extrabold text-lg">
                ASIGNAR / RESTABLECER PIN
              </h3>
              <button onClick={() => setPinResetPart(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs font-semibold text-black/80">
              Define un nuevo PIN temporal de 4 dígitos para <strong>{pinResetPart.name}</strong>. Al hacerlo, se desvinculará su sesión anterior para que pueda entrar desde su dispositivo actual.
            </p>
            <div>
              <label className="block font-mono-data text-xs font-bold mb-1">
                NUEVO PIN DE 4 DÍGITOS
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="nb-input w-40 px-3 py-2 font-mono-data text-xl font-bold tracking-widest"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                disabled={newPinInput.length !== 4 || actionBusy}
                onClick={async () => {
                  const target = pinResetPart;
                  const nextPin = newPinInput;
                  setPinResetPart(null);
                  await runAction(`PIN asignado a ${target.name}: ${nextPin}`, () =>
                    adminResetParticipantPin(target, nextPin)
                  );
                }}
                className="nb-btn bg-[#B8FF9F] flex-1 py-2.5 font-display font-bold text-sm disabled:bg-[#F4F4F0]"
              >
                GUARDAR NUEVO PIN
              </button>
              <button
                onClick={() => setPinResetPart(null)}
                className="nb-btn bg-white px-4 py-2.5 font-display font-bold text-sm"
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Individual Record Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="nb-card-lg bg-white max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <h3 className="font-display font-extrabold text-lg">
                REGISTRO INDIVIDUAL · {dbTable.toUpperCase()}
              </h3>
              <button onClick={() => setSelectedRecord(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-[#F4F4F0] border-2 border-black p-4 max-h-96 overflow-y-auto font-mono-data text-xs space-y-1.5">
              {Object.entries(selectedRecord).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-black/15 pb-1">
                  <strong className="shrink-0">{k}:</strong>
                  <span className="text-right break-all">{String(v)}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setSelectedRecord(null)}
              className="nb-btn bg-black text-white w-full py-2.5 font-display font-bold text-sm"
            >
              CERRAR INSPECTOR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
