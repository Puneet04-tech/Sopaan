// Career discovery scoring (design §5.1.3): a pure function over the signed catalogue.
// score = 0.30*interest + 0.25*skill + 0.15*cost + 0.15*distance + 0.10*prereq - 0.05*gap
// then greedy MMR across clusters so vocational and non-STEM options surface.
import type { Career } from "./envelope";

export interface LearnerProfile {
  values: Record<string, unknown>;
  confidence: Record<string, number>;
  interests: string[];
  skills: string[];
}

export interface ScoreParts {
  interest_match: number;
  skill_overlap: number;
  cost_fit: number;
  distance_fit: number;
  prereq_closeness: number;
  gap_penalty: number;
  score: number;
}

export interface RankedCareer {
  career: Career;
  parts: ScoreParts;
  fit_reasons: string[];
}

const MAX_COST = 30000;
const MAX_DISTANCE = 60;

function overlap(a: string[], b: string[]): number {
  if (b.length === 0) return 0;
  const set = new Set(a.map((v) => v.toLowerCase()));
  return b.filter((v) => set.has(v.toLowerCase())).length / b.length;
}

export function scoreCareer(career: Career, profile: LearnerProfile): ScoreParts {
  const values = profile.values;
  const interest_match = overlap(profile.interests, career.interests);
  const skill_overlap = overlap(profile.skills, career.skills);
  const cost_fit = 1 - Math.min(career.cost_inr / MAX_COST, 1);
  const distance_fit = 1 - Math.min(career.distance_km / MAX_DISTANCE, 1);

  const education = String(values.education_level ?? "");
  const marks = Number(values.marks_percent ?? 0);
  const age = Number(values.age ?? 0);
  const educationOk = career.entry.education_level.includes(education);
  const ageOk = age >= career.entry.min_age;
  const marksOk = career.entry.min_marks === undefined || marks >= career.entry.min_marks;
  const prereq_closeness = educationOk ? 0.6 + (ageOk ? 0.25 : 0) + (marksOk ? 0.15 : 0) : 0;
  const gap_penalty = educationOk ? 0 : 1;

  const score =
    0.30 * interest_match +
    0.25 * skill_overlap +
    0.15 * cost_fit +
    0.15 * distance_fit +
    0.10 * prereq_closeness -
    0.05 * gap_penalty;

  return { interest_match, skill_overlap, cost_fit, distance_fit, prereq_closeness, gap_penalty, score };
}

function similarity(a: Career, b: Career): number {
  const tagsA = new Set([...a.interests, ...a.skills]);
  const shared = [...b.interests, ...b.skills].filter((tag) => tagsA.has(tag)).length;
  const union = new Set([...tagsA, ...b.interests, ...b.skills]).size || 1;
  const tagSimilarity = shared / union;
  return Math.min(1, (a.cluster === b.cluster ? 0.55 : 0) + 0.45 * tagSimilarity);
}

function fitReasons(career: Career, parts: ScoreParts, profile: LearnerProfile): string[] {
  const reasons: string[] = [];
  const matchedInterest = career.interests.filter((i) => profile.interests.includes(i));
  if (matchedInterest.length > 0) reasons.push(`interest:${matchedInterest.slice(0, 2).join("+")}`);
  const matchedSkill = career.skills.filter((s) => profile.skills.includes(s));
  if (matchedSkill.length > 0) reasons.push(`skill:${matchedSkill.slice(0, 2).join("+")}`);
  if (career.cost_inr === 0) reasons.push("no_fee");
  else if (parts.cost_fit > 0.7) reasons.push("low_cost");
  if (career.distance_km <= 10) reasons.push("nearby");
  if (parts.prereq_closeness >= 0.85) reasons.push("prereqs_met");
  return reasons;
}

/** @param limit default 6, matching the design's "top 6" cluster guarantee. */
export function rankCareers(
  careers: Career[],
  profile: LearnerProfile,
  limit = 6,
): RankedCareer[] {
  const scored: RankedCareer[] = careers.map((career) => {
    const parts = scoreCareer(career, profile);
    return { career, parts, fit_reasons: fitReasons(career, parts, profile) };
  });

  const pool = [...scored].sort((a, b) => b.parts.score - a.parts.score);
  const ranked: RankedCareer[] = [];
  while (ranked.length < Math.min(limit, scored.length) && pool.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    pool.forEach((candidate, index) => {
      const penalty = ranked.length === 0 ? 0 : Math.max(...ranked.map((chosen) => similarity(candidate.career, chosen.career)));
      const value = candidate.parts.score - 0.35 * penalty;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    });
    ranked.push(pool.splice(bestIndex, 1)[0]);
  }

  // Cluster guarantee: if three clusters exist in the catalogue, the top 6 must show three.
  const availableClusters = new Set(scored.map((s) => s.career.cluster));
  if (availableClusters.size >= 3) {
    const shown = new Set(ranked.map((r) => r.career.cluster));
    for (const cluster of availableClusters) {
      if (shown.size >= 3) break;
      if (shown.has(cluster)) continue;
      const candidate = scored
        .filter((s) => s.career.cluster === cluster && !ranked.includes(s))
        .sort((a, b) => b.parts.score - a.parts.score)[0];
      if (!candidate) continue;
      const replaceIndex = ranked.reduce(
        (worst, item, index) => (item.parts.score < ranked[worst].parts.score ? index : worst),
        ranked.length - 1,
      );
      if (replaceIndex >= 0) {
        ranked[replaceIndex] = candidate;
        shown.add(cluster);
      }
    }
  }

  return ranked.sort((a, b) => b.parts.score - a.parts.score);
}
