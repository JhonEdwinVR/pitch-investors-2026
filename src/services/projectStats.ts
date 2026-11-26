import { Investment, Project } from '../types';

/**
 * Computes each project's live totalInvested and unique investorCount
 * directly from confirmed investment records so UI views never show stale
 * cached counters from project documents.
 */
export function enrichProjectsWithConfirmedInvestments(
  projects: Project[],
  investments: Investment[]
): Project[] {
  const totalsByProject = new Map<string, { total: number; investors: Set<string> }>();

  for (const inv of investments) {
    if (inv.status !== 'confirmed') continue;
    let entry = totalsByProject.get(inv.projectId);
    if (!entry) {
      entry = { total: 0, investors: new Set<string>() };
      totalsByProject.set(inv.projectId, entry);
    }
    entry.total += inv.amount;
    entry.investors.add(inv.investorId);
  }

  return projects.map((proj) => {
    const agg = totalsByProject.get(proj.id);
    if (!agg) {
      if (proj.totalInvested === 0 && proj.investorCount === 0) return proj;
      return {
        ...proj,
        totalInvested: 0,
        investorCount: 0,
      };
    }

    if (proj.totalInvested === agg.total && proj.investorCount === agg.investors.size) {
      return proj;
    }

    return {
      ...proj,
      totalInvested: agg.total,
      investorCount: agg.investors.size,
    };
  });
}
