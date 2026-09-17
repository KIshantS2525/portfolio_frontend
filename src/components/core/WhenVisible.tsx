// src/components/core/WhenVisible.tsx
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Freezes requestAnimationFrame work when it leaves the viewport.
 *
 * Every animating component on this site calls useVisible() and halts its own
 * loop when it reads false. Three marquee rows animating at the bottom of the
 * page while someone reads the hero is the single most common reason portfolios
 * like this go laggy.
 */
const VisibleContext = createContext(true);

/**
 * Set by <FrozenVisibility>. While true, every WhenVisible inside reports "not
 * visible" no matter what its observer says.
 */
const FrozenContext = createContext(false);

export const useVisible = () => useContext(VisibleContext);

/**
 * Stops every animation beneath it, permanently, including ones inside nested
 * <WhenVisible> boundaries.
 *
 * Exists for the Collapse World poster (CollapsePoster.tsx), which renders the
 * real homepage sections a second time as a sheet of paper that gets thrown
 * across the screen. Every animated component here already halts its own loop
 * when `useVisible()` is false — so "freeze this subtree" is just "tell them
 * all they are off screen".
 *
 * It has to reach THROUGH nested WhenVisibles, not just set the context once.
 * Stack wraps its marquees in its own WhenVisible, and inside the poster that
 * observer does fire — late, mid-recede, as the shrinking sheet brings the
 * section into the viewport. Without the override the marquees would start
 * scrolling halfway through the throw, and the poster's texture (captured at
 * the click) would no longer match the sheet it replaces at impact.
 */
export function FrozenVisibility({ children }: { children: ReactNode }) {
  return (
    <FrozenContext.Provider value={true}>
      <VisibleContext.Provider value={false}>{children}</VisibleContext.Provider>
    </FrozenContext.Provider>
  );
}

export function WhenVisible({
  children,
  rootMargin = '200px',
  /** Don't render children at all until first seen. For heavy subtrees. */
  defer = false,
  className,
}: {
  children: ReactNode;
  rootMargin?: string;
  defer?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frozen = useContext(FrozenContext);
  const [visible, setVisible] = useState(false);
  const [seen, setSeen] = useState(!defer);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setSeen(true);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className}>
      <VisibleContext.Provider value={visible && !frozen}>{seen ? children : null}</VisibleContext.Provider>
    </div>
  );
}