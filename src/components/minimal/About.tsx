import { Reveal } from '@/components/core/Reveal';
import { about, education, skills } from '@/lib/content';
import { useAchievements } from '@/lib/useContent';

export function About() {
  // `about`, `education` and `skills` are not in the admin tree, so they stay
  // compiled. Achievements are, so they must not.
  const achievements = useAchievements();
  return (
    <section id="about" className="shell scroll-mt-[96px] pt-[120px]">
      <Reveal>
        <h2 className="t-heading-lg text-bone">About</h2>
      </Reveal>

      <div className="mt-[36px] grid gap-[36px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-[96px]">
        <div>
          <Reveal delay={60}>
            <div className="max-w-[62ch] space-y-[18px]">
              {about.map((p, i) => (
                <p key={i} className="t-body text-mist">
                  {p}
                </p>
              ))}
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-[36px] space-y-[12px]">
              {education.map((e) => (
                <div key={e.qualification} className="flex flex-wrap items-baseline gap-x-[12px]">
                  <span className="t-heading-2xs text-bone">{e.qualification}</span>
                  <span className="t-caption text-ash">
                    {e.institution} — {e.period}, {e.result}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={180}>
            <ul className="mt-[36px] space-y-[6px]">
              {achievements.map((a) => (
                <li key={a.slug} className="t-body text-mist">
                  {a.detail}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={100}>
          <dl className="space-y-[18px]">
            {Object.entries(skills).map(([group, list]) => (
              <div key={group}>
                <dt className="t-caption text-saffron">{group}</dt>
                <dd className="t-body mt-[2px] text-mist">{list.join(', ')}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}