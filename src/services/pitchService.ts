import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  ensureAnonymousAuth,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  CURRENT_EVENT_ID,
  EventConfig,
  Participant,
  ParticipantSecret,
  Project,
  Budget,
  Investment,
  Reaction,
  Presentation,
  AdminLog,
  ReactionType,
  REACTION_DEFINITIONS,
  formatCurrency,
} from '../types';
import { hashParticipantPin, isValidStudentPin } from './pinUtils';

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampStr(val: string, maxLen: number): string {
  return (val || '').trim().slice(0, maxLen);
}

function nowIso(): string {
  return new Date().toISOString();
}

function timeHHMMSS(): string {
  const d = new Date();
  return d.toTimeString().split(' ')[0].slice(0, 8);
}

export async function logAdminAction(action: string, details: string, actor = 'Administrador') {
  const logId = makeSafeId('log');
  const logDoc: AdminLog = {
    id: logId,
    eventId: CURRENT_EVENT_ID,
    action: clampStr(action, 100),
    details: clampStr(details, 300),
    actor: clampStr(actor, 100),
    createdAt: nowIso(),
  };
  try {
    await setDoc(doc(db, 'admin_logs', logId), logDoc);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `admin_logs/${logId}`);
  }
}

export async function ensureDefaultEvent(): Promise<EventConfig> {
  const eventRef = doc(db, 'events', CURRENT_EVENT_ID);
  try {
    const snap = await getDoc(eventRef);
    if (snap.exists()) {
      return snap.data() as EventConfig;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `events/${CURRENT_EVENT_ID}`);
  }

  const defaultConfig: EventConfig = {
    id: CURRENT_EVENT_ID,
    eventId: CURRENT_EVENT_ID,
    name: 'PITCH INVESTORS',
    subtitle: 'SIMULACIÓN DE INVERSIÓN · GRADO 12',
    stage: 'registration',
    registrationMode: 'single',
    visibilityMode: 'private_totals',
    entrepreneurCanInvest: true,
    initialBudgetPerInvestor: 100000,
    activeProjectId: '',
    activePresentationId: '',
    activeRoundNumber: 0,
    timerStatus: 'idle',
    timerDurationSec: 180,
    timerEndsAtMs: 0,
    timerRemainingSecWhenPaused: 180,
    adminPin: '1212',
    lastNotification: 'Evento inicializado y abierto para inscripciones de Grado 12.',
    updatedAt: nowIso(),
  };

  try {
    await setDoc(eventRef, defaultConfig);
    await seedDemoGrade12Data(false);
    return defaultConfig;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `events/${CURRENT_EVENT_ID}`);
  }
}

export async function updateEventConfig(
  partial: Partial<Omit<EventConfig, 'id' | 'eventId'>>,
  currentConfig: EventConfig,
  auditLabel?: string
): Promise<void> {
  const eventRef = doc(db, 'events', CURRENT_EVENT_ID);
  const updated: EventConfig = {
    ...currentConfig,
    ...partial,
    id: CURRENT_EVENT_ID,
    eventId: CURRENT_EVENT_ID,
    name: clampStr(partial.name ?? currentConfig.name, 120) || 'PITCH INVESTORS',
    subtitle: clampStr(partial.subtitle ?? currentConfig.subtitle, 200),
    activeProjectId: clampStr(partial.activeProjectId ?? currentConfig.activeProjectId, 64),
    activePresentationId: clampStr(
      partial.activePresentationId ?? currentConfig.activePresentationId,
      64
    ),
    adminPin: clampStr(partial.adminPin ?? currentConfig.adminPin, 32) || '1212',
    lastNotification: clampStr(
      partial.lastNotification ?? currentConfig.lastNotification,
      240
    ),
    updatedAt: nowIso(),
  };

  try {
    await setDoc(eventRef, updated);
    if (auditLabel) {
      await logAdminAction(auditLabel, JSON.stringify(partial).slice(0, 280));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `events/${CURRENT_EVENT_ID}`);
  }
}

export interface RegisterParticipantInput {
  name: string;
  pin: string;
  projectName?: string;
  projectCategory?: string;
  explicitRole?: 'entrepreneur' | 'investor';
  existingParticipants: Participant[];
  existingProjects: Project[];
  eventConfig: EventConfig;
  isAdminOverride?: boolean;
}

function throwFriendlyAuthOrRuleError(err: unknown, context: string): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('permission-denied')
  ) {
    throw new Error(
      `Permiso denegado en Firestore (${context}). Si acabas de activar la protección por PIN, asegúrate de publicar las nuevas reglas (firestore.rules) en Firebase Console.`
    );
  }
  throw err instanceof Error ? err : new Error(msg);
}

export async function registerParticipant(
  input: RegisterParticipantInput
): Promise<{ participant: Participant; project?: Project; budget?: Budget }> {
  const cleanName = clampStr(input.name, 100);
  if (!cleanName) {
    throw new Error('El nombre completo del estudiante es obligatorio.');
  }

  const cleanPin = (input.pin || '').trim();
  if (!isValidStudentPin(cleanPin)) {
    throw new Error('Debes crear un PIN secreto de exactamente 4 dígitos numéricos.');
  }

  if (input.eventConfig.stage !== 'registration' && !input.isAdminOverride) {
    throw new Error(
      'El registro de participantes está cerrado por el administrador.'
    );
  }

  const normalizedName = cleanName.toLowerCase().replace(/\s+/g, ' ').trim();
  const duplicate = input.existingParticipants.find(
    (p) => p.normalizedName === normalizedName
  );
  if (duplicate) {
    throw new Error(
      `Ya existe un participante registrado con el nombre "${duplicate.name}". Selecciona tu nombre en "Recuperar mi sesión" e ingresa tu PIN.`
    );
  }

  const cleanProjectName = clampStr(input.projectName || '', 120);
  if (!cleanProjectName) {
    throw new Error('Debes ingresar el nombre de tu proyecto para completar el registro.');
  }

  const duplicateProject = input.existingProjects.find(
    (proj) => proj.name.toLowerCase().trim() === cleanProjectName.toLowerCase().trim()
  );
  if (duplicateProject) {
    throw new Error(`El proyecto "${cleanProjectName}" ya se encuentra registrado por otro estudiante.`);
  }

  const authRes = await ensureAnonymousAuth();
  if (!authRes.uid) {
    throw new Error(
      'No se pudo iniciar la sesión segura del dispositivo. El administrador debe habilitar "Anonymous" en Firebase Console → Authentication → Sign-in method.'
    );
  }

  const ts = nowIso();
  const participantId = makeSafeId('part');
  const projectId = makeSafeId('proj');
  const pinHash = hashParticipantPin(participantId, cleanPin);

  // Cada estudiante tiene un único perfil con doble función (Emprendedor e Inversor)
  const participant: Participant = {
    id: participantId,
    eventId: CURRENT_EVENT_ID,
    name: cleanName,
    normalizedName,
    role: 'entrepreneur',
    projectId,
    projectName: cleanProjectName,
    status: 'active',
    createdAt: ts,
    updatedAt: ts,
  };

  // Credencial privada vinculada al UID del dispositivo actual y al hash del PIN
  const secretDoc: ParticipantSecret = {
    id: participantId,
    eventId: CURRENT_EVENT_ID,
    pinHash,
    ownerUid: authRes.uid,
    updatedAt: ts,
  };

  // Creación del proyecto propio vinculado
  const nextIndex = input.existingProjects.length + 1;
  const code = `PROYECTO ${String(nextIndex).padStart(3, '0')}`;
  const project: Project = {
    id: projectId,
    eventId: CURRENT_EVENT_ID,
    code,
    name: cleanProjectName,
    category: clampStr(
      input.projectCategory || 'Proyecto de Innovación e Impacto · Grado 12',
      160
    ),
    entrepreneurId: participantId,
    entrepreneurName: cleanName,
    grade: 'GRADO 12',
    status: 'pending',
    presentationOrder: 0,
    assignedDurationSec: 0,
    totalInvested: 0,
    investorCount: 0,
    totalReactions: 0,
    fireCount: 0,
    ideaCount: 0,
    clapCount: 0,
    rocketCount: 0,
    heartCount: 0,
    targetCount: 0,
    mindblownCount: 0,
    starCount: 0,
    createdAt: ts,
    updatedAt: ts,
  };

  // Asignación automática de $100.000 de capital virtual personal
  const initialBudget = input.eventConfig.initialBudgetPerInvestor || 100000;
  const budget: Budget = {
    id: participantId,
    eventId: CURRENT_EVENT_ID,
    investorId: participantId,
    investorName: cleanName,
    initialBudget,
    availableBudget: initialBudget,
    investedBudget: 0,
    investmentCount: 0,
    updatedAt: ts,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'participants', participantId), participant);
  batch.set(doc(db, 'participant_secrets', participantId), secretDoc);
  batch.set(doc(db, 'projects', projectId), project);
  batch.set(doc(db, 'budgets', participantId), budget);

  try {
    await batch.commit();
    return { participant, project, budget };
  } catch (err) {
    throwFriendlyAuthOrRuleError(err, `participant_secrets/${participantId}`);
  }
}

export type SecretStatus =
  | 'unclaimed'
  | 'owned_by_me'
  | 'locked_by_other'
  | 'auth_unavailable'
  | 'rules_not_deployed';

export async function checkParticipantSecretStatus(
  participantId: string
): Promise<SecretStatus> {
  const authRes = await ensureAnonymousAuth();
  if (!authRes.uid) return 'auth_unavailable';

  try {
    const snap = await getDoc(doc(db, 'participant_secrets', participantId));
    if (!snap.exists()) {
      return 'unclaimed';
    }
    const data = snap.data() as ParticipantSecret;
    if (data.ownerUid === authRes.uid) {
      return 'owned_by_me';
    }
    return 'locked_by_other';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
      return 'locked_by_other';
    }
    return 'rules_not_deployed';
  }
}

/**
 * Verifica el PIN de 4 dígitos contra Firestore Rules.
 * - Si la cuenta es heredada (sin documento en participant_secrets), crea la credencial con este PIN.
 * - Si ya pertenece a otro dispositivo/navegador, envía una actualización con pinHash y nuevo ownerUid;
 *   Firestore Rules solo permite la transferencia si incoming().pinHash == existing().pinHash.
 */
export async function verifyAndClaimParticipantPin(
  participantId: string,
  pin: string
): Promise<'verified' | 'claimed_new_pin'> {
  const cleanPin = (pin || '').trim();
  if (!isValidStudentPin(cleanPin)) {
    throw new Error('Ingresa un PIN válido de 4 dígitos numéricos.');
  }

  const authRes = await ensureAnonymousAuth();
  if (!authRes.uid) {
    throw new Error(
      'No se pudo autenticar este dispositivo. El administrador debe habilitar "Anonymous" en Firebase Console → Authentication → Sign-in method.'
    );
  }

  const computedHash = hashParticipantPin(participantId, cleanPin);
  const secretRef = doc(db, 'participant_secrets', participantId);
  const ts = nowIso();

  try {
    const snap = await getDoc(secretRef);
    if (!snap.exists()) {
      // Cuenta existente previa al sistema de PIN: el estudiante reclama su cuenta creando su PIN
      const newSecret: ParticipantSecret = {
        id: participantId,
        eventId: CURRENT_EVENT_ID,
        pinHash: computedHash,
        ownerUid: authRes.uid,
        updatedAt: ts,
      };
      await setDoc(secretRef, newSecret);
      return 'claimed_new_pin';
    }

    const existing = snap.data() as ParticipantSecret;
    if (existing.pinHash !== computedHash) {
      throw new Error('PIN incorrecto. Verifica tu código de 4 dígitos.');
    }

    if (existing.ownerUid !== authRes.uid) {
      await updateDoc(secretRef, {
        ownerUid: authRes.uid,
        updatedAt: ts,
      });
    }
    return 'verified';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('PIN incorrecto')) {
      throw err;
    }
    if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
      // getDoc fue bloqueado porque pertenece a otro ownerUid: intentamos reclamar probando el hash
      try {
        await updateDoc(secretRef, {
          pinHash: computedHash,
          ownerUid: authRes.uid,
          updatedAt: ts,
        });
        return 'verified';
      } catch (updateErr) {
        const updateMsg = updateErr instanceof Error ? updateErr.message : String(updateErr);
        if (
          updateMsg.includes('Missing or insufficient permissions') ||
          updateMsg.includes('permission-denied')
        ) {
          throw new Error(
            'PIN incorrecto (o reglas de Firebase aún no publicadas). Verifica tus 4 dígitos o solicita al docente restablecer tu PIN.'
          );
        }
        throw updateErr;
      }
    }
    throw err;
  }
}

/**
 * Valida en el arranque si el participante guardado en localStorage sigue siendo propiedad
 * del UID autenticado en este navegador. Evita que alguien edite localStorage manualmente.
 */
export async function verifyActiveSessionOnBoot(participantId: string): Promise<boolean> {
  if (!participantId) return false;
  const authRes = await ensureAnonymousAuth();
  if (!authRes.uid) return true; // Si aún no activan Auth en consola, no bloquea el arranque legado

  try {
    const snap = await getDoc(doc(db, 'participant_secrets', participantId));
    if (!snap.exists()) {
      // Cuenta legada sin PIN todavía: requiere reclamarla con PIN si no tiene dueño
      return false;
    }
    const data = snap.data() as ParticipantSecret;
    return data.ownerUid === authRes.uid;
  } catch {
    // PERMISSION_DENIED significa que ownerUid pertenece a otro dispositivo/UID
    return false;
  }
}

export async function adminResetParticipantPin(
  participant: Participant,
  newPin: string
): Promise<void> {
  const cleanPin = (newPin || '').trim();
  if (!isValidStudentPin(cleanPin)) {
    throw new Error('El nuevo PIN debe ser exactamente de 4 dígitos numéricos.');
  }

  const ts = nowIso();
  const secretDoc: ParticipantSecret = {
    id: participant.id,
    eventId: CURRENT_EVENT_ID,
    pinHash: hashParticipantPin(participant.id, cleanPin),
    ownerUid: '',
    updatedAt: ts,
  };

  try {
    await setDoc(doc(db, 'participant_secrets', participant.id), secretDoc);
    await logAdminAction(
      'Restablecer PIN de estudiante',
      `Se asignó un nuevo PIN de acceso a ${participant.name}.`
    );
  } catch (err) {
    throwFriendlyAuthOrRuleError(err, `participant_secrets/${participant.id}`);
  }
}

export async function assignBudgetsToAllInvestors(
  newBudgetAmount: number,
  participants: Participant[],
  existingBudgets: Budget[],
  eventConfig: EventConfig
): Promise<void> {
  const validAmount = Math.max(1000, Math.min(10000000, Math.round(newBudgetAmount)));
  const ts = nowIso();
  const batch = writeBatch(db);

  const eligibleParticipants = participants.filter(
    (p) => p.role === 'investor' || eventConfig.entrepreneurCanInvest
  );

  for (const part of eligibleParticipants) {
    const existing = existingBudgets.find((b) => b.investorId === part.id);
    const invested = existing ? existing.investedBudget : 0;
    const count = existing ? existing.investmentCount : 0;
    const available = Math.max(0, validAmount - invested);

    const budgetDoc: Budget = {
      id: part.id,
      eventId: CURRENT_EVENT_ID,
      investorId: part.id,
      investorName: part.name,
      initialBudget: validAmount,
      availableBudget: available,
      investedBudget: invested,
      investmentCount: count,
      updatedAt: ts,
    };
    batch.set(doc(db, 'budgets', part.id), budgetDoc);
  }

  const updatedEvent: EventConfig = {
    ...eventConfig,
    initialBudgetPerInvestor: validAmount,
    lastNotification: `Presupuesto de ${formatCurrency(validAmount)} asignado a ${eligibleParticipants.length} inversores.`,
    updatedAt: ts,
  };
  batch.set(doc(db, 'events', CURRENT_EVENT_ID), updatedEvent);

  try {
    await batch.commit();
    await logAdminAction(
      'Asignar presupuesto',
      `Capital por inversor configurado en ${formatCurrency(validAmount)} (${eligibleParticipants.length} inversores)`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'budgets');
  }
}

export async function startPresentationRound(
  selectedProject: Project,
  durationSec: number,
  allProjects: Project[],
  eventConfig: EventConfig
): Promise<void> {
  const ts = nowIso();
  const presentationId = makeSafeId('pres');
  const presentedCount = allProjects.filter((p) => p.status === 'presented').length;
  const roundNumber = presentedCount + 1;
  const endsAtMs = Date.now() + durationSec * 1000;

  const batch = writeBatch(db);

  // If another project was active, mark it presented
  for (const proj of allProjects) {
    if (proj.status === 'active' && proj.id !== selectedProject.id) {
      batch.set(doc(db, 'projects', proj.id), {
        ...proj,
        status: 'presented',
        updatedAt: ts,
      });
    }
  }

  const updatedProject: Project = {
    ...selectedProject,
    status: 'active',
    presentationOrder: roundNumber,
    assignedDurationSec: durationSec,
    updatedAt: ts,
  };
  batch.set(doc(db, 'projects', selectedProject.id), updatedProject);

  const presentationDoc: Presentation = {
    id: presentationId,
    eventId: CURRENT_EVENT_ID,
    projectId: selectedProject.id,
    projectName: selectedProject.name,
    entrepreneurName: selectedProject.entrepreneurName,
    roundNumber,
    assignedDurationSec: durationSec,
    status: 'active',
    startedAt: ts,
    endedAt: '',
    createdAt: ts,
  };
  batch.set(doc(db, 'presentations', presentationId), presentationDoc);

  const updatedEvent: EventConfig = {
    ...eventConfig,
    stage: 'presenting',
    activeProjectId: selectedProject.id,
    activePresentationId: presentationId,
    activeRoundNumber: roundNumber,
    timerStatus: 'running',
    timerDurationSec: durationSec,
    timerEndsAtMs: endsAtMs,
    timerRemainingSecWhenPaused: durationSec,
    lastNotification: `¡Ronda #${roundNumber} iniciada! Presentando: ${selectedProject.name} (${Math.round(durationSec / 60)}:00 min)`,
    updatedAt: ts,
  };
  batch.set(doc(db, 'events', CURRENT_EVENT_ID), updatedEvent);

  try {
    await batch.commit();
    await logAdminAction(
      'Iniciar presentación',
      `Ronda #${roundNumber}: ${selectedProject.name} por ${selectedProject.entrepreneurName} (${durationSec}s)`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `presentations/${presentationId}`);
  }
}

export async function pausePresentationTimer(eventConfig: EventConfig): Promise<void> {
  if (eventConfig.timerStatus !== 'running') return;
  const remainingSec = Math.max(
    0,
    Math.ceil((eventConfig.timerEndsAtMs - Date.now()) / 1000)
  );
  await updateEventConfig(
    {
      stage: 'paused',
      timerStatus: 'paused',
      timerRemainingSecWhenPaused: remainingSec,
      lastNotification: `Presentación en pausa (${remainingSec}s restantes). Inversiones detenidas temporalmente.`,
    },
    eventConfig,
    'Pausar presentación'
  );
}

export async function resumePresentationTimer(eventConfig: EventConfig): Promise<void> {
  if (eventConfig.timerStatus !== 'paused') return;
  const remainingSec = Math.max(5, eventConfig.timerRemainingSecWhenPaused || 60);
  const newEndsAtMs = Date.now() + remainingSec * 1000;
  await updateEventConfig(
    {
      stage: 'presenting',
      timerStatus: 'running',
      timerEndsAtMs: newEndsAtMs,
      lastNotification: 'Presentación reanudada. ¡Inversiones habilitadas!',
    },
    eventConfig,
    'Reanudar presentación'
  );
}

export async function extendPresentationTimer(
  eventConfig: EventConfig,
  seconds: number
): Promise<void> {
  const currentRemaining = Math.max(0, eventConfig.timerEndsAtMs ? Math.ceil((eventConfig.timerEndsAtMs - Date.now()) / 1000) : 0);
  const newEndsAtMs = Date.now() + (currentRemaining + seconds) * 1000;
  await updateEventConfig(
    {
      stage: 'presenting',
      timerStatus: 'running',
      timerDurationSec: (eventConfig.timerDurationSec || 0) + seconds,
      timerEndsAtMs: newEndsAtMs,
      lastNotification: `Tiempo de presentación extendido en +${seconds} segundos.`,
    },
    eventConfig,
    `Extender tiempo (+${seconds}s)`
  );
}

export async function finishCurrentPresentation(
  eventConfig: EventConfig,
  activeProject?: Project,
  activePresentation?: Presentation
): Promise<void> {
  const ts = nowIso();
  const batch = writeBatch(db);

  if (activeProject) {
    const updatedProj: Project = {
      ...activeProject,
      status: 'presented',
      updatedAt: ts,
    };
    batch.set(doc(db, 'projects', activeProject.id), updatedProj);
  }

  if (activePresentation) {
    const updatedPres: Presentation = {
      ...activePresentation,
      status: 'completed',
      endedAt: ts,
    };
    batch.set(doc(db, 'presentations', activePresentation.id), updatedPres);
  }

  const updatedEvent: EventConfig = {
    ...eventConfig,
    stage: 'roulette',
    timerStatus: 'ended',
    timerEndsAtMs: 0,
    timerRemainingSecWhenPaused: 0,
    activeProjectId: '',
    activePresentationId: '',
    lastNotification: activeProject
      ? `Presentación de ${activeProject.name} finalizada. Lista la ruleta para el siguiente proyecto.`
      : 'Ronda finalizada. Lista la ruleta para la siguiente selección.',
    updatedAt: ts,
  };
  batch.set(doc(db, 'events', CURRENT_EVENT_ID), updatedEvent);

  try {
    await batch.commit();
    await logAdminAction(
      'Finalizar presentación',
      activeProject ? `Finalizó ${activeProject.name}` : 'Ronda finalizada'
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'events/grade12_pitch_2026');
  }
}

export async function closeEventAndPublishRanking(
  eventConfig: EventConfig,
  allProjects: Project[]
): Promise<void> {
  const ts = nowIso();
  const batch = writeBatch(db);

  for (const proj of allProjects) {
    if (proj.status === 'active') {
      batch.set(doc(db, 'projects', proj.id), {
        ...proj,
        status: 'presented',
        updatedAt: ts,
      });
    }
  }

  const updatedEvent: EventConfig = {
    ...eventConfig,
    stage: 'finished',
    timerStatus: 'ended',
    timerEndsAtMs: 0,
    activeProjectId: '',
    activePresentationId: '',
    lastNotification: '¡Mercado cerrado! Se ha publicado el Ranking Oficial TOP 05.',
    updatedAt: ts,
  };
  batch.set(doc(db, 'events', CURRENT_EVENT_ID), updatedEvent);

  try {
    await batch.commit();
    await logAdminAction(
      'Cerrar evento',
      'Se cerró el mercado y se publicó el Ranking TOP 05.'
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'events/grade12_pitch_2026');
  }
}

export async function executeInvestmentTransaction(params: {
  investor: Participant;
  projectId: string;
  amount: number;
  existingConfirmedInvestments: Investment[];
}): Promise<Investment> {
  const { investor, projectId, amount, existingConfirmedInvestments } = params;
  const cleanAmount = Math.round(amount);

  if (cleanAmount <= 0) {
    throw new Error('El monto de inversión debe ser mayor a $0.');
  }

  const investmentId = makeSafeId('inv');
  const eventRef = doc(db, 'events', CURRENT_EVENT_ID);
  const projectRef = doc(db, 'projects', projectId);
  const budgetRef = doc(db, 'budgets', investor.id);
  const participantRef = doc(db, 'participants', investor.id);
  const investmentRef = doc(db, 'investments', investmentId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const [eventSnap, projectSnap, budgetSnap, partSnap] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(projectRef),
        transaction.get(budgetRef),
        transaction.get(participantRef),
      ]);

      if (!eventSnap.exists()) {
        throw new Error('El evento no existe.');
      }
      if (!projectSnap.exists()) {
        throw new Error('El proyecto seleccionado no existe.');
      }
      if (!partSnap.exists()) {
        throw new Error('Tu registro de participante no fue encontrado.');
      }

      const eventData = eventSnap.data() as EventConfig;
      const projectData = projectSnap.data() as Project;
      const partData = partSnap.data() as Participant;

      if (partData.status === 'suspended') {
        throw new Error('Tu cuenta ha sido suspendida por el administrador.');
      }

      // Regla fundamental 1: No puedes invertir en tu propio proyecto
      if (
        projectData.entrepreneurId === partData.id ||
        projectData.entrepreneurName.toLowerCase().trim() ===
          partData.name.toLowerCase().trim() ||
        partData.projectId === projectData.id
      ) {
        throw new Error(
          'Regla fundamental: No puedes invertir en tu propio proyecto. Tu presupuesto virtual está destinado a respaldar las propuestas de tus compañeros.'
        );
      }

      // Regla 2: El evento debe estar en etapa de presentación activa y no estar pausado
      if (eventData.stage !== 'presenting' || eventData.timerStatus === 'paused') {
        throw new Error(
          'Las inversiones están bloqueadas porque la ronda no está activa o se encuentra en pausa.'
        );
      }

      // Inicialización resiliente del presupuesto si aún no existe el documento en Firestore
      const initialBudget = eventData.initialBudgetPerInvestor || 100000;
      let budgetData: Budget;
      if (!budgetSnap.exists()) {
        budgetData = {
          id: budgetRef.id,
          eventId: eventData.id || CURRENT_EVENT_ID,
          investorId: partData.id,
          investorName: partData.name,
          initialBudget,
          availableBudget: initialBudget,
          investedBudget: 0,
          investmentCount: 0,
          updatedAt: nowIso(),
        };
      } else {
        budgetData = budgetSnap.data() as Budget;
      }

      // Critical Rule 4: Available budget check
      if (cleanAmount > budgetData.availableBudget) {
        throw new Error(
          `Fondos insuficientes. Intentas invertir ${formatCurrency(cleanAmount)}, pero tu capital disponible es ${formatCurrency(budgetData.availableBudget)}.`
        );
      }

      const ts = nowIso();
      const previousCapital = budgetData.availableBudget;
      const remainingCapital = previousCapital - cleanAmount;

      // Check if this investor had already invested in this project before
      const hadInvestedBefore = existingConfirmedInvestments.some(
        (inv) =>
          inv.projectId === projectData.id &&
          inv.investorId === partData.id &&
          inv.status === 'confirmed'
      );

      const updatedBudget: Budget = {
        ...budgetData,
        availableBudget: remainingCapital,
        investedBudget: budgetData.investedBudget + cleanAmount,
        investmentCount: budgetData.investmentCount + 1,
        updatedAt: ts,
      };

      const updatedProject: Project = {
        ...projectData,
        totalInvested: projectData.totalInvested + cleanAmount,
        investorCount: hadInvestedBefore
          ? projectData.investorCount
          : projectData.investorCount + 1,
        updatedAt: ts,
      };

      const newInvestment: Investment = {
        id: investmentId,
        eventId: CURRENT_EVENT_ID,
        investorId: partData.id,
        investorName: partData.name,
        projectId: projectData.id,
        projectName: projectData.name,
        amount: cleanAmount,
        roundNumber: eventData.activeRoundNumber || projectData.presentationOrder || 1,
        status: 'confirmed',
        previousCapital,
        remainingCapital,
        createdAt: ts,
        timeFormatted: timeHHMMSS(),
      };

      const updatedEvent: EventConfig = {
        ...eventData,
        lastNotification: `¡Un nuevo inversor ha apoyado a ${projectData.name} con ${formatCurrency(cleanAmount)}!`,
        updatedAt: ts,
      };

      transaction.set(budgetRef, updatedBudget);
      transaction.set(projectRef, updatedProject);
      transaction.set(investmentRef, newInvestment);
      transaction.set(eventRef, updatedEvent);

      return newInvestment;
    });

    return result;
  } catch (err) {
    if (err instanceof Error && err.message.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.WRITE, `investments/${investmentId}`);
    }
    throw err;
  }
}

export async function recordCancelledOrRejectedInvestment(params: {
  investor: Participant;
  project: Project;
  amount: number;
  availableBudget: number;
  roundNumber: number;
  status: 'cancelled' | 'rejected';
}): Promise<void> {
  const invId = makeSafeId('inv');
  const cleanAmount = Math.max(0, Math.min(10000000, Math.round(params.amount || 0)));
  const docData: Investment = {
    id: invId,
    eventId: CURRENT_EVENT_ID,
    investorId: params.investor.id,
    investorName: params.investor.name,
    projectId: params.project.id,
    projectName: params.project.name,
    amount: cleanAmount,
    roundNumber: Math.max(0, params.roundNumber || 1),
    status: params.status,
    previousCapital: Math.max(0, params.availableBudget),
    remainingCapital: Math.max(0, params.availableBudget),
    createdAt: nowIso(),
    timeFormatted: timeHHMMSS(),
  };

  try {
    await setDoc(doc(db, 'investments', invId), docData);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `investments/${invId}`);
  }
}

export async function toggleProjectReaction(params: {
  participant: Participant;
  project: Project;
  reactionType: ReactionType;
  existingReaction?: Reaction;
}): Promise<void> {
  const { participant, project, reactionType, existingReaction } = params;
  const reactionId = `${participant.id}_${project.id}_${reactionType}`.replace(
    /[^a-zA-Z0-9_-]/g,
    ''
  );
  const reactionMeta = REACTION_DEFINITIONS.find((r) => r.type === reactionType);
  if (!reactionMeta) return;

  const ts = nowIso();
  const nextActive = existingReaction ? !existingReaction.active : true;
  const delta = nextActive ? 1 : -1;

  const reactionDoc: Reaction = {
    id: reactionId,
    eventId: CURRENT_EVENT_ID,
    participantId: participant.id,
    participantName: participant.name,
    projectId: project.id,
    projectName: project.name,
    reactionType,
    active: nextActive,
    createdAt: existingReaction ? existingReaction.createdAt : ts,
    updatedAt: ts,
  };

  const countField = reactionMeta.countField;
  const currentFieldCount = project[countField] || 0;
  const nextFieldCount = Math.max(0, currentFieldCount + delta);
  const nextTotalReactions = Math.max(0, (project.totalReactions || 0) + delta);

  const updatedProject: Project = {
    ...project,
    [countField]: nextFieldCount,
    totalReactions: nextTotalReactions,
    updatedAt: ts,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'reactions', reactionId), reactionDoc);
  batch.set(doc(db, 'projects', project.id), updatedProject);

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `reactions/${reactionId}`);
  }
}

export async function toggleParticipantSuspension(
  participant: Participant
): Promise<void> {
  const nextStatus = participant.status === 'active' ? 'suspended' : 'active';
  const updated: Participant = {
    ...participant,
    status: nextStatus,
    updatedAt: nowIso(),
  };
  try {
    await setDoc(doc(db, 'participants', participant.id), updated);
    await logAdminAction(
      nextStatus === 'suspended' ? 'Suspender participante' : 'Reactivar participante',
      `${participant.name} (${participant.role}) -> ${nextStatus}`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `participants/${participant.id}`);
  }
}

export async function updateParticipantDetailsAdmin(
  participant: Participant,
  newName: string,
  newProjectName: string,
  projects: Project[],
  budgets: Budget[]
): Promise<void> {
  const cleanName = clampStr(newName, 100);
  if (!cleanName) throw new Error('El nombre no puede estar vacío.');
  const ts = nowIso();
  const cleanProjName = clampStr(newProjectName, 120);

  const batch = writeBatch(db);
  const updatedPart: Participant = {
    ...participant,
    name: cleanName,
    normalizedName: cleanName.toLowerCase().trim(),
    projectName: participant.role === 'entrepreneur' ? cleanProjName : '',
    updatedAt: ts,
  };
  batch.set(doc(db, 'participants', participant.id), updatedPart);

  if (participant.role === 'entrepreneur' && participant.projectId) {
    const existingProj = projects.find((p) => p.id === participant.projectId);
    if (existingProj && cleanProjName) {
      batch.set(doc(db, 'projects', existingProj.id), {
        ...existingProj,
        name: cleanProjName,
        entrepreneurName: cleanName,
        updatedAt: ts,
      });
    }
  }

  const existingBudget = budgets.find((b) => b.investorId === participant.id);
  if (existingBudget) {
    batch.set(doc(db, 'budgets', existingBudget.id), {
      ...existingBudget,
      investorName: cleanName,
      updatedAt: ts,
    });
  }

  try {
    await batch.commit();
    await logAdminAction(
      'Modificar participante',
      `Actualizado registro de ${cleanName}`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `participants/${participant.id}`);
  }
}

export async function updateEntrepreneurProject(params: {
  participant: Participant;
  project: Project;
  newName: string;
  newCategory: string;
  eventConfig: EventConfig;
}): Promise<void> {
  const { participant, project, newName, newCategory, eventConfig } = params;

  if (eventConfig.stage !== 'registration') {
    throw new Error(
      'La edición del proyecto está bloqueada porque el registro se encuentra cerrado.'
    );
  }

  if (
    participant.role !== 'entrepreneur' ||
    (participant.projectId !== project.id && project.entrepreneurId !== participant.id)
  ) {
    throw new Error('Solo tienes autorización para editar tu propio proyecto.');
  }

  const cleanName = clampStr(newName, 120);
  const cleanCategory = clampStr(newCategory, 160);

  if (!cleanName) {
    throw new Error('El nombre del proyecto no puede estar vacío.');
  }

  const ts = nowIso();
  const batch = writeBatch(db);

  const updatedProject: Project = {
    ...project,
    name: cleanName,
    category: cleanCategory,
    updatedAt: ts,
  };

  const updatedParticipant: Participant = {
    ...participant,
    projectName: cleanName,
    updatedAt: ts,
  };

  batch.set(doc(db, 'projects', project.id), updatedProject);
  batch.set(doc(db, 'participants', participant.id), updatedParticipant);

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${project.id}`);
  }
}

export async function resetAllEventData(keepEventConfig?: EventConfig): Promise<void> {
  const collectionsToClear = [
    'participants',
    'projects',
    'budgets',
    'investments',
    'reactions',
    'presentations',
  ];

  for (const colName of collectionsToClear) {
    try {
      const q = query(collection(db, colName), where('eventId', '==', CURRENT_EVENT_ID));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, colName);
    }
  }

  // Limpiar credenciales privadas si el administrador tiene sesión Google verificada
  try {
    const secretsSnap = await getDocs(
      query(collection(db, 'participant_secrets'), where('eventId', '==', CURRENT_EVENT_ID))
    );
    if (!secretsSnap.empty) {
      const batch = writeBatch(db);
      secretsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch {
    // Silencioso si las reglas aún no permiten listar/borrar participant_secrets sin Google Admin
  }

  const ts = nowIso();
  const freshConfig: EventConfig = {
    id: CURRENT_EVENT_ID,
    eventId: CURRENT_EVENT_ID,
    name: keepEventConfig?.name || 'PITCH INVESTORS',
    subtitle: keepEventConfig?.subtitle || 'SIMULACIÓN DE INVERSIÓN · GRADO 12',
    stage: 'registration',
    registrationMode: keepEventConfig?.registrationMode || 'single',
    visibilityMode: keepEventConfig?.visibilityMode || 'private_totals',
    entrepreneurCanInvest: keepEventConfig?.entrepreneurCanInvest ?? false,
    initialBudgetPerInvestor: keepEventConfig?.initialBudgetPerInvestor || 100000,
    activeProjectId: '',
    activePresentationId: '',
    activeRoundNumber: 0,
    timerStatus: 'idle',
    timerDurationSec: 180,
    timerEndsAtMs: 0,
    timerRemainingSecWhenPaused: 180,
    adminPin: keepEventConfig?.adminPin || '1212',
    lastNotification: 'Evento reiniciado. Registro abierto para nuevos participantes.',
    updatedAt: ts,
  };

  try {
    await setDoc(doc(db, 'events', CURRENT_EVENT_ID), freshConfig);
    await logAdminAction('Reiniciar evento', 'Todos los registros fueron limpiados.');
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `events/${CURRENT_EVENT_ID}`);
  }
}

export async function seedDemoGrade12Data(clearFirst = true): Promise<void> {
  if (clearFirst) {
    await resetAllEventData();
  } else {
    // Check if there are already projects
    const existingSnap = await getDocs(
      query(collection(db, 'projects'), where('eventId', '==', CURRENT_EVENT_ID))
    );
    if (!existingSnap.empty) return;
  }

  const ts = nowIso();
  const batch = writeBatch(db);

  const demoProjects = [
    {
      id: 'proj_demo_01',
      partId: 'part_ent_01',
      code: 'PROYECTO 001',
      name: 'ECO DESIGN',
      category: 'Proyecto de diseño industrial y sostenibilidad circular',
      entrepreneurName: 'Valentina Morales',
      status: 'presented' as const,
      order: 1,
      duration: 180,
      invested: 240000,
      investors: 5,
      fire: 6,
      idea: 8,
      clap: 5,
      rocket: 7,
      heart: 4,
      target: 6,
      mindblown: 3,
      star: 5,
    },
    {
      id: 'proj_demo_02',
      partId: 'part_ent_02',
      code: 'PROYECTO 002',
      name: 'NEO FUTURE',
      category: 'Plataforma de robótica asistiva y prótesis impresas en 3D',
      entrepreneurName: 'Santiago Restrepo',
      status: 'presented' as const,
      order: 2,
      duration: 240,
      invested: 195000,
      investors: 4,
      fire: 5,
      idea: 7,
      clap: 4,
      rocket: 6,
      heart: 3,
      target: 5,
      mindblown: 4,
      star: 4,
    },
    {
      id: 'proj_demo_03',
      partId: 'part_ent_03',
      code: 'PROYECTO 003',
      name: 'ART LAB',
      category: 'Estudio creativo digital y experiencias inmersivas para museos',
      entrepreneurName: 'Camila Torres',
      status: 'active' as const,
      order: 3,
      duration: 180,
      invested: 145000,
      investors: 3,
      fire: 4,
      idea: 5,
      clap: 6,
      rocket: 4,
      heart: 5,
      target: 3,
      mindblown: 2,
      star: 4,
    },
    {
      id: 'proj_demo_04',
      partId: 'part_ent_04',
      code: 'PROYECTO 004',
      name: 'GREEN CITY',
      category: 'Sistema de huertas urbanas automatizadas con sensores solares',
      entrepreneurName: 'Mateo Mendoza',
      status: 'pending' as const,
      order: 0,
      duration: 0,
      invested: 0,
      investors: 0,
      fire: 2,
      idea: 3,
      clap: 1,
      rocket: 2,
      heart: 2,
      target: 2,
      mindblown: 1,
      star: 1,
    },
    {
      id: 'proj_demo_05',
      partId: 'part_ent_05',
      code: 'PROYECTO 005',
      name: 'PIXEL WORLD',
      category: 'Videojuego educativo sobre historia latinoamericana y cultura',
      entrepreneurName: 'Alejandro Gómez',
      status: 'pending' as const,
      order: 0,
      duration: 0,
      invested: 0,
      investors: 0,
      fire: 3,
      idea: 2,
      clap: 2,
      rocket: 3,
      heart: 1,
      target: 1,
      mindblown: 2,
      star: 2,
    },
    {
      id: 'proj_demo_06',
      partId: 'part_ent_06',
      code: 'PROYECTO 006',
      name: 'SOLAR GRID',
      category: 'Micro-estaciones de carga solar para campus escolares',
      entrepreneurName: 'Isabella Vargas',
      status: 'pending' as const,
      order: 0,
      duration: 0,
      invested: 0,
      investors: 0,
      fire: 1,
      idea: 4,
      clap: 2,
      rocket: 2,
      heart: 1,
      target: 3,
      mindblown: 1,
      star: 2,
    },
  ];

  for (const dp of demoProjects) {
    const partDoc: Participant = {
      id: dp.partId,
      eventId: CURRENT_EVENT_ID,
      name: dp.entrepreneurName,
      normalizedName: dp.entrepreneurName.toLowerCase(),
      role: 'entrepreneur',
      projectId: dp.id,
      projectName: dp.name,
      status: 'active',
      createdAt: ts,
      updatedAt: ts,
    };
    batch.set(doc(db, 'participants', dp.partId), partDoc);

    const totalReacts =
      dp.fire + dp.idea + dp.clap + dp.rocket + dp.heart + dp.target + dp.mindblown + dp.star;
    const projDoc: Project = {
      id: dp.id,
      eventId: CURRENT_EVENT_ID,
      code: dp.code,
      name: dp.name,
      category: dp.category,
      entrepreneurId: dp.partId,
      entrepreneurName: dp.entrepreneurName,
      grade: 'GRADO 12',
      status: dp.status,
      presentationOrder: dp.order,
      assignedDurationSec: dp.duration,
      totalInvested: dp.invested,
      investorCount: dp.investors,
      totalReactions: totalReacts,
      fireCount: dp.fire,
      ideaCount: dp.idea,
      clapCount: dp.clap,
      rocketCount: dp.rocket,
      heartCount: dp.heart,
      targetCount: dp.target,
      mindblownCount: dp.mindblown,
      starCount: dp.star,
      createdAt: ts,
      updatedAt: ts,
    };
    batch.set(doc(db, 'projects', dp.id), projDoc);

    const budgetDoc: Budget = {
      id: dp.partId,
      eventId: CURRENT_EVENT_ID,
      investorId: dp.partId,
      investorName: dp.entrepreneurName,
      initialBudget: 100000,
      availableBudget: 100000,
      investedBudget: 0,
      investmentCount: 0,
      updatedAt: ts,
    };
    batch.set(doc(db, 'budgets', dp.partId), budgetDoc);
  }

  const demoInvestors = [
    { id: 'part_inv_01', name: 'Sofía Ramírez', spent: 85000, count: 3 },
    { id: 'part_inv_02', name: 'Daniel Herrera', spent: 90000, count: 3 },
    { id: 'part_inv_03', name: 'Mariana Castro', spent: 75000, count: 2 },
    { id: 'part_inv_04', name: 'Lucas Pineda', spent: 100000, count: 3 },
    { id: 'part_inv_05', name: 'Gabriela Rojas', spent: 60000, count: 2 },
    { id: 'part_inv_06', name: 'Nicolás Duarte', spent: 90000, count: 2 },
    { id: 'part_inv_07', name: 'Valeria Salazar', spent: 80000, count: 2 },
    { id: 'part_inv_08', name: 'Andrés Quintero', spent: 0, count: 0 },
  ];

  for (const inv of demoInvestors) {
    const partDoc: Participant = {
      id: inv.id,
      eventId: CURRENT_EVENT_ID,
      name: inv.name,
      normalizedName: inv.name.toLowerCase(),
      role: 'investor',
      projectId: '',
      projectName: '',
      status: 'active',
      createdAt: ts,
      updatedAt: ts,
    };
    batch.set(doc(db, 'participants', inv.id), partDoc);

    const budgetDoc: Budget = {
      id: inv.id,
      eventId: CURRENT_EVENT_ID,
      investorId: inv.id,
      investorName: inv.name,
      initialBudget: 100000,
      availableBudget: 100000 - inv.spent,
      investedBudget: inv.spent,
      investmentCount: inv.count,
      updatedAt: ts,
    };
    batch.set(doc(db, 'budgets', inv.id), budgetDoc);
  }

  const sampleInvestments: Omit<Investment, 'eventId' | 'createdAt'>[] = [
    {
      id: 'inv_demo_01',
      investorId: 'part_inv_01',
      investorName: 'Sofía Ramírez',
      projectId: 'proj_demo_01',
      projectName: 'ECO DESIGN',
      amount: 45000,
      roundNumber: 1,
      status: 'confirmed',
      previousCapital: 100000,
      remainingCapital: 55000,
      timeFormatted: '09:14:22',
    },
    {
      id: 'inv_demo_02',
      investorId: 'part_inv_02',
      investorName: 'Daniel Herrera',
      projectId: 'proj_demo_01',
      projectName: 'ECO DESIGN',
      amount: 50000,
      roundNumber: 1,
      status: 'confirmed',
      previousCapital: 100000,
      remainingCapital: 50000,
      timeFormatted: '09:15:04',
    },
    {
      id: 'inv_demo_03',
      investorId: 'part_inv_03',
      investorName: 'Mariana Castro',
      projectId: 'proj_demo_01',
      projectName: 'ECO DESIGN',
      amount: 45000,
      roundNumber: 1,
      status: 'confirmed',
      previousCapital: 100000,
      remainingCapital: 55000,
      timeFormatted: '09:15:39',
    },
    {
      id: 'inv_demo_04',
      investorId: 'part_inv_04',
      investorName: 'Lucas Pineda',
      projectId: 'proj_demo_01',
      projectName: 'ECO DESIGN',
      amount: 50000,
      roundNumber: 1,
      status: 'confirmed',
      previousCapital: 100000,
      remainingCapital: 50000,
      timeFormatted: '09:16:02',
    },
    {
      id: 'inv_demo_05',
      investorId: 'part_inv_06',
      investorName: 'Nicolás Duarte',
      projectId: 'proj_demo_01',
      projectName: 'ECO DESIGN',
      amount: 50000,
      roundNumber: 1,
      status: 'confirmed',
      previousCapital: 100000,
      remainingCapital: 50000,
      timeFormatted: '09:16:18',
    },
    {
      id: 'inv_demo_06',
      investorId: 'part_inv_01',
      investorName: 'Sofía Ramírez',
      projectId: 'proj_demo_02',
      projectName: 'NEO FUTURE',
      amount: 20000,
      roundNumber: 2,
      status: 'confirmed',
      previousCapital: 55000,
      remainingCapital: 35000,
      timeFormatted: '09:20:11',
    },
    {
      id: 'inv_demo_07',
      investorId: 'part_inv_05',
      investorName: 'Gabriela Rojas',
      projectId: 'proj_demo_02',
      projectName: 'NEO FUTURE',
      amount: 60000,
      roundNumber: 2,
      status: 'confirmed',
      previousCapital: 100000,
      remainingCapital: 40000,
      timeFormatted: '09:21:05',
    },
    {
      id: 'inv_demo_08',
      investorId: 'part_inv_06',
      investorName: 'Nicolás Duarte',
      projectId: 'proj_demo_02',
      projectName: 'NEO FUTURE',
      amount: 40000,
      roundNumber: 2,
      status: 'confirmed',
      previousCapital: 50000,
      remainingCapital: 10000,
      timeFormatted: '09:21:44',
    },
    {
      id: 'inv_demo_09',
      investorId: 'part_inv_07',
      investorName: 'Valeria Salazar',
      projectId: 'proj_demo_02',
      projectName: 'NEO FUTURE',
      amount: 75000,
      roundNumber: 2,
      status: 'confirmed',
      previousCapital: 100000,
      remainingCapital: 25000,
      timeFormatted: '09:22:12',
    },
    {
      id: 'inv_demo_10',
      investorId: 'part_inv_01',
      investorName: 'Sofía Ramírez',
      projectId: 'proj_demo_03',
      projectName: 'ART LAB',
      amount: 20000,
      roundNumber: 3,
      status: 'confirmed',
      previousCapital: 35000,
      remainingCapital: 15000,
      timeFormatted: '09:26:10',
    },
    {
      id: 'inv_demo_11',
      investorId: 'part_inv_02',
      investorName: 'Daniel Herrera',
      projectId: 'proj_demo_03',
      projectName: 'ART LAB',
      amount: 40000,
      roundNumber: 3,
      status: 'confirmed',
      previousCapital: 50000,
      remainingCapital: 10000,
      timeFormatted: '09:26:48',
    },
    {
      id: 'inv_demo_12',
      investorId: 'part_inv_03',
      investorName: 'Mariana Castro',
      projectId: 'proj_demo_03',
      projectName: 'ART LAB',
      amount: 30000,
      roundNumber: 3,
      status: 'confirmed',
      previousCapital: 55000,
      remainingCapital: 25000,
      timeFormatted: '09:27:05',
    },
    {
      id: 'inv_demo_13',
      investorId: 'part_inv_04',
      investorName: 'Lucas Pineda',
      projectId: 'proj_demo_03',
      projectName: 'ART LAB',
      amount: 55000,
      roundNumber: 3,
      status: 'confirmed',
      previousCapital: 55000,
      remainingCapital: 0,
      timeFormatted: '09:27:30',
    },
    {
      id: 'inv_demo_14',
      investorId: 'part_inv_07',
      investorName: 'Valeria Salazar',
      projectId: 'proj_demo_03',
      projectName: 'ART LAB',
      amount: 20000,
      roundNumber: 3,
      status: 'cancelled',
      previousCapital: 25000,
      remainingCapital: 25000,
      timeFormatted: '09:27:55',
    },
  ];

  for (const sInv of sampleInvestments) {
    batch.set(doc(db, 'investments', sInv.id), {
      ...sInv,
      eventId: CURRENT_EVENT_ID,
      createdAt: ts,
    });
  }

  const presDocs: Presentation[] = [
    {
      id: 'pres_demo_01',
      eventId: CURRENT_EVENT_ID,
      projectId: 'proj_demo_01',
      projectName: 'ECO DESIGN',
      entrepreneurName: 'Valentina Morales',
      roundNumber: 1,
      assignedDurationSec: 180,
      status: 'completed',
      startedAt: ts,
      endedAt: ts,
      createdAt: ts,
    },
    {
      id: 'pres_demo_02',
      eventId: CURRENT_EVENT_ID,
      projectId: 'proj_demo_02',
      projectName: 'NEO FUTURE',
      entrepreneurName: 'Santiago Restrepo',
      roundNumber: 2,
      assignedDurationSec: 240,
      status: 'completed',
      startedAt: ts,
      endedAt: ts,
      createdAt: ts,
    },
    {
      id: 'pres_demo_03',
      eventId: CURRENT_EVENT_ID,
      projectId: 'proj_demo_03',
      projectName: 'ART LAB',
      entrepreneurName: 'Camila Torres',
      roundNumber: 3,
      assignedDurationSec: 180,
      status: 'active',
      startedAt: ts,
      endedAt: '',
      createdAt: ts,
    },
  ];

  for (const pr of presDocs) {
    batch.set(doc(db, 'presentations', pr.id), pr);
  }

  const endsAtMs = Date.now() + 180 * 1000;
  const demoEvent: EventConfig = {
    id: CURRENT_EVENT_ID,
    eventId: CURRENT_EVENT_ID,
    name: 'PITCH INVESTORS',
    subtitle: 'SIMULACIÓN DE INVERSIÓN · GRADO 12',
    stage: 'presenting',
    registrationMode: 'single',
    visibilityMode: 'private_totals',
    entrepreneurCanInvest: false,
    initialBudgetPerInvestor: 100000,
    activeProjectId: 'proj_demo_03',
    activePresentationId: 'pres_demo_03',
    activeRoundNumber: 3,
    timerStatus: 'running',
    timerDurationSec: 180,
    timerEndsAtMs: endsAtMs,
    timerRemainingSecWhenPaused: 180,
    adminPin: '1212',
    lastNotification: '¡Un nuevo inversor ha apoyado a ART LAB con $55.000!',
    updatedAt: ts,
  };
  batch.set(doc(db, 'events', CURRENT_EVENT_ID), demoEvent);

  try {
    await batch.commit();
    await logAdminAction(
      'Cargar datos de demostración',
      'Se cargaron 6 proyectos de Grado 12, 8 inversores y ronda #3 activa (ART LAB).'
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'events/grade12_pitch_2026');
  }
}
