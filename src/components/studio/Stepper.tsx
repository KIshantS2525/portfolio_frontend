'use client';

import { useState } from 'react';

/**
 * A stepper hides content behind a button, and a hiring manager reading fast
 * will not click through four steps. It is justified exactly once — here, where
 * the sequence IS the story. Everywhere else on this site, the content is shown.
 */
const STEPS = [
  { head: 'Try Qdrant', body: 'No win_arm64 wheel. The event machine is a Snapdragon X Elite, so this is Windows on ARM64 and there is no prebuilt binary to install.' },
  { head: 'Try ChromaDB', body: 'No win_arm64 wheel either. Same wall, different package. It is now roughly 2am.' },
  { head: 'Try sqlite-vec', body: 'No win_arm64 wheel. Every standard vector database is unavailable and there is no time to wait on upstream support.' },
  {
    head: 'Write it',
    body: 'Brute-force KNN in NumPy over plain SQLite BLOBs, replicating what sqlite-vec provides. Embeddings stored int8-quantized at 256 dimensions as raw bytes; search reconstructs one (n, 256) matrix with np.frombuffer, computes squared L2 in a single vectorized pass, and takes top-k with np.argsort. At a few thousand vectors the O(n) scan is effectively free. Approximate nearest neighbour was never the bottleneck — ARM64 wheel support was.',
  },
];

export function Stepper() {
  const [i, setI] = useState(0);
  const step = STEPS[i];

  return (
    <div className="rounded-[24px] border border-ash/15 p-[24px] md:p-[36px]">
      <ol className="flex items-center gap-[12px]" aria-label="Progress">
        {STEPS.map((s, k) => (
          <li key={s.head} className="flex flex-1 items-center gap-[12px]">
            <button
              type="button"
              onClick={() => setI(k)}
              aria-current={k === i ? 'step' : undefined}
              className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-[12px] transition-colors duration-300 ${
                k <= i ? 'bg-iris text-white' : 'border border-ash/30 text-ash'
              }`}
            >
              {k + 1}
              <span className="sr-only">{s.head}</span>
            </button>
            {k < STEPS.length - 1 && (
              <span
                className="h-px flex-1 transition-colors duration-300"
                style={{ background: k < i ? 'var(--accent)' : 'var(--hairline)' }}
              />
            )}
          </li>
        ))}
      </ol>

      <div className="mt-[24px] min-h-[190px] md:min-h-[150px]">
        <h4 className="t-subheading text-bone">{step.head}</h4>
        <p className="t-body mt-[12px] max-w-[70ch] text-mist">{step.body}</p>
      </div>

      <div className="mt-[18px] flex items-center gap-[24px]">
        <button
          type="button"
          onClick={() => setI((v) => Math.max(0, v - 1))}
          disabled={i === 0}
          className="ghost disabled:pointer-events-none disabled:opacity-30"
        >
          Back
        </button>
        {i < STEPS.length - 1 ? (
          <button type="button" onClick={() => setI((v) => v + 1)} className="pill !py-[11px] !px-[20px]">
            Next
          </button>
        ) : (
          <button type="button" onClick={() => setI(0)} className="ghost">
            Start over
          </button>
        )}
      </div>
    </div>
  );
}
