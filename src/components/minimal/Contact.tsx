import { Reveal } from '@/components/core/Reveal';
import { CopyEmail } from '@/components/core/CopyEmail';
import { useProfile } from '@/lib/useContent';

export function Contact() {
  const profile = useProfile();

  return (
    <section id="contact" className="shell scroll-mt-[96px] pt-[120px]">
      <Reveal>
        <h2 className="t-heading-lg text-bone">Contact</h2>
      </Reveal>

      <Reveal delay={60}>
        <p className="t-body mt-[18px] max-w-[46ch] text-mist">
          {profile.availability} The fastest way to reach me is email.
        </p>
      </Reveal>

      <Reveal delay={120}>
        <div className="mt-[36px] space-y-[18px]">
          <CopyEmail />
          <div className="flex flex-wrap gap-x-[36px] gap-y-[12px]">
            <a
              href={profile.github}
              target="_blank"
              rel="noreferrer"
              className="t-heading-2xs text-ash transition-colors duration-200 hover:text-bone"
            >
              GitHub
            </a>
            <a
              href={profile.linkedin}
              target="_blank"
              rel="noreferrer"
              className="t-heading-2xs text-ash transition-colors duration-200 hover:text-bone"
            >
              LinkedIn
            </a>
            <a
              href={profile.liveProject}
              target="_blank"
              rel="noreferrer"
              className="t-heading-2xs text-ash transition-colors duration-200 hover:text-bone"
            >
              diagramstudio.in
            </a>
            <a
              href={`tel:${profile.phone.replace(/\s/g, '')}`}
              className="t-heading-2xs text-ash transition-colors duration-200 hover:text-bone"
            >
              {profile.phone}
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}