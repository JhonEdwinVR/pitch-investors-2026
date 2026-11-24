import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Award, Users, TrendingUp, Wallet, History } from 'lucide-react';
import {
  Budget,
  EventConfig,
  Investment,
  Participant,
  Project,
  formatCurrency,
} from '../types';

interface ResultsModuleProps {
  eventConfig: EventConfig;
  projects: Project[];
  investments: Investment[];
  currentParticipant?: Participant | null;
  currentBudget?: Budget | null;
}

export const ResultsModule: React.FC<ResultsModuleProps> = ({
  eventConfig,
  projects,
  investments,
  currentParticipant,
  currentBudget,
}) => {
  const isFinished = eventConfig.stage === 'finished';
  const showCapitalToPublic = eventConfig.visibilityMode !== 'admin_only' || isFinished;

  useEffect(() => {
    if (isFinished) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFDC00', '#FF90E8', '#90A8ED', '#B8FF9F', '#000000'],
      });
    }
  }, [isFinished]);

  // Sort projects by totalInvested descending, tie-aware position calculation
  const sorted = [...projects].sort((a, b) => {
    if (b.totalInvested !== a.totalInvested) return b.totalInvested - a.totalInvested;
    return b.investorCount - a.investorCount;
  });

  // Compute tie-aware positions (e.g. 1, 1, 3, 4, 5)
  const rankedProjects = sorted.map((proj, idx) => {
    let position = 1;
    if (idx > 0) {
      const prev = sorted[idx - 1];
      if (prev.totalInvested === proj.totalInvested) {
        const firstIdx = sorted.findIndex((p) => p.totalInvested === proj.totalInvested);
        position = firstIdx + 1;
      } else {
        position = idx + 1;
      }
    }
    return { ...proj, position };
  });

  const top5 = rankedProjects.slice(0, 5);
  const confirmedInvestments = investments.filter((i) => i.status === 'confirmed');

  // Datos personales del estudiante
  const myProject = projects.find(
    (p) =>
      p.id === currentParticipant?.projectId ||
      p.entrepreneurId === currentParticipant?.id
  );
  const myInvestmentsInOthers = currentParticipant
    ? confirmedInvestments.filter((i) => i.investorId === currentParticipant.id)
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="nb-card-lg bg-[#FFDC00] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="font-mono-data text-xs font-bold">
            {isFinished ? 'RESULTADOS OFICIALES PUBLICADOS' : 'CLASIFICACIÓN PARCIAL EN TIEMPO REAL'}
          </div>
          <h1 className="font-black-display text-4xl sm:text-5xl mt-1">
            TOP 05 · PROYECTOS CON MAYOR INVERSIÓN
          </h1>
          <p className="text-sm font-semibold mt-1">
            {isFinished
              ? 'El mercado ha cerrado. Ranking definitivo basado en inversiones confirmadas en Firestore.'
              : 'Vista previa en tiempo real. La clasificación definitiva se publica al finalizar el evento.'}
          </p>
        </div>
        <div className="bg-black text-white p-4 border-3 border-black shrink-0 text-center">
          <Trophy className="w-8 h-8 mx-auto text-[#FFDC00]" />
          <div className="font-mono-data text-xs font-bold mt-1">
            {isFinished ? 'MERCADO CERRADO' : 'EN COMPETENCIA'}
          </div>
        </div>
      </section>

      {/* Balance Personal del Estudiante (si está identificado) */}
      {currentParticipant && (
        <section className="nb-card bg-white p-6 space-y-4">
          <div className="border-b-2 border-black pb-2 flex items-center justify-between">
            <h2 className="font-black-display text-xl sm:text-2xl">
              TU BALANCE EN EL MERCADO ({currentParticipant.name})
            </h2>
            <span className="nb-sticker bg-[#FFDC00] px-2.5 py-0.5 text-xs font-bold">
              DOBLE FUNCIÓN
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Función Emprendedor */}
            <div className="border-3 border-black p-4 bg-[#F4F4F0] space-y-2">
              <div className="font-mono-data text-xs font-bold text-black/70 flex items-center justify-between">
                <span>COMO EMPRENDEDOR (TU PROYECTO)</span>
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="font-black-display text-2xl truncate">
                {myProject?.name || currentParticipant.projectName || 'Sin proyecto'}
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="font-mono-data font-bold text-3xl">
                  {formatCurrency(myProject?.totalInvested ?? 0)}
                </span>
                <span className="text-xs font-semibold text-black/70">recibidos</span>
              </div>
              <div className="text-xs font-bold text-black/70">
                {myProject?.investorCount ?? 0} compañeros respaldaron tu proyecto
              </div>
            </div>

            {/* Función Inversor */}
            <div className="border-3 border-black p-4 bg-[#B8FF9F] space-y-2">
              <div className="font-mono-data text-xs font-bold text-black/70 flex items-center justify-between">
                <span>COMO INVERSOR (TUS APORTES)</span>
                <Wallet className="w-4 h-4" />
              </div>
              <div className="font-mono-data font-bold text-3xl">
                {formatCurrency(currentBudget?.investedBudget ?? 0)}
              </div>
              <div className="text-xs font-semibold text-black/80">
                Invertido en {myInvestmentsInOthers.length} proyectos ajenos (Saldo restante:{' '}
                {formatCurrency(currentBudget?.availableBudget ?? 0)})
              </div>
              {myInvestmentsInOthers.length > 0 && (
                <div className="text-xs font-mono-data font-bold pt-1 text-black/75 truncate">
                  Último aporte: {myInvestmentsInOthers[0]?.projectName} ({formatCurrency(myInvestmentsInOthers[0]?.amount)})
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Top 5 Cards */}
      {top5.length === 0 ? (
        <div className="nb-card bg-white p-8 text-center font-mono-data text-sm">
          Aún no hay proyectos registrados para calcular el ranking.
        </div>
      ) : (
        <section className="space-y-4">
          {top5.map((proj, idx) => {
            const isMine =
              Boolean(currentParticipant) &&
              (proj.id === currentParticipant?.projectId ||
                proj.entrepreneurId === currentParticipant?.id);

            const bgColors = ['bg-[#B8FF9F]', 'bg-[#90A8ED]', 'bg-[#FF90E8]', 'bg-white', 'bg-white'];
            const cardBg = bgColors[idx] || 'bg-white';

            return (
              <div
                key={proj.id}
                className={`nb-card-lg ${cardBg} p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 ${
                  isMine ? 'ring-4 ring-black' : ''
                }`}
              >
                <div className="flex items-start sm:items-center gap-5">
                  <div className="bg-black text-[#FFDC00] font-black-display text-3xl sm:text-4xl w-16 h-16 flex items-center justify-center border-3 border-black shrink-0">
                    {String(proj.position).padStart(2, '0')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono-data text-xs font-bold">{proj.code}</span>
                      <span className="font-mono-data text-xs font-bold text-black/60">· {proj.grade}</span>
                      {isMine && (
                        <span className="nb-sticker bg-black text-white px-2 py-0.2 text-[10px] font-bold">
                          TU PROYECTO
                        </span>
                      )}
                    </div>
                    <h2 className="font-black-display text-3xl sm:text-4xl leading-tight mt-1">
                      {proj.name}
                    </h2>
                    <p className="text-sm font-semibold text-black/80 mt-1 max-w-xl">
                      {proj.category}
                    </p>
                    <div className="font-mono-data text-xs font-bold mt-2 text-black/70">
                      EMPRENDEDOR: <strong className="text-black">{proj.entrepreneurName}</strong>
                    </div>
                  </div>
                </div>

                <div className="flex sm:items-center gap-4 flex-wrap self-end lg:self-center">
                  <div className="bg-white border-3 border-black p-4 text-right min-w-[180px]">
                    <div className="font-mono-data text-[10px] font-bold text-black/60">
                      CAPITAL ACUMULADO
                    </div>
                    <div className="font-mono-data font-bold text-2xl sm:text-3xl text-black">
                      {showCapitalToPublic ? formatCurrency(proj.totalInvested) : 'CONFIDENCIAL'}
                    </div>
                    <div className="text-xs font-mono-data font-bold text-black/70 mt-1">
                      {proj.investorCount} inversores · {proj.totalReactions} reacciones
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
};
