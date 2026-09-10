import { useProfile } from '@/lib/useContent';

export function Footer() {
  const profile = useProfile();

  return (
    <footer className="shell pb-[60px] pt-[96px]">
      <div className="hairline mb-[24px]" />
      <div className="flex flex-wrap items-baseline justify-between gap-[12px] t-caption text-ash">
        <p>
          Built by Ishant.{' '}
          <a
            href={profile.github}
            target="_blank"
            rel="noreferrer"
            className="text-saffron transition-opacity hover:opacity-70"
          >
            Source on GitHub.
          </a>
        </p>
        <p>{profile.location}</p>
      </div>
    </footer>
  );
}