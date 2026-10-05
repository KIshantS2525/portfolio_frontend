// frontend/src/components/minimal/Stack.tsx
import { Reveal } from '@/components/core/Reveal';
import { Marquee } from '@/components/core/Marquee';
import { WhenVisible } from '@/components/core/WhenVisible';
import { useStackRows } from '@/lib/useContent';

export function Stack() {
  const stackRows = useStackRows();
  return (
    <section className="pt-[120px]">
      <div className="shell">
        <Reveal>
          <h2 className="t-heading-lg text-bone">Stack</h2>
        </Reveal>
      </div>

      <WhenVisible rootMargin="240px" className="mt-[36px] space-y-[24px]">
        {stackRows.map((row, i) => (
          <div key={row.label}>
            <p className="shell t-caption mb-[6px] text-ash">{row.label}</p>
            <Marquee items={row.items} reverse={i % 2 === 1} speed={38 + i * 6} />
          </div>
        ))}
      </WhenVisible>
    </section>
  );
}
