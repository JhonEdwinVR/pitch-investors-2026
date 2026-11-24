import React, { useEffect, useState } from 'react';
import { Play, RotateCw, Clock, Sparkles, Hand, Plus, X, Settings2, RotateCcw } from 'lucide-react';
import { EventConfig, Project } from '../types';
import { startPresentationRound } from '../services/pitchService';

interface RouletteWheelProps {
  projects: Project[];
  eventConfig: EventConfig;
  isAdminMode?: boolean;
  onRequireAdmin?: () => void;
}

interface RouletteTimeOption {
  label: string;
  shortLabel: string;
  seconds: number;
  color: string;
}

const WHEEL_COLORS = ['#FFDC00', '#FF90E8', '#90A8ED', '#B8FF9F', '#FFFFFF'];
const TIME_WHEEL_COLORS = ['#FFDC00', '#90A8ED', '#FF90E8', '#B8FF9F'];
const DEFAULT_TIME_SECONDS = [120, 180, 240];
const PRESET_TIME_SECONDS = [60, 90, 120, 150, 180, 240, 300, 420, 600];
const ROULETTE_TIMES_STORAGE_KEY = 'pitch_investors_roulette_times_v1';

function formatShortTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function buildTimeOption(seconds: number, idx: number): RouletteTimeOption {
  const shortLabel = formatShortTime(seconds);
  return {
    shortLabel,
    label: `${shortLabel} MINUTOS`,
    seconds,
    color: TIME_WHEEL_COLORS[idx % TIME_WHEEL_COLORS.length],
  };
}

function loadSavedTimeSeconds(): number[] {
  try {
    const raw = localStorage.getItem(ROULETTE_TIMES_STORAGE_KEY);
    if (!raw) return DEFAULT_TIME_SECONDS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_TIME_SECONDS;
    const valid = Array.from(
      new Set(
        parsed
          .map((n) => Math.round(Number(n)))
          .filter((n) => Number.isFinite(n) && n >= 60 && n <= 600)
      )
    ).sort((a, b) => a - b);
    return valid.length > 0 ? valid : DEFAULT_TIME_SECONDS;
  } catch {
    return DEFAULT_TIME_SECONDS;
  }
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export const RouletteWheel: React.FC<RouletteWheelProps> = ({
  projects,
  eventConfig,
  isAdminMode = false,
  onRequireAdmin,
}) => {
  const pendingProjects = projects.filter((p) => p.status === 'pending');

  const [timeSecondsList, setTimeSecondsList] = useState<number[]>(loadSavedTimeSeconds);
  const [showTimeEditor, setShowTimeEditor] = useState(false);
  const [customMinInput, setCustomMinInput] = useState('2');
  const [customSecInput, setCustomSecInput] = useState('30');
  const [timeEditorError, setTimeEditorError] = useState('');

  const timeOptions: RouletteTimeOption[] = timeSecondsList.map((sec, idx) =>
    buildTimeOption(sec, idx)
  );

  const [isSpinning, setIsSpinning] = useState(false);
  const [projAngle, setProjAngle] = useState(0);
  const [timeAngle, setTimeAngle] = useState(0);
  const [selectedProj, setSelectedProj] = useState<Project | null>(null);
  const [selectedTime, setSelectedTime] = useState<RouletteTimeOption | null>(null);
  const [manualProjectId, setManualProjectId] = useState('');
  const [manualDurationSec, setManualDurationSec] = useState<number>(() => timeSecondsList[0] || 180);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(ROULETTE_TIMES_STORAGE_KEY, JSON.stringify(timeSecondsList));
    } catch {
      // Ignore storage errors in restricted browsing modes
    }
    if (!timeSecondsList.includes(manualDurationSec)) {
      setManualDurationSec(timeSecondsList[0] || 180);
    }
  }, [timeSecondsList, manualDurationSec]);

  const handleTogglePresetTime = (sec: number) => {
    setTimeEditorError('');
    if (timeSecondsList.includes(sec)) {
      if (timeSecondsList.length <= 1) {
        setTimeEditorError('Debe haber al menos 1 tiempo activo en la ruleta.');
        return;
      }
      setTimeSecondsList((prev) => prev.filter((s) => s !== sec));
    } else {
      setTimeSecondsList((prev) => [...prev, sec].sort((a, b) => a - b));
    }
    setSelectedTime(null);
  };

  const handleAddCustomTime = (e: React.FormEvent) => {
    e.preventDefault();
    setTimeEditorError('');
    const mins = Math.max(0, parseInt(customMinInput, 10) || 0);
    const secs = Math.max(0, parseInt(customSecInput, 10) || 0);
    if (secs >= 60) {
      setTimeEditorError('Los segundos deben estar entre 0 y 59.');
      return;
    }
    const total = mins * 60 + secs;
    if (total < 60 || total > 600) {
      setTimeEditorError('El tiempo debe estar entre 1:00 min (60s) y 10:00 min (600s).');
      return;
    }
    if (timeSecondsList.includes(total)) {
      setTimeEditorError(`El tiempo ${formatShortTime(total)} ya está agregado en la ruleta.`);
      return;
    }
    setTimeSecondsList((prev) => [...prev, total].sort((a, b) => a - b));
    setSelectedTime(null);
  };

  const handleResetDefaultTimes = () => {
    setTimeEditorError('');
    setTimeSecondsList(DEFAULT_TIME_SECONDS);
    setSelectedTime(null);
  };

  const handleSpinBoth = () => {
    if (pendingProjects.length === 0 || timeOptions.length === 0 || isSpinning) return;
    setErrorMsg('');
    setIsSpinning(true);
    setSelectedProj(null);
    setSelectedTime(null);

    const projIndex = Math.floor(Math.random() * pendingProjects.length);
    const chosenProj = pendingProjects[projIndex];

    const timeIndex = Math.floor(Math.random() * timeOptions.length);
    const chosenTime = timeOptions[timeIndex];

    // Calculate target rotation so chosen slice lands under top pointer (0 deg)
    const sliceDegProj = 360 / pendingProjects.length;
    const centerAngleProj = projIndex * sliceDegProj + sliceDegProj / 2;
    const targetModProj = (360 - centerAngleProj) % 360;
    const nextProjAngle =
      projAngle + 1440 + ((targetModProj - (projAngle % 360) + 360) % 360);

    const sliceDegTime = 360 / timeOptions.length;
    const centerAngleTime = timeIndex * sliceDegTime + sliceDegTime / 2;
    const targetModTime = (360 - centerAngleTime) % 360;
    const nextTimeAngle =
      timeAngle + 1800 + ((targetModTime - (timeAngle % 360) + 360) % 360);

    setProjAngle(nextProjAngle);
    setTimeAngle(nextTimeAngle);

    setTimeout(() => {
      setSelectedProj(chosenProj);
      setSelectedTime(chosenTime);
      setIsSpinning(false);
    }, 3400);
  };

  const minTimeLabel = formatShortTime(timeSecondsList[0] || 120);
  const maxTimeLabel = formatShortTime(timeSecondsList[timeSecondsList.length - 1] || 240);
  const rangeBadgeLabel =
    timeSecondsList.length === 1 ? `${minTimeLabel} MIN` : `${minTimeLabel} – ${maxTimeLabel} MIN`;

  const handleConfirmRound = async () => {
    if (!selectedProj || !selectedTime) return;
    setErrorMsg('');
    try {
      await startPresentationRound(
        selectedProj,
        selectedTime.seconds,
        projects,
        eventConfig
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al iniciar la ronda.');
    }
  };

  const handleManualStart = async () => {
    const target = pendingProjects.find((p) => p.id === manualProjectId);
    if (!target) return;
    setErrorMsg('');
    try {
      await startPresentationRound(target, manualDurationSec, projects, eventConfig);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al iniciar ronda manual.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="nb-card-lg bg-[#FFDC00] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-mono-data text-xs font-bold">
              MÓDULO 04 · SELECCIÓN ALEATORIA SIN REPETICIÓN
            </div>
            <h2 className="font-black-display text-2xl sm:text-3xl">
              RULETA DE PROYECTOS Y TIEMPO
            </h2>
            <p className="text-sm font-semibold mt-1">
              Proyectos pendientes en ruleta: {pendingProjects.length} de {projects.length}
            </p>
          </div>
          {isAdminMode ? (
            <div className="flex flex-wrap gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowTimeEditor(!showTimeEditor)}
                className={`nb-btn px-4 py-4 font-display font-extrabold text-xs sm:text-sm flex items-center gap-2 ${
                  showTimeEditor ? 'bg-black text-white' : 'bg-white'
                }`}
              >
                <Settings2 className="w-4 h-4" />
                <span>TIEMPOS ({timeOptions.length})</span>
              </button>
              <button
                onClick={handleSpinBoth}
                disabled={isSpinning || pendingProjects.length === 0}
                className="nb-btn bg-[#B8FF9F] px-6 py-4 font-display font-extrabold text-sm sm:text-base flex items-center gap-2"
              >
                <RotateCw className={`w-5 h-5 ${isSpinning ? 'animate-spin' : ''}`} />
                <span>{isSpinning ? 'GIRANDO RULETAS...' : 'GIRAR AMBAS RULETAS'}</span>
              </button>
            </div>
          ) : (
            onRequireAdmin && (
              <button
                onClick={onRequireAdmin}
                className="nb-btn bg-black text-white px-5 py-3 font-display font-bold text-xs shrink-0"
              >
                SOLO ADMINISTRADOR PUEDE GIRAR (IR A ADMIN)
              </button>
            )
          )}
        </div>
      </div>

      {/* Configurador de Tiempos de Ruleta B (Solo Admin) */}
      {isAdminMode && showTimeEditor && (
        <section className="nb-card bg-white p-5 sm:p-6 space-y-5 border-4 border-black">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3">
            <div>
              <div className="font-mono-data text-xs font-bold text-black/70">
                CONFIGURACIÓN DE RULETA B
              </div>
              <h3 className="font-display font-extrabold text-lg sm:text-xl">
                ESCOGE O AGREGA LOS TIEMPOS DE PRESENTACIÓN
              </h3>
            </div>
            <button
              type="button"
              onClick={handleResetDefaultTimes}
              className="nb-btn bg-[#F4F4F0] px-3 py-1.5 text-xs font-mono-data font-bold flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar (2, 3, 4 min)</span>
            </button>
          </div>

          {timeEditorError && (
            <div className="bg-[#FF90E8] border-2 border-black p-3 text-xs font-bold">
              {timeEditorError}
            </div>
          )}

          {/* Presets rápidos con 1 clic */}
          <div className="space-y-2">
            <div className="font-mono-data text-xs font-bold text-black/80">
              1. ACTIVA O DESACTIVA TIEMPOS PREDEFINIDOS:
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_TIME_SECONDS.map((sec) => {
                const isActive = timeSecondsList.includes(sec);
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => handleTogglePresetTime(sec)}
                    className={`nb-btn px-3 py-2 font-mono-data text-xs font-bold ${
                      isActive ? 'bg-[#B8FF9F]' : 'bg-[#F4F4F0] text-black/60'
                    }`}
                  >
                    {isActive ? '✓ ' : '+ '}
                    {formatShortTime(sec)} min
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agregar cualquier tiempo personalizado */}
          <form
            onSubmit={handleAddCustomTime}
            className="border-t-2 border-black pt-4 flex flex-col sm:flex-row sm:items-end gap-3"
          >
            <div className="flex-1 space-y-1.5">
              <label className="block font-mono-data text-xs font-bold text-black/80">
                2. O AGREGA UN TIEMPO PERSONALIZADO (ENTRE 1:00 Y 10:00 MIN):
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={customMinInput}
                    onChange={(e) => setCustomMinInput(e.target.value)}
                    className="nb-input w-20 px-3 py-2 font-mono-data font-bold text-sm bg-white"
                  />
                  <span className="font-mono-data text-xs font-bold">min</span>
                </div>
                <span className="font-black-display text-lg">:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={customSecInput}
                    onChange={(e) => setCustomSecInput(e.target.value)}
                    className="nb-input w-20 px-3 py-2 font-mono-data font-bold text-sm bg-white"
                  />
                  <span className="font-mono-data text-xs font-bold">seg</span>
                </div>
                <button
                  type="submit"
                  className="nb-btn bg-[#FFDC00] px-4 py-2 font-display font-bold text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>AGREGAR A RULETA</span>
                </button>
              </div>
            </div>
          </form>

          {/* Tiempos activos actualmente en Ruleta B */}
          <div className="border-t-2 border-black pt-3 space-y-2">
            <div className="font-mono-data text-xs font-bold text-black/75">
              TIEMPOS ACTIVOS EN LA RULETA ({timeOptions.length}):
            </div>
            <div className="flex flex-wrap gap-2">
              {timeOptions.map((opt) => (
                <span
                  key={opt.seconds}
                  style={{ backgroundColor: opt.color }}
                  className="border-2 border-black px-3 py-1 font-mono-data text-xs font-bold inline-flex items-center gap-2 shadow-[2px_2px_0px_#000]"
                >
                  <span>{opt.label}</span>
                  {timeOptions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleTogglePresetTime(opt.seconds)}
                      className="hover:bg-black hover:text-white p-0.5 cursor-pointer"
                      title={`Quitar ${opt.shortLabel}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {errorMsg && (
        <div className="nb-card bg-[#FF90E8] p-4 font-bold text-sm">{errorMsg}</div>
      )}

      {pendingProjects.length === 0 ? (
        <div className="nb-card bg-white p-10 text-center space-y-3">
          <div className="font-display font-extrabold text-2xl">
            ¡TODOS LOS PROYECTOS YA PRESENTARON!
          </div>
          <p className="text-sm font-medium text-black/80">
            No quedan proyectos pendientes en la ruleta. El administrador puede cerrar el evento y publicar el Ranking TOP 05.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Ruleta A: Proyectos */}
          <div className="nb-card bg-white p-6 flex flex-col items-center">
            <div className="w-full flex items-center justify-between border-b-2 border-black pb-3 mb-6">
              <div>
                <div className="font-mono-data text-xs font-bold">RULETA A</div>
                <h3 className="font-display font-extrabold text-xl">SELECCIÓN DEL PROYECTO</h3>
              </div>
              <span className="nb-sticker bg-[#FF90E8] px-2.5 py-1 text-xs">
                {pendingProjects.length} PENDIENTES
              </span>
            </div>

            <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center">
              {/* Top Pointer */}
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-t-[26px] border-t-black"
                aria-hidden="true"
              />
              <div
                className="w-full h-full rounded-full border-4 border-black shadow-[6px_6px_0px_#000] overflow-hidden bg-white"
                style={{
                  transform: `rotate(${projAngle}deg)`,
                  transition: isSpinning
                    ? 'transform 3.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    : 'none',
                }}
              >
                <svg viewBox="0 0 300 300" className="w-full h-full">
                  {pendingProjects.length === 1 ? (
                    <g>
                      <circle cx="150" cy="150" r="150" fill="#FFDC00" stroke="#000" strokeWidth="3" />
                      <text
                        x="150"
                        y="110"
                        textAnchor="middle"
                        className="font-bold text-sm fill-black"
                      >
                        {pendingProjects[0].name.slice(0, 18)}
                      </text>
                    </g>
                  ) : (
                    pendingProjects.map((proj, idx) => {
                      const slice = 360 / pendingProjects.length;
                      const start = idx * slice;
                      const end = start + slice;
                      const mid = start + slice / 2;
                      const fill = WHEEL_COLORS[idx % WHEEL_COLORS.length];
                      return (
                        <g key={proj.id}>
                          <path
                            d={describeSlice(150, 150, 150, start, end)}
                            fill={fill}
                            stroke="#000000"
                            strokeWidth="2.5"
                          />
                          <g transform={`rotate(${mid}, 150, 150)`}>
                            <text
                              x="150"
                              y="52"
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={pendingProjects.length > 8 ? '10' : '12'}
                              fontWeight="800"
                              fontFamily="Space Mono, monospace"
                            >
                              {proj.name.slice(0, 14)}
                            </text>
                          </g>
                        </g>
                      );
                    })
                  )}
                  <circle cx="150" cy="150" r="24" fill="#000000" />
                  <circle cx="150" cy="150" r="10" fill="#FFDC00" />
                </svg>
              </div>
            </div>

            {selectedProj && (
              <div className="mt-6 w-full bg-[#B8FF9F] border-3 border-black p-4 text-center">
                <div className="font-mono-data text-xs font-bold">PROYECTO SELECCIONADO</div>
                <div className="font-black-display text-2xl mt-1">{selectedProj.name}</div>
                <div className="text-sm font-bold">{selectedProj.entrepreneurName}</div>
              </div>
            )}
          </div>

          {/* Ruleta B: Tiempo */}
          <div className="nb-card bg-white p-6 flex flex-col items-center">
            <div className="w-full flex items-center justify-between border-b-2 border-black pb-3 mb-6">
              <div>
                <div className="font-mono-data text-xs font-bold">RULETA B</div>
                <h3 className="font-display font-extrabold text-xl">TIEMPO DE PRESENTACIÓN</h3>
              </div>
              <span className="nb-sticker bg-[#90A8ED] px-2.5 py-1 text-xs flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {rangeBadgeLabel}
              </span>
            </div>

            <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center">
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-t-[26px] border-t-black"
                aria-hidden="true"
              />
              <div
                className="w-full h-full rounded-full border-4 border-black shadow-[6px_6px_0px_#000] overflow-hidden bg-white"
                style={{
                  transform: `rotate(${timeAngle}deg)`,
                  transition: isSpinning
                    ? 'transform 3.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    : 'none',
                }}
              >
                <svg viewBox="0 0 300 300" className="w-full h-full">
                  {timeOptions.length === 1 ? (
                    <g>
                      <circle
                        cx="150"
                        cy="150"
                        r="150"
                        fill={timeOptions[0].color}
                        stroke="#000000"
                        strokeWidth="3"
                      />
                      <text
                        x="150"
                        y="92"
                        textAnchor="middle"
                        fill="#000000"
                        fontSize="24"
                        fontWeight="900"
                        fontFamily="Archivo Black, sans-serif"
                      >
                        {timeOptions[0].shortLabel}
                      </text>
                      <text
                        x="150"
                        y="114"
                        textAnchor="middle"
                        fill="#000000"
                        fontSize="12"
                        fontWeight="800"
                        fontFamily="Space Mono, monospace"
                      >
                        MINUTOS
                      </text>
                    </g>
                  ) : (
                    timeOptions.map((opt, idx) => {
                      const slice = 360 / timeOptions.length;
                      const start = idx * slice;
                      const end = start + slice;
                      const mid = start + slice / 2;
                      return (
                        <g key={opt.seconds}>
                          <path
                            d={describeSlice(150, 150, 150, start, end)}
                            fill={opt.color}
                            stroke="#000000"
                            strokeWidth="3"
                          />
                          <g transform={`rotate(${mid}, 150, 150)`}>
                            <text
                              x="150"
                              y="68"
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={timeOptions.length > 6 ? '14' : '18'}
                              fontWeight="900"
                              fontFamily="Archivo Black, sans-serif"
                            >
                              {opt.shortLabel}
                            </text>
                            <text
                              x="150"
                              y="88"
                              textAnchor="middle"
                              fill="#000000"
                              fontSize="10"
                              fontWeight="800"
                              fontFamily="Space Mono, monospace"
                            >
                              MINUTOS
                            </text>
                          </g>
                        </g>
                      );
                    })
                  )}
                  <circle cx="150" cy="150" r="24" fill="#000000" />
                  <circle cx="150" cy="150" r="10" fill="#B8FF9F" />
                </svg>
              </div>
            </div>

            {selectedTime && (
              <div className="mt-6 w-full bg-[#FFDC00] border-3 border-black p-4 text-center">
                <div className="font-mono-data text-xs font-bold">TIEMPO ASIGNADO</div>
                <div className="font-black-display text-2xl mt-1">{selectedTime.label}</div>
                <div className="text-xs font-bold">No modificable por los participantes</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Start Round CTA once both wheels finish */}
      {isAdminMode && selectedProj && selectedTime && !isSpinning && (
        <div className="nb-card-lg bg-[#B8FF9F] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="font-mono-data text-xs font-bold">AMBAS RULETAS HAN FINALIZADO</div>
            <div className="font-display font-extrabold text-xl">
              ¿Comenzar Ronda con {selectedProj.name} ({selectedTime.label})?
            </div>
          </div>
          <button
            onClick={handleConfirmRound}
            className="nb-btn bg-black text-white px-8 py-4 font-display font-extrabold text-base flex items-center gap-2 shrink-0"
          >
            <Play className="w-5 h-5" />
            <span>COMENZAR RONDA EN VIVO</span>
          </button>
        </div>
      )}

      {/* Admin Manual Selection Fallback */}
      {isAdminMode && pendingProjects.length > 0 && (
        <div className="nb-card bg-white p-5">
          <div className="font-mono-data text-xs font-bold mb-3 flex items-center gap-2">
            <Hand className="w-4 h-4" />
            SELECCIÓN MANUAL DE RESPALDO (SI HAY PROBLEMA CON LA RULETA)
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={manualProjectId}
              onChange={(e) => setManualProjectId(e.target.value)}
              className="nb-input px-3 py-2 text-sm font-bold flex-1"
            >
              <option value="">Selecciona un proyecto pendiente...</option>
              {pendingProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name} ({p.entrepreneurName})
                </option>
              ))}
            </select>
            <select
              value={manualDurationSec}
              onChange={(e) => setManualDurationSec(Number(e.target.value))}
              className="nb-input px-3 py-2 text-sm font-bold"
            >
              {timeOptions.map((opt) => (
                <option key={opt.seconds} value={opt.seconds}>
                  {opt.shortLabel} minutos ({opt.seconds}s)
                </option>
              ))}
            </select>
            <button
              onClick={handleManualStart}
              disabled={!manualProjectId}
              className="nb-btn bg-[#90A8ED] px-5 py-2 font-display font-bold text-sm flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>INICIAR MANUALMENTE</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
