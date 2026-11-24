import React, { useState } from 'react';
import {
  Wallet,
  Search,
  ArrowRight,
  History,
  Lock,
  Edit3,
  Check,
  X,
  AlertCircle,
  Sparkles,
  TrendingUp,
  FolderKanban,
  Presentation,
  ShieldAlert,
} from 'lucide-react';
import {
  Budget,
  EventConfig,
  Investment,
  Participant,
  Project,
  PublicTab,
  formatCurrency,
} from '../types';
import { updateEntrepreneurProject } from '../services/pitchService';

interface ProjectsModuleProps {
  eventConfig: EventConfig;
  projects: Project[];
  allInvestments: Investment[];
  currentParticipant: Participant | null;
  currentBudget: Budget | null;
  myInvestments: Investment[];
  onNavigate: (tab: PublicTab) => void;
}

export const ProjectsModule: React.FC<ProjectsModuleProps> = ({
  eventConfig,
  projects,
  allInvestments,
  currentParticipant,
  currentBudget,
  myInvestments,
  onNavigate,
}) => {
  const [activeSpace, setActiveSpace] = useState<'my_project' | 'invest_others'>('my_project');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'presented'>('all');

  const isRegistrationOpen = eventConfig.stage === 'registration';

  // Identificar el proyecto propio del participante
  const myProject = projects.find(
    (p) =>
      p.id === currentParticipant?.projectId ||
      p.entrepreneurId === currentParticipant?.id
  );

  // Inversiones recibidas por el proyecto propio
  const receivedInvestments = allInvestments.filter(
    (inv) => inv.projectId === myProject?.id && inv.status === 'confirmed'
  );

  // Inversiones realizadas por el estudiante en otros proyectos
  const confirmedMyInvestments = myInvestments.filter((i) => i.status === 'confirmed');

  // Estado de edición de mi proyecto
  const [isEditingMyProject, setIsEditingMyProject] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

  const handleStartEdit = () => {
    if (!myProject) return;
    setEditName(myProject.name);
    setEditCategory(myProject.category);
    setEditError('');
    setEditSuccess('');
    setIsEditingMyProject(true);
  };

  const handleCancelEdit = () => {
    setIsEditingMyProject(false);
    setEditError('');
  };

  const handleSaveMyProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentParticipant || !myProject) return;
    setEditLoading(true);
    setEditError('');
    setEditSuccess('');

    try {
      await updateEntrepreneurProject({
        participant: currentParticipant,
        project: myProject,
        newName: editName,
        newCategory: editCategory,
        eventConfig,
      });
      setEditSuccess('¡Proyecto actualizado correctamente!');
      setIsEditingMyProject(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al actualizar el proyecto.');
    } finally {
      setEditLoading(false);
    }
  };

  const showCapitalToPublic = eventConfig.visibilityMode !== 'admin_only';

  const filteredProjects = projects
    .filter((proj) => {
      if (statusFilter !== 'all' && proj.status !== statusFilter) return false;
      const q = search.toLowerCase().trim();
      if (!q) return true;
      return (
        proj.name.toLowerCase().includes(q) ||
        proj.entrepreneurName.toLowerCase().includes(q) ||
        proj.category.toLowerCase().includes(q) ||
        proj.code.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const utilizedPercent =
    currentBudget && currentBudget.initialBudget > 0
      ? Math.round((currentBudget.investedBudget / currentBudget.initialBudget) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Selector de los Dos Espacios Centrales */}
      <div className="nb-card bg-white p-3 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveSpace('my_project')}
            className={`nb-btn px-4 py-2.5 font-display font-extrabold text-xs sm:text-sm flex items-center gap-2 ${
              activeSpace === 'my_project' ? 'bg-[#FF90E8]' : 'bg-[#F4F4F0]'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>ESPACIO A: MI PROYECTO</span>
            {myProject && (
              <span className="nb-sticker bg-white px-2 py-0.2 text-[10px]">
                {formatCurrency(myProject.totalInvested)} RECIBIDO
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSpace('invest_others')}
            className={`nb-btn px-4 py-2.5 font-display font-extrabold text-xs sm:text-sm flex items-center gap-2 ${
              activeSpace === 'invest_others' ? 'bg-[#B8FF9F]' : 'bg-[#F4F4F0]'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>ESPACIO B: INVERTIR EN OTROS</span>
            {currentBudget && (
              <span className="nb-sticker bg-white px-2 py-0.2 text-[10px]">
                {formatCurrency(currentBudget.availableBudget)} DISPONIBLE
              </span>
            )}
          </button>
        </div>

        {eventConfig.stage === 'presenting' && (
          <button
            onClick={() => onNavigate('presentaciones')}
            className="nb-btn bg-[#FFDC00] px-4 py-2 font-display font-bold text-xs flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>IR A RONDA EN VIVO</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ================================================================= */}
      {/* ESPACIO A: MI PROYECTO (FUNCIÓN DE EMPRENDEDOR)                  */}
      {/* ================================================================= */}
      {activeSpace === 'my_project' && (
        <div className="space-y-6">
          {!currentParticipant ? (
            <div className="nb-card p-8 bg-white text-center space-y-3">
              <h3 className="font-black-display text-2xl">IDENTIFÍCATE PARA ACCEDER A TU PROYECTO</h3>
              <p className="text-sm font-semibold text-black/75">
                Debes registrarte o seleccionar tu nombre en la pestaña de Registro para gestionar tu proyecto propio.
              </p>
              <button
                onClick={() => onNavigate('registro')}
                className="nb-btn bg-[#FFDC00] px-6 py-3 font-display font-bold text-sm"
              >
                IR AL REGISTRO
              </button>
            </div>
          ) : myProject ? (
            <section className="nb-card-lg bg-white p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b-3 border-black pb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#FF90E8] border-2 border-black p-2.5">
                    <FolderKanban className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-mono-data text-xs font-bold text-black/70">
                      MI ESPACIO PERSONAL DE EMPRENDEDOR
                    </div>
                    <h2 className="font-black-display text-2xl sm:text-3xl">
                      {myProject.name}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`nb-sticker px-3 py-1 text-xs font-bold ${
                      myProject.status === 'active'
                        ? 'bg-[#FFDC00]'
                        : myProject.status === 'presented'
                          ? 'bg-[#B8FF9F]'
                          : 'bg-[#F4F4F0]'
                    }`}
                  >
                    {myProject.status === 'active'
                      ? 'EN PRESENTACIÓN AHORA'
                      : myProject.status === 'presented'
                        ? `PRESENTADO · RONDA #${myProject.presentationOrder}`
                        : 'PENDIENTE DE PRESENTACIÓN'}
                  </span>
                  <span
                    className={`nb-sticker px-3 py-1 text-xs font-bold ${
                      isRegistrationOpen ? 'bg-[#B8FF9F]' : 'bg-[#FF90E8]'
                    }`}
                  >
                    {isRegistrationOpen ? 'EDICIÓN ABIERTA' : 'EDICIÓN BLOQUEADA'}
                  </span>
                </div>
              </div>

              {editSuccess && (
                <div className="bg-[#B8FF9F] border-3 border-black p-3 font-bold text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{editSuccess}</span>
                </div>
              )}

              {editError && (
                <div className="bg-[#FFDC00] border-3 border-black p-3 font-bold text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Formulario de Edición o Vista Principal */}
              {isEditingMyProject ? (
                <form onSubmit={handleSaveMyProject} className="space-y-4 max-w-xl border-2 border-black p-4 bg-[#F4F4F0]">
                  <div className="font-mono-data text-xs font-bold text-black/70">
                    EDITANDO INFORMACIÓN DE TU PROYECTO
                  </div>
                  <div>
                    <label className="block font-mono-data text-xs font-bold mb-1.5">
                      NOMBRE DEL PROYECTO *
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={120}
                      required
                      disabled={editLoading}
                      className="nb-input w-full px-4 py-2.5 text-base font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-mono-data text-xs font-bold mb-1.5">
                      CATEGORÍA O PROPUESTA *
                    </label>
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      maxLength={160}
                      required
                      disabled={editLoading}
                      className="nb-input w-full px-4 py-2 text-sm font-semibold"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={editLoading}
                      className="nb-btn bg-[#B8FF9F] px-5 py-2.5 font-display font-bold text-xs flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      <span>{editLoading ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={editLoading}
                      className="nb-btn bg-white px-4 py-2.5 font-display font-bold text-xs flex items-center gap-1.5"
                    >
                      <X className="w-4 h-4" />
                      <span>CANCELAR</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  {/* Ficha del Proyecto */}
                  <div className="border-3 border-black bg-[#F4F4F0] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-data font-bold border-b-2 border-black pb-2 mb-3">
                      <span>CÓDIGO: {myProject.code}</span>
                      <span>AUTOR: {currentParticipant.name} (TÚ)</span>
                    </div>
                    <p className="text-base font-semibold text-black/85">
                      {myProject.category}
                    </p>
                  </div>

                  {/* Tres Métricas Clave de Mi Proyecto */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="border-3 border-black p-4 bg-[#B8FF9F]">
                      <div className="font-mono-data text-xs font-bold text-black/70 flex items-center justify-between">
                        <span>CAPITAL TOTAL RECIBIDO</span>
                        <TrendingUp className="w-4 h-4" />
                      </div>
                      <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                        {formatCurrency(myProject.totalInvested)}
                      </div>
                      <div className="text-xs font-semibold text-black/75 mt-1">
                        Aportes virtuales de compañeros
                      </div>
                    </div>

                    <div className="border-3 border-black p-4 bg-[#90A8ED]">
                      <div className="font-mono-data text-xs font-bold text-black/70">
                        INVERSORES QUE TE RESPALDAN
                      </div>
                      <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                        {myProject.investorCount}
                      </div>
                      <div className="text-xs font-semibold text-black/75 mt-1">
                        Estudiantes que confiaron en tu idea
                      </div>
                    </div>

                    <div className="border-3 border-black p-4 bg-[#FFDC00]">
                      <div className="font-mono-data text-xs font-bold text-black/70">
                        REACCIONES RECIBIDAS
                      </div>
                      <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                        {myProject.totalReactions}
                      </div>
                      <div className="text-xs font-semibold text-black/75 mt-1">
                        Interacciones en tiempo real
                      </div>
                    </div>
                  </div>

                  {/* Botones de acción de mi proyecto */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    {isRegistrationOpen ? (
                      <button
                        type="button"
                        onClick={handleStartEdit}
                        className="nb-btn bg-[#FFDC00] px-5 py-2.5 font-display font-bold text-xs flex items-center gap-2"
                      >
                        <Edit3 className="w-4 h-4" />
                        <span>MODIFICAR INFORMACIÓN DE MI PROYECTO</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-xs font-mono-data font-bold text-black/70">
                        <Lock className="w-4 h-4" />
                        <span>Edición cerrada: El proyecto está listo para la presentación.</span>
                      </div>
                    )}

                    {eventConfig.stage === 'presenting' && myProject.status === 'active' && (
                      <button
                        onClick={() => onNavigate('presentaciones')}
                        className="nb-btn bg-[#B8FF9F] px-6 py-3 font-display font-bold text-sm flex items-center gap-2"
                      >
                        <Presentation className="w-5 h-5" />
                        <span>¡TU PROYECTO ESTÁ EN VIVO AHORA! ENTRAR A DEFENDER</span>
                      </button>
                    )}
                  </div>

                  {/* Historial de Inversiones Recibidas */}
                  <div className="border-t-2 border-black pt-5">
                    <h4 className="font-mono-data text-xs font-bold mb-3 flex items-center gap-2">
                      <History className="w-4 h-4" />
                      <span>HISTORIAL DE INVERSIONES RECIBIDAS ({receivedInvestments.length})</span>
                    </h4>

                    {receivedInvestments.length === 0 ? (
                      <div className="border-2 border-dashed border-black p-4 bg-[#F4F4F0] text-center text-xs font-mono-data font-bold text-black/70">
                        Aún no has recibido inversiones. Tu proyecto recibirá aportes en cuanto comience tu presentación en vivo.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {receivedInvestments.map((inv) => (
                          <div
                            key={inv.id}
                            className="border-2 border-black bg-[#F4F4F0] p-3 flex items-center justify-between font-mono-data"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate">{inv.investorName}</div>
                              <div className="text-[11px] text-black/70">
                                Ronda #{inv.roundNumber} · {inv.timeFormatted}
                              </div>
                            </div>
                            <div className="font-bold text-sm bg-[#B8FF9F] border border-black px-2 py-0.5 shrink-0">
                              +{formatCurrency(inv.amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <div className="nb-card p-6 bg-white text-center font-mono-data text-sm font-bold">
              No tienes un proyecto vinculado todavía. Completa el registro para crear tu proyecto.
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* ESPACIO B: INVERTIR EN OTROS PROYECTOS (FUNCIÓN DE INVERSOR)      */}
      {/* ================================================================= */}
      {activeSpace === 'invest_others' && (
        <div className="space-y-6">
          {/* Panel de Presupuesto del Inversor */}
          {currentBudget && (
            <section className="nb-card bg-white p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="bg-[#FFDC00] border-2 border-black p-2">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-mono-data text-[11px] font-bold text-black/70">
                      MI PRESUPUESTO PERSONAL DE INVERSIÓN
                    </div>
                    <h3 className="font-display font-extrabold text-xl">
                      CAPITAL DISPONIBLE PARA INVERTIR EN OTROS
                    </h3>
                  </div>
                </div>
                <div className="font-mono-data text-xs font-bold text-black/70">
                  REGLA: NO PUEDES INVERTIR EN TU PROPIO PROYECTO
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="border-3 border-black p-4 bg-[#B8FF9F]">
                  <div className="font-mono-data text-xs font-bold text-black/70">
                    DISPONIBLE PARA INVERTIR
                  </div>
                  <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                    {formatCurrency(currentBudget.availableBudget)}
                  </div>
                  <div className="text-xs font-semibold text-black/75 mt-0.5">
                    {100 - utilizedPercent}% de tu capital virtual
                  </div>
                </div>

                <div className="border-3 border-black p-4 bg-[#90A8ED]">
                  <div className="font-mono-data text-xs font-bold text-black/70">
                    TOTAL INVERTIDO EN OTROS
                  </div>
                  <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                    {formatCurrency(currentBudget.investedBudget)}
                  </div>
                  <div className="text-xs font-semibold text-black/75 mt-0.5">
                    {currentBudget.investmentCount} aportes confirmados
                  </div>
                </div>

                <div className="border-3 border-black p-4 bg-[#F4F4F0]">
                  <div className="font-mono-data text-xs font-bold text-black/70">
                    PRESUPUESTO TOTAL ASIGNADO
                  </div>
                  <div className="font-mono-data font-bold text-3xl sm:text-4xl mt-1">
                    {formatCurrency(currentBudget.initialBudget)}
                  </div>
                  <div className="text-xs font-semibold text-black/75 mt-0.5">
                    Fijo e intransferible
                  </div>
                </div>
              </div>

              {/* Historial de Inversiones Realizadas por Mí */}
              {confirmedMyInvestments.length > 0 && (
                <div className="border-t-2 border-black pt-4">
                  <div className="font-mono-data text-xs font-bold mb-2 flex items-center gap-2">
                    <History className="w-4 h-4" />
                    <span>MIS INVERSIONES EN PROYECTOS DE COMPAÑEROS ({confirmedMyInvestments.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {confirmedMyInvestments.map((inv) => (
                      <div
                        key={inv.id}
                        className="border-2 border-black bg-[#F4F4F0] p-2.5 flex items-center justify-between text-xs font-mono-data"
                      >
                        <div className="min-w-0">
                          <div className="font-bold truncate">{inv.projectName}</div>
                          <div className="text-[11px] text-black/70">
                            Ronda #{inv.roundNumber} · {inv.timeFormatted}
                          </div>
                        </div>
                        <div className="font-bold text-sm bg-[#B8FF9F] border border-black px-2 py-0.5 shrink-0">
                          {formatCurrency(inv.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Catálogo de Todos los Proyectos */}
          <section className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div className="font-mono-data text-xs font-bold text-black/70">
                  PORTAFOLIO DEL CURSO
                </div>
                <h3 className="font-black-display text-2xl sm:text-3xl">
                  PROYECTOS PARA INVERTIR ({projects.length})
                </h3>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por proyecto o autor..."
                    className="nb-input pl-9 pr-4 py-2 text-sm font-semibold w-full sm:w-64"
                  />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'pending', label: 'Por presentar' },
                      { id: 'active', label: 'En vivo' },
                      { id: 'presented', label: 'Ya presentados' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setStatusFilter(tab.id)}
                      className={`nb-btn px-3 py-1.5 text-xs font-mono-data font-bold whitespace-nowrap ${
                        statusFilter === tab.id ? 'bg-[#FFDC00]' : 'bg-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Grid de Proyectos */}
            {filteredProjects.length === 0 ? (
              <div className="nb-card p-8 text-center bg-white">
                <div className="font-display font-bold text-lg mb-1">
                  No hay proyectos que coincidan con la búsqueda
                </div>
                <p className="text-xs text-black/70">
                  Prueba cambiando los filtros o el texto de búsqueda.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((proj) => {
                  const isMine =
                    Boolean(currentParticipant) &&
                    (proj.id === currentParticipant?.projectId ||
                      proj.entrepreneurId === currentParticipant?.id);

                  const statusBadge =
                    proj.status === 'active'
                      ? { label: 'EN PRESENTACIÓN AHORA', bg: 'bg-[#FFDC00]' }
                      : proj.status === 'presented'
                        ? { label: `PRESENTADO · RONDA #${proj.presentationOrder}`, bg: 'bg-[#B8FF9F]' }
                        : { label: 'PENDIENTE', bg: 'bg-[#F4F4F0]' };

                  return (
                    <article
                      key={proj.id}
                      className={`nb-card p-5 bg-white flex flex-col justify-between gap-4 ${
                        isMine ? 'ring-4 ring-[#FF90E8]' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between font-mono-data text-xs font-bold border-b-2 border-black pb-2 mb-2.5">
                          <span>{proj.code}</span>
                          {isMine ? (
                            <span className="nb-sticker bg-[#FF90E8] px-2 py-0.5 text-[10px] font-bold">
                              TU PROYECTO
                            </span>
                          ) : (
                            <span>{proj.grade}</span>
                          )}
                        </div>

                        <h4 className="font-black-display text-xl sm:text-2xl tracking-tight leading-tight">
                          {proj.name}
                        </h4>
                        <p className="text-xs font-medium text-black/80 mt-1.5 line-clamp-2">
                          {proj.category}
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="border-t-2 border-black pt-2 flex items-center justify-between text-xs">
                          <span className="font-mono-data text-[11px] font-bold text-black/65">
                            AUTOR:
                          </span>
                          <span className="font-bold">{proj.entrepreneurName}</span>
                        </div>

                        <div className="bg-[#F4F4F0] border-2 border-black p-2.5 flex items-center justify-between">
                          <div>
                            <div className="font-mono-data text-[10px] font-bold text-black/65">
                              CAPITAL RECIBIDO
                            </div>
                            <div className="font-mono-data font-bold text-lg">
                              {showCapitalToPublic
                                ? formatCurrency(proj.totalInvested)
                                : 'CONFIDENCIAL'}
                            </div>
                          </div>
                          <div className="text-right font-mono-data text-[11px] font-bold">
                            <div>{proj.investorCount} inv.</div>
                            <div>{proj.totalReactions} reac.</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span
                            className={`nb-sticker ${statusBadge.bg} px-2 py-0.5 text-[10px] font-bold`}
                          >
                            {statusBadge.label}
                          </span>

                          {isMine ? (
                            <span className="text-[10px] font-mono-data font-bold text-black/60 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" />
                              <span>No invertible</span>
                            </span>
                          ) : proj.status === 'active' ? (
                            <button
                              onClick={() => onNavigate('presentaciones')}
                              className="nb-btn bg-[#B8FF9F] px-3 py-1 text-xs font-display font-bold flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>INVERTIR</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
