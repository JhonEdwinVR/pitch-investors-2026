import React from 'react';
import { ShieldCheck, Users, FolderKanban, Tv, Trophy, LogOut } from 'lucide-react';
import { EventConfig, Participant, PublicTab } from '../types';

interface NavbarProps {
  activeTab: PublicTab;
  setActiveTab: (tab: PublicTab) => void;
  currentParticipant: Participant | null;
  onLogoutParticipant: () => void;
  eventConfig: EventConfig;
  isProjectionMode: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentParticipant,
  onLogoutParticipant,
  eventConfig,
  isProjectionMode,
}) => {
  if (isProjectionMode) return null;

  const navItems: { id: PublicTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'registro', label: '01. Registro', icon: <Users className="w-4 h-4" /> },
    { id: 'proyectos', label: '02. Proyectos', icon: <FolderKanban className="w-4 h-4" /> },
    {
      id: 'presentaciones',
      label: '03. Presentaciones',
      icon: <Tv className="w-4 h-4" />,
      badge: eventConfig.stage === 'presenting' ? 'EN VIVO' : undefined,
    },
    { id: 'resultados', label: '04. Resultados', icon: <Trophy className="w-4 h-4" /> },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#F4F4F0] border-b-4 border-black">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          onClick={() => setActiveTab('registro')}
          className="font-display font-extrabold text-xl sm:text-2xl tracking-tight text-black whitespace-nowrap shrink-0 cursor-pointer text-left"
        >
          PITCHINVESTORS.
        </button>

        {/* Zone 2: 4 single-line Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`whitespace-nowrap shrink-0 font-bold text-sm px-2 py-1.5 transition-colors cursor-pointer border-b-3 flex items-center gap-1.5 ${
                  isActive
                    ? 'border-black text-black bg-[#FFDC00] px-3 border-2 shadow-[2px_2px_0px_#000]'
                    : 'border-transparent text-black/80 hover:text-black hover:border-black'
                }`}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span className="nb-sticker bg-[#FF90E8] px-1.5 py-0.2 text-[10px] font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action Button (Admin) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActiveTab('admin')}
            className={`nb-btn px-4 py-2 text-xs sm:text-sm font-display font-bold flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'admin' ? 'bg-[#FF90E8] text-black' : 'bg-black text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>ADMINISTRACIÓN</span>
          </button>
        </div>
      </div>

      {/* Mobile Nav Row */}
      <div className="lg:hidden border-t-2 border-black bg-white px-3 py-2 flex items-center gap-2 overflow-x-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`whitespace-nowrap shrink-0 text-xs font-bold px-3 py-1.5 border-2 border-black flex items-center gap-1.5 ${
                isActive ? 'bg-[#FFDC00] shadow-[2px_2px_0px_#000]' : 'bg-[#F4F4F0]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Participant Context Ribbon (below main bar) */}
      {currentParticipant && (
        <div className="border-t-2 border-black bg-[#B8FF9F] px-4 sm:px-6 py-1.5">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs font-mono-data font-bold">
            <div className="flex flex-wrap items-center gap-3">
              <span>SESIÓN: {currentParticipant.name.toUpperCase()}</span>
              <span aria-hidden="true">·</span>
              <span>EMPRENDEDOR E INVERSOR</span>
              {currentParticipant.projectName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>MI PROYECTO: {currentParticipant.projectName.toUpperCase()}</span>
                </>
              )}
              {currentParticipant.status === 'suspended' && (
                <span className="bg-[#FF90E8] border border-black px-2 py-0.5">
                  CUENTA SUSPENDIDA
                </span>
              )}
            </div>
            <button
              onClick={onLogoutParticipant}
              className="inline-flex items-center gap-1 underline hover:no-underline cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cambiar participante
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
