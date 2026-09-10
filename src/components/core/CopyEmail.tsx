'use client';

import { useEffect, useState } from 'react';
import { useProfile } from '@/lib/useContent';

export function CopyEmail({ className = '' }: { className?: string }) {
  // The whole point of the component is the address, so this is the one that
  // mattered most: it was copying the build-time email to the clipboard.
  const profile = useProfile();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profile.email);
      setCopied(true);
    } catch {
      window.location.href = `mailto:${profile.email}`;
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`group inline-flex items-baseline gap-[12px] text-left ${className}`}
    >
      <span className="t-heading-sm text-bone transition-colors duration-200 group-hover:text-saffron">
        {profile.email}
      </span>
      <span
        aria-live="polite"
        className="t-caption shrink-0 text-ash transition-colors duration-200 group-hover:text-bone"
      >
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}