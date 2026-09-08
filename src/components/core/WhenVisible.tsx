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

export const useVisible = () => useContext(VisibleContext);

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
      <VisibleContext.Provider value={visible}>{seen ? children : null}</VisibleContext.Provider>
    </div>
  );
}
