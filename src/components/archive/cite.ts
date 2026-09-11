// src/components/archive/cite.ts
/**
 * The least a node has to be for an answer to be able to cite it.
 *
 * Deliberately not `ChartNode` or `GraphNode`. This matcher is used by the
 * locker room's wall chart and by the homepage constellation, which are two
 * different types over the same underlying graph, and coupling it to either
 * would mean the other had to convert. Three fields is all it reads.
 */
export type Citable = { id: string; label: string; ref?: string };

/**
 * Which parts of the graph an answer actually talked about.
 *
 * ── Why this is not a backend feature ──
 *
 * The obvious design is to have the model tell us: append a machine-readable
 * footer to every answer, `⟦refs:diagramstudio,omnitrace⟧`, strip it from the
 * stream, act on it. It is one prompt edit and one regex, and I nearly built
 * it that way.
 *
 * The reason not to is that a citation drives *physical* consequences here —
 * doors open, a map lights up, the reader is invited to walk somewhere. A
 * model asked to emit structured output at the end of a free-form answer gets
 * it wrong some fraction of the time: it invents a slug, it cites a project
 * it never mentioned, it forgets the footer under a long answer, or it prints
 * the footer mid-sentence. Every one of those failures opens the wrong locker,
 * which is worse than opening none. It would also put the feature at the mercy
 * of a prompt that has to keep working across model upgrades.
 *
 * Matching the answer's own words cannot do any of that. If a door opens, the
 * name on it was said out loud in the text the reader is looking at — the
 * citation is verifiable by reading, which is the property the whole idea was
 * supposed to have. It needs no prompt, no protocol, no schema and no server
 * change, and it keeps working if the model is swapped tomorrow.
 *
 * The honest limitation: it is literal. "The vision one" matches nothing, and
 * a paraphrase goes uncited. That is a miss, not a lie, and in a feature whose
 * whole value is trustworthiness, a miss is the cheap failure.
 */

/**
 * Below four characters a label is not a label, it is a trap.
 *
 * The tech ring contains names like Go, R, C, npm and AWS. Hunting for "Go" in
 * English prose lights the Go node on "going", "algorithm" and "good" — and
 * because every tech node is wired to several projects, one bad match drags a
 * whole neighbourhood on with it. Four characters plus a word boundary is
 * where false positives stop being routine.
 */
const MIN_LEN = 4;

export type Matcher = (text: string) => Set<string>;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildMatcher(nodes: Citable[]): Matcher {
  const probes: { id: string; re: RegExp }[] = [];
  const seen = new Set<string>();

  for (const n of nodes) {
    // The visible label, and the slug, which catches "asc-cadence" written as
    // one word in a URL or a filename.
    const needles = [n.label, n.ref].filter(
      (x): x is string => typeof x === 'string' && x.length >= MIN_LEN,
    );
    for (const raw of needles) {
      const key = `${n.id}|${raw.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      /*
       * `\b` on both ends, except where the needle itself begins or ends with
       * a non-word character — `C++` and `.NET` have no word boundary on the
       * punctuated side, and asking for one there matches nothing at all.
       */
      const head = /^\w/.test(raw) ? '\\b' : '';
      const tail = /\w$/.test(raw) ? '\\b' : '';
      probes.push({
        id: n.id,
        re: new RegExp(`${head}${escape(raw).replace(/[-\s]+/g, '[-\\s]+')}${tail}`, 'i'),
      });
    }
  }

  return (text: string) => {
    const hit = new Set<string>();
    if (text.length < MIN_LEN) return hit;
    for (const p of probes) if (p.re.test(text)) hit.add(p.id);
    return hit;
  };
}

/**
 * True when two sets hold the same ids.
 *
 * The matcher runs against the whole accumulated answer on every chunk of the
 * stream, so it returns an identical set most of the time. Comparing before
 * acting is what stops a repaint of the chart canvas and a re-walk of every
 * door target forty times per answer.
 */
export function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}