/**
 * The chat's whole knowledge base, generated from content.ts.
 *
 * Deliberately not RAG. The bio is a few thousand tokens and fits whole in the
 * system prompt — retrieval over 15 projects would be slower, more fragile, and
 * less accurate than handing the model everything. The knowledge graph is a
 * visualization, not a retrieval layer.
 */

import { profile, roles, education, projects, skills, achievements } from './content';

export function buildBiography(): string {
  const lines: string[] = [];

  lines.push(`# ${profile.name} — ${profile.title}`);
  lines.push(
    `Location: ${profile.location}. Email: ${profile.email}. Phone: ${profile.phone}.`,
    `GitHub: ${profile.github}. LinkedIn: ${profile.linkedin}.`,
    `Positioning: ${profile.positioning}`,
    `Availability: ${profile.availability}`,
    `Industry experience: ${profile.experienceLength}.`,
    '',
  );

  lines.push('## Experience');
  for (const r of roles) {
    lines.push(`### ${r.company} — ${r.title}`, `${r.location}. ${r.period}.`, r.summary, '');
  }

  lines.push('## Education');
  for (const e of education) {
    lines.push(`- ${e.qualification}, ${e.institution}. ${e.period}. ${e.result}.`);
  }
  lines.push('');

  lines.push('## Projects');
  for (const p of projects) {
    lines.push(`### ${p.name} (${p.context}, ${p.year})${p.featured ? ' [featured]' : ''}`);
    lines.push(p.blurb);
    if (p.challenge) lines.push(`Challenge: ${p.challenge}`);
    if (p.approach) lines.push(`Approach: ${p.approach}`);
    if (p.outcome) lines.push(`Outcome: ${p.outcome}`);
    if (p.detail?.length) lines.push(...p.detail);
    lines.push(`Tech: ${p.tech.join(', ')}.`, `Domains: ${p.domains.join(', ')}.`, '');
  }

  lines.push('## Skills');
  for (const [group, list] of Object.entries(skills)) lines.push(`- ${group}: ${list.join(', ')}`);
  lines.push('');

  lines.push('## Achievements');
  for (const a of achievements) lines.push(`- ${a.detail}`);

  return lines.join('\n');
}

export const SYSTEM_PROMPT = `You are ${profile.name}, an AI/ML engineer, answering questions about your own work on your portfolio site.

Speak in the first person, as yourself: "I built", "I ran into", "my part was". You are not an assistant describing him — you are him.
Voice: plain, concise, technically literate. The way you would talk to another engineer over coffee, not a cover letter and not a marketing page. No superlatives about yourself, no "passionate about". Understate rather than oversell; the work is specific enough to speak for itself.
Two to four sentences for most answers. Cite specific projects and numbers where the biography below contains them.
If a question is not answerable from the biography, say so plainly — "I have not written that up here" — and suggest what you can talk about instead.
Never invent employers, dates, metrics, or technologies. If you are unsure of a detail, say you would have to check rather than guessing. Everything you say is being read by people deciding whether to hire you, so an invented number is worse than an admission.
Decline anything unrelated to your work and steer back.

Everything you know about yourself is below. It is the whole of it.

--- BIOGRAPHY ---
${buildBiography()}
--- END BIOGRAPHY ---`;
