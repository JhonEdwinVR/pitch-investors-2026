import React, { useState } from 'react';
import {
  UserPlus,
  CheckCircle2,
  ArrowRight,
  FolderKanban,
  UserCheck,
  Wallet,
  Sparkles,
  Lock,
  LogOut,
  TrendingUp,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';
import {
  Budget,
  EventConfig,
  Participant,
  Project,
  PublicTab,
  formatCurrency,
} from '../types';
import {
  checkParticipantSecretStatus,
  registerParticipant,
  SecretStatus,
  verifyAndClaimParticipantPin,
} from '../services/pitchService';
import { isValidStudentPin } from '../services/pinUtils';

interface RegistrationModuleProps {
  eventConfig: EventConfig;
  participants: Participant[];
  projects: Project[];
  currentParticipant: Participant | null;
  currentBudget: Budget | null;
  onSelectParticipant: (p: Participant) => void;
  onNavigate: (tab: PublicTab) => void;
}

export const RegistrationModule: React.FC<RegistrationModuleProps> = ({
  eventConfig,
  participants,
  projects,
  currentParticipant,
  currentBudget,
  onSelectParticipant,
  onNavigate,
}) => {
  const [accessMode, setAccessMode] = useState<'register' | 'recover'>('register');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectCategory, setProjectCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [recoverSearch, setRecoverSearch] = useState('');
  const [selectedRecoveryPart, setSelectedRecoveryPart] = useState<Participant | null>(null);
  const [recoveryPin, setRecoveryPin] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState<SecretStatus | null>(null);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const isRegistrationOpen = eventConfig.stage === 'registration';

  const myProject = projects.find(
    (p) =>
      p.id === currentParticipant?.projectId ||
      p.entrepreneurId === currentParticipant?.id
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!isValidStudentPin(pin)) {
      setErrorMsg('Tu PIN secreto debe tener exactamente 4 dígitos numéricos (ej. 4821).');
      return;
    }
    setLoading(true);
    try {
      const result = await registerParticipant({
        name,
        pin,
        projectName,
        projectCategory,
        existingParticipants: participants,
        existingProjects: projects,
        eventConfig,
      });
      onSelectParticipant(result.participant);
      setName('');
      setPin('');
      setProjectName('');
      setProjectCategory('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo completar el registro.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickRecoveryParticipant = async (p: Participant) => {
    setSelectedRecoveryPart(p);
    setRecoveryPin('');
    setRecoveryError('');
    setRecoveryStatus(null);
    const status = await checkParticipantSecretStatus(p.id);
    setRecoveryStatus(status);
  };

  const handleVerifyRecoveryPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecoveryPart || recoveryLoading) return;
    setRecoveryError('');
    if (!isValidStudentPin(recoveryPin)) {
      setRecoveryError('Ingresa un PIN válido de 4 dígitos numéricos.');
      return;
    }
    setRecoveryLoading(true);
    try {
      await verifyAndClaimParticipantPin(selectedRecoveryPart.id, recoveryPin);
      onSelectParticipant(selectedRecoveryPart);
      setSelectedRecoveryPart(null);
      setRecoveryPin('');
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : 'PIN incorrecto.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const filteredRecovery = participants.filter((p) =>
    p.name.toLowerCase().includes(recoverSearch.toLowerCase().trim()) ||
    p.projectName.toLowerCase().includes(recoverSearch.toLowerCase().trim())
  );

  const getStageLabel = () => {
    switch (eventConfig.stage) {
      case 'registration':
        return 'INSCRIPCIÓN ABIERTA';
      case 'closed_registration':
        return 'REGISTRO CERRADO · EN ESPERA';
      case 'roulette':
        return 'RULETA · SORTEO DE ORDEN';
      case 'presenting':
        return 'PRESENTACIONES EN VIVO';
      case 'paused':
        return 'EVENTO EN PAUSA';
      case 'finished':
        return 'EVENTO FINALIZADO';
      default:
        return 'ACTIVO';
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Encabezado Compacto */}
      <section className="nb-card bg-[#FFDC00] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-mono-data text-xs font-bold tracking-wider uppercase border-b-2 border-black pb-1 inline-block">
              {eventConfig.subtitle || 'SIMULACIÓN DE INVERSIÓN · GRADO 12'}
            </div>
            <h1 className="font-black-display text-3xl sm:text-4xl mt-2 tracking-tight">
              PITCH INVESTORS
            </h1>
            <p className="text-sm font-semibold text-black/85 max-w-2xl mt-1">
              Un solo registro, dos funciones integradas: presenta tu propio proyecto y recibe inversiones de tus compañeros, o invierte tu presupuesto virtual de $100.000 en los demás pitches.
            </p>
          </div>
          <div className="bg-black text-white px-4 py-2 border-3 border-black text-center shrink-0 self-start sm:self-auto">
            <div className="font-mono-data text-[10px] font-bold text-[#FFDC00]">ESTADO GLOBAL</div>
            <div className="font-mono-data text-xs font-bold mt-0.5">{getStageLabel()}</div>
          </div>
        </div>
      </section>

      {/* 2. Bloque Principal: Sesión Activa O Formulario Único */}
      {currentParticipant ? (
        <section className="nb-card-lg bg-white p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-3 border-black pb-4">
            <div className="flex items-center gap-3">
              <div className="bg-[#B8FF9F] border-2 border-black p-2">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="font-mono-data text-xs font-bold text-black/70">
                  ESTUDIANTE REGISTRADO · DOBLE FUNCIÓN
                </div>
                <h2 className="font-black-display text-2xl sm:text-3xl">
                  {currentParticipant.name}
                </h2>
              </div>
            </div>
            <span className="nb-sticker bg-[#FFDC00] px-3 py-1 text-xs font-bold">
              EMPRENDEDOR E INVERSOR
            </span>
          </div>

          {/* Proyecto Vinculado */}
          <div className="border-3 border-black bg-[#F4F4F0] p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-mono-data text-xs font-bold text-black/70">
                MI PROYECTO INSCRITO:
              </span>
              <div className="font-black-display text-xl sm:text-2xl mt-0.5">
                {currentParticipant.projectName || 'Sin nombre asignado'}
              </div>
            </div>
            <span
              className={`nb-sticker px-2.5 py-1 text-xs font-bold ${
                isRegistrationOpen ? 'bg-[#B8FF9F]' : 'bg-[#FFDC00]'
              }`}
            >
              {isRegistrationOpen
                ? 'REGISTRO ABIERTO (EDITABLE)'
                : 'REGISTRO CERRADO (LISTO PARA PITCH)'}
            </span>
          </div>

          {/* Dos Indicadores Independientes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Indicador 1: Mi Capital Disponible para Invertir en Otros */}
            <div className="border-3 border-black p-5 bg-[#B8FF9F]">
              <div className="font-mono-data text-xs font-bold text-black/70 flex items-center justify-between">
                <span>MI CAPITAL DISPONIBLE</span>
                <Wallet className="w-4 h-4" />
              </div>
              <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                {formatCurrency(currentBudget?.availableBudget ?? 100000)}
              </div>
              <div className="text-xs font-semibold text-black/80 mt-1">
                Para invertir en los proyectos de tus compañeros.
              </div>
            </div>

            {/* Indicador 2: Capital Recibido por Mi Proyecto */}
            <div className="border-3 border-black p-5 bg-[#90A8ED]">
              <div className="font-mono-data text-xs font-bold text-black/70 flex items-center justify-between">
                <span>CAPITAL RECIBIDO POR MI PROYECTO</span>
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                {formatCurrency(myProject?.totalInvested ?? 0)}
              </div>
              <div className="text-xs font-semibold text-black/80 mt-1">
                Aportado por {myProject?.investorCount ?? 0} inversores del curso.
              </div>
            </div>
          </div>

          {/* Acciones principales claras hacia los dos espacios */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap gap-3">
              {eventConfig.stage === 'presenting' ? (
                <button
                  onClick={() => onNavigate('presentaciones')}
                  className="nb-btn bg-[#B8FF9F] px-6 py-3 font-display font-bold text-sm flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>ENTRAR A LA RONDA EN VIVO</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : eventConfig.stage === 'finished' ? (
                <button
                  onClick={() => onNavigate('resultados')}
                  className="nb-btn bg-[#FFDC00] px-6 py-3 font-display font-bold text-sm flex items-center gap-2"
                >
                  <span>VER RESULTADOS OFICIALES TOP 05</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : null}

              <button
                onClick={() => onNavigate('proyectos')}
                className="nb-btn bg-black text-white px-6 py-3 font-display font-bold text-sm flex items-center gap-2"
              >
                <FolderKanban className="w-4 h-4" />
                <span>MI PROYECTO E INVERSIONES</span>
              </button>
            </div>

            <button
              onClick={() => onSelectParticipant({} as Participant)}
              className="text-xs font-mono-data font-bold text-black/70 hover:text-black underline underline-offset-4 flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cambiar de participante</span>
            </button>
          </div>
        </section>
      ) : (
        <section className="nb-card-lg bg-white p-6 sm:p-8 space-y-6">
          {/* Selector de modo: Registro Único vs Recuperación */}
          <div className="flex border-b-3 border-black gap-2 pb-3">
            <button
              type="button"
              onClick={() => setAccessMode('register')}
              className={`nb-btn px-4 py-2 font-display font-bold text-sm ${
                accessMode === 'register' ? 'bg-[#FFDC00]' : 'bg-[#F4F4F0]'
              }`}
            >
              <UserPlus className="w-4 h-4 inline mr-2" />
              REGISTRO DE ESTUDIANTE
            </button>
            <button
              type="button"
              onClick={() => setAccessMode('recover')}
              className={`nb-btn px-4 py-2 font-display font-bold text-sm ${
                accessMode === 'recover' ? 'bg-[#90A8ED]' : 'bg-[#F4F4F0]'
              }`}
            >
              <UserCheck className="w-4 h-4 inline mr-2" />
              RECUPERAR MI SESIÓN ({participants.length})
            </button>
          </div>

          {accessMode === 'register' ? (
            <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
              <div>
                <h2 className="font-display font-extrabold text-2xl">
                  FORMULARIO ÚNICO DE INSCRIPCIÓN
                </h2>
                <p className="text-xs font-semibold text-black/75 mt-1">
                  Ingresa tu nombre y los datos de tu proyecto. Automáticamente se creará tu proyecto para presentar y recibirás $100.000 virtuales para invertir en los demás.
                </p>
              </div>

              {!isRegistrationOpen && (
                <div className="bg-[#FF90E8] border-3 border-black p-4 font-bold text-xs flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>
                    El registro público se encuentra cerrado por el administrador. Si ya estás inscrito, pulsa en &quot;RECUPERAR MI SESIÓN&quot;.
                  </span>
                </div>
              )}

              {errorMsg && (
                <div className="bg-[#FFDC00] border-3 border-black p-4 font-bold text-xs">
                  {errorMsg}
                </div>
              )}

              {/* Nombre completo */}
              <div>
                <label className="block font-mono-data text-xs font-bold mb-1.5">
                  1. TU NOMBRE COMPLETO *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Valentina Morales"
                  maxLength={100}
                  disabled={!isRegistrationOpen || loading}
                  className="nb-input w-full px-4 py-3 text-base font-bold"
                  required
                />
              </div>

              {/* Nombre del Proyecto */}
              <div>
                <label className="block font-mono-data text-xs font-bold mb-1.5">
                  2. NOMBRE DE TU PROYECTO *
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Ej. ECO PRINT 3D"
                  maxLength={120}
                  disabled={!isRegistrationOpen || loading}
                  className="nb-input w-full px-4 py-3 text-base font-bold"
                  required
                />
              </div>

              {/* Descripción o propuesta */}
              <div>
                <label className="block font-mono-data text-xs font-bold mb-1.5">
                  3. DESCRIPCIÓN O PROPUESTA DEL PROYECTO *
                </label>
                <input
                  type="text"
                  value={projectCategory}
                  onChange={(e) => setProjectCategory(e.target.value)}
                  placeholder="Ej. Filamentos reciclados para impresión técnica de prototipos"
                  maxLength={160}
                  disabled={!isRegistrationOpen || loading}
                  className="nb-input w-full px-4 py-2.5 text-sm font-semibold"
                  required
                />
              </div>

              {/* PIN secreto personal */}
              <div className="border-2 border-black bg-[#F4F4F0] p-4 space-y-2">
                <label className="block font-mono-data text-xs font-bold">
                  4. CREA TU PIN SECRETO PERSONAL (4 DÍGITOS) *
                </label>
                <div className="flex items-center gap-2 max-w-xs">
                  <div className="relative flex-1">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      pattern="\d{4}"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Ej. 4821"
                      disabled={!isRegistrationOpen || loading}
                      className="nb-input w-full pl-9 pr-10 py-2.5 font-mono-data text-lg font-bold tracking-widest"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black/60 hover:text-black cursor-pointer"
                      title={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-black/75">
                  Protege tu perfil y tus $100.000 virtuales: nadie podrá entrar a tu cuenta ni invertir en tu nombre sin este PIN.
                </p>
              </div>

              {/* Badge explicativo de la asignación automática */}
              <div className="border-2 border-black bg-[#B8FF9F] p-3 text-xs font-mono-data font-bold">
                ✓ ASIGNACIÓN AUTOMÁTICA: Tu proyecto quedará inscrito para la rueda de pitches y se te habilitará tu presupuesto virtual personal de $100.000.
              </div>

              <button
                type="submit"
                disabled={!isRegistrationOpen || loading}
                className="nb-btn w-full bg-[#FFDC00] py-3.5 px-6 font-display font-extrabold text-base flex items-center justify-center gap-2"
              >
                <UserPlus className="w-5 h-5" />
                <span>{loading ? 'REGISTRANDO...' : 'CONFIRMAR REGISTRO EN EL EVENTO'}</span>
              </button>
            </form>
          ) : (
            <div className="space-y-4 max-w-2xl">
              <div>
                <h2 className="font-display font-extrabold text-2xl">
                  RECUPERAR SESIÓN DE ESTUDIANTE
                </h2>
                <p className="text-xs font-semibold text-black/75 mt-1">
                  Selecciona tu nombre e ingresa tu PIN secreto de 4 dígitos para retomar tu sesión y proteger tu cuenta.
                </p>
              </div>

              {selectedRecoveryPart ? (
                <form
                  onSubmit={handleVerifyRecoveryPin}
                  className="border-3 border-black bg-[#FFDC00]/30 p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-3">
                    <div>
                      <div className="font-mono-data text-[11px] font-bold text-black/70 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        <span>VERIFICACIÓN DE IDENTIDAD</span>
                      </div>
                      <h3 className="font-black-display text-xl mt-0.5">
                        {selectedRecoveryPart.name}
                      </h3>
                      <div className="font-mono-data text-xs text-black/75">
                        Proyecto: {selectedRecoveryPart.projectName || 'Sin proyecto'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRecoveryPart(null);
                        setRecoveryError('');
                      }}
                      className="nb-btn bg-white px-3 py-1 text-xs font-bold"
                    >
                      Cambiar
                    </button>
                  </div>

                  {recoveryStatus === 'unclaimed' && (
                    <div className="bg-[#B8FF9F] border-2 border-black p-3 text-xs font-bold">
                      Esta cuenta fue creada antes de activar los PINs. Define ahora tu PIN secreto de 4 dígitos para protegerla e ingresar.
                    </div>
                  )}

                  {recoveryError && (
                    <div className="bg-[#FF90E8] border-2 border-black p-3 text-xs font-bold">
                      {recoveryError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block font-mono-data text-xs font-bold">
                      {recoveryStatus === 'unclaimed'
                        ? 'CREA TU NUEVO PIN DE 4 DÍGITOS *'
                        : 'INGRESA TU PIN SECRETO DE 4 DÍGITOS *'}
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="\d{4}"
                      maxLength={4}
                      autoFocus
                      value={recoveryPin}
                      onChange={(e) =>
                        setRecoveryPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      placeholder="••••"
                      className="nb-input w-44 px-4 py-3 font-mono-data text-2xl font-bold tracking-widest bg-white"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={recoveryLoading || recoveryPin.length !== 4}
                    className="nb-btn w-full sm:w-auto bg-[#B8FF9F] px-6 py-3 font-display font-extrabold text-sm flex items-center justify-center gap-2 disabled:bg-[#F4F4F0] disabled:text-black/40"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>
                      {recoveryLoading
                        ? 'VERIFICANDO...'
                        : recoveryStatus === 'unclaimed'
                          ? 'ASIGNAR PIN Y ENTRAR'
                          : 'VERIFICAR PIN Y ENTRAR'}
                    </span>
                  </button>
                </form>
              ) : (
                <>
                  <input
                    type="text"
                    value={recoverSearch}
                    onChange={(e) => setRecoverSearch(e.target.value)}
                    placeholder="Buscar por estudiante o proyecto..."
                    className="nb-input w-full px-4 py-2.5 text-sm font-semibold"
                  />

                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1 border-2 border-black p-2 bg-[#F4F4F0]">
                    {filteredRecovery.length === 0 ? (
                      <div className="p-6 text-center text-xs font-mono-data font-bold text-black/70">
                        No hay estudiantes registrados con ese criterio.
                      </div>
                    ) : (
                      filteredRecovery.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handlePickRecoveryParticipant(p)}
                          className="w-full text-left p-3 border-2 border-black bg-white hover:bg-[#FFDC00] flex items-center justify-between gap-3 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-sm truncate">{p.name}</div>
                            <div className="font-mono-data text-[11px] text-black/70 truncate">
                              Proyecto: {p.projectName || 'Sin proyecto'}
                            </div>
                          </div>
                          <span className="nb-sticker bg-[#90A8ED] px-2.5 py-1 text-[11px] font-bold shrink-0 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>PIN</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* 3. Sección Secundaria: Indicadores Esenciales */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nb-card p-4 bg-white">
          <div className="font-mono-data text-[11px] font-bold text-black/70">
            PROYECTOS / ESTUDIANTES
          </div>
          <div className="font-mono-data font-bold text-2xl sm:text-3xl mt-1">
            {projects.length}
          </div>
          <div className="text-[11px] font-semibold text-black/60 mt-0.5">
            1 proyecto por estudiante
          </div>
        </div>

        <div className="nb-card p-4 bg-white">
          <div className="font-mono-data text-[11px] font-bold text-black/70">
            PRESUPUESTO POR INVERSOR
          </div>
          <div className="font-mono-data font-bold text-2xl sm:text-3xl mt-1">
            $100.000
          </div>
          <div className="text-[11px] font-semibold text-black/60 mt-0.5">
            Virtual e intransferible
          </div>
        </div>

        <div className="nb-card p-4 bg-white">
          <div className="font-mono-data text-[11px] font-bold text-black/70">
            DOBLE FUNCIÓN
          </div>
          <div className="font-display font-extrabold text-xl sm:text-2xl mt-1 text-[#000]">
            ACTIVA
          </div>
          <div className="text-[11px] font-semibold text-black/60 mt-0.5">
            Presenta e invierte
          </div>
        </div>

        <div className="nb-card p-4 bg-white">
          <div className="font-mono-data text-[11px] font-bold text-black/70">
            ESTADO REGISTRO
          </div>
          <div className="font-display font-extrabold text-xl sm:text-2xl mt-1">
            {isRegistrationOpen ? 'ABIERTO' : 'CERRADO'}
          </div>
          <div className="text-[11px] font-semibold text-black/60 mt-0.5">
            {isRegistrationOpen ? 'Inscripciones activas' : 'Ronda en marcha'}
          </div>
        </div>
      </section>
    </div>
  );
};
