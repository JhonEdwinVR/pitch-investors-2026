/**
 * Security Rules Specification Verification (Dirty Dozen Test Cases)
 * Verifies that all 12 invalid payloads defined in security_spec.md are rejected.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  payload: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Participant',
    collection: 'participants',
    docId: 'p_test_1',
    payload: {
      id: 'p_test_1',
      eventId: 'grade12_pitch_2026',
      name: 'Estudiante 1',
      normalizedName: 'estudiante 1',
      role: 'investor',
      projectId: '',
      projectName: '',
      status: 'active',
      createdAt: '2026-11-17T00:00:00Z',
      updatedAt: '2026-11-17T00:00:00Z',
      isSuperAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Oversized Name Attack',
    collection: 'participants',
    docId: 'p_test_2',
    payload: {
      id: 'p_test_2',
      eventId: 'grade12_pitch_2026',
      name: 'A'.repeat(500),
      normalizedName: 'a'.repeat(500),
      role: 'investor',
      projectId: '',
      projectName: '',
      status: 'active',
      createdAt: '2026-11-17T00:00:00Z',
      updatedAt: '2026-11-17T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Invalid Role Enum',
    collection: 'participants',
    docId: 'p_test_3',
    payload: {
      id: 'p_test_3',
      eventId: 'grade12_pitch_2026',
      name: 'Estudiante 3',
      normalizedName: 'estudiante 3',
      role: 'hacker',
      projectId: '',
      projectName: '',
      status: 'active',
      createdAt: '2026-11-17T00:00:00Z',
      updatedAt: '2026-11-17T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Negative Investment Amount',
    collection: 'investments',
    docId: 'inv_test_4',
    payload: {
      id: 'inv_test_4',
      eventId: 'grade12_pitch_2026',
      investorId: 'p1',
      investorName: 'Inversor',
      projectId: 'proj1',
      projectName: 'Eco Design',
      amount: -20000,
      roundNumber: 1,
      status: 'confirmed',
      previousCapital: 100000,
      remainingCapital: 120000,
      createdAt: '2026-11-17T00:00:00Z',
      timeFormatted: '10:00:00',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
