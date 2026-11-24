export const CURRENT_EVENT_ID = 'grade12_pitch_2026';

export type EventStage =
  | 'registration'
  | 'closed_registration'
  | 'roulette'
  | 'presenting'
  | 'paused'
  | 'finished';

export type RegistrationMode = 'single' | 'dual';
export type VisibilityMode = 'admin_only' | 'private_totals' | 'public';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'ended';
export type ParticipantRole = 'entrepreneur' | 'investor';
export type ParticipantStatus = 'active' | 'suspended';
export type ProjectStatus = 'pending' | 'active' | 'presented';
export type InvestmentStatus = 'confirmed' | 'cancelled' | 'rejected';

export type ReactionType =
  | 'fire'
  | 'idea'
  | 'clap'
  | 'rocket'
  | 'heart'
  | 'target'
  | 'mindblown'
  | 'star';

export interface ReactionMeta {
  type: ReactionType;
  emoji: string;
  label: string;
  color: string;
  countField:
    | 'fireCount'
    | 'ideaCount'
    | 'clapCount'
    | 'rocketCount'
    | 'heartCount'
    | 'targetCount'
    | 'mindblownCount'
    | 'starCount';
}

export const REACTION_DEFINITIONS: ReactionMeta[] = [
  { type: 'fire', emoji: '🔥', label: 'Impactante', color: '#FFDC00', countField: 'fireCount' },
  { type: 'idea', emoji: '💡', label: 'Innovador', color: '#B8FF9F', countField: 'ideaCount' },
  { type: 'clap', emoji: '👏', label: 'Excelente', color: '#90A8ED', countField: 'clapCount' },
  { type: 'rocket', emoji: '🚀', label: 'Potencial', color: '#FF90E8', countField: 'rocketCount' },
  { type: 'heart', emoji: '❤️', label: 'Me gusta', color: '#FF90E8', countField: 'heartCount' },
  { type: 'target', emoji: '🎯', label: 'Viable', color: '#B8FF9F', countField: 'targetCount' },
  { type: 'mindblown', emoji: '🤯', label: 'Sorprendente', color: '#FFDC00', countField: 'mindblownCount' },
  { type: 'star', emoji: '⭐', label: 'Destacado', color: '#90A8ED', countField: 'starCount' },
];

export interface EventConfig {
  id: string;
  eventId: string;
  name: string;
  subtitle: string;
  stage: EventStage;
  registrationMode: RegistrationMode;
  visibilityMode: VisibilityMode;
  entrepreneurCanInvest: boolean;
  initialBudgetPerInvestor: number;
  activeProjectId: string;
  activePresentationId: string;
  activeRoundNumber: number;
  timerStatus: TimerStatus;
  timerDurationSec: number;
  timerEndsAtMs: number;
  timerRemainingSecWhenPaused: number;
  adminPin: string;
  lastNotification: string;
  updatedAt: string;
}

export interface Participant {
  id: string;
  eventId: string;
  name: string;
  normalizedName: string;
  role: ParticipantRole;
  projectId: string;
  projectName: string;
  status: ParticipantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  eventId: string;
  code: string;
  name: string;
  category: string;
  entrepreneurId: string;
  entrepreneurName: string;
  grade: string;
  status: ProjectStatus;
  presentationOrder: number;
  assignedDurationSec: number;
  totalInvested: number;
  investorCount: number;
  totalReactions: number;
  fireCount: number;
  ideaCount: number;
  clapCount: number;
  rocketCount: number;
  heartCount: number;
  targetCount: number;
  mindblownCount: number;
  starCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  eventId: string;
  investorId: string;
  investorName: string;
  initialBudget: number;
  availableBudget: number;
  investedBudget: number;
  investmentCount: number;
  updatedAt: string;
}

export interface Investment {
  id: string;
  eventId: string;
  investorId: string;
  investorName: string;
  projectId: string;
  projectName: string;
  amount: number;
  roundNumber: number;
  status: InvestmentStatus;
  previousCapital: number;
  remainingCapital: number;
  createdAt: string;
  timeFormatted: string;
}

export interface Reaction {
  id: string;
  eventId: string;
  participantId: string;
  participantName: string;
  projectId: string;
  projectName: string;
  reactionType: ReactionType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Presentation {
  id: string;
  eventId: string;
  projectId: string;
  projectName: string;
  entrepreneurName: string;
  roundNumber: number;
  assignedDurationSec: number;
  status: 'spinning' | 'active' | 'paused' | 'completed';
  startedAt: string;
  endedAt: string;
  createdAt: string;
}

export interface AdminLog {
  id: string;
  eventId: string;
  action: string;
  details: string;
  actor: string;
  createdAt: string;
}

export interface ParticipantSecret {
  id: string;
  eventId: string;
  pinHash: string;
  ownerUid: string;
  updatedAt: string;
}

export type PublicTab = 'registro' | 'proyectos' | 'presentaciones' | 'resultados' | 'admin';

export function formatCurrency(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('es-CO');
}

export function formatTimeMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
