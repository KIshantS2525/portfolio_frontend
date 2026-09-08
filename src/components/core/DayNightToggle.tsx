import { PullCord } from 'pullcord';
import 'pullcord/pullcord.css';
import { useTheme } from '@/lib/useTheme';

/**
 * The theme switch, replaced. It used to be a miniature day/night landscape
 * scene (SVG horizon, orb, stars, clouds) sliding on a checkbox toggle. Now
 * it's a literal pull-cord: a Verlet-simulated rope hanging from the top of
 * the viewport that you grab and yank, exactly the way you'd turn off a
 * bedroom light.
 *
 * `pulled` is mirrored to `aria-pressed` by the component, so it's set to
 * "light" — light mode is the cord in its pulled-down state, dark is at rest.
 * `onPull` fires once per pull, at the point in the yank where a real pull
 * chain would click, not on release, so it can't fire twice on one tug.
 *
 * The component is position: fixed to the viewport on its own (that's the
 * whole point — it hangs from the ceiling, not from whatever row it's
 * rendered in), positioned via the --pullcord-top / --pullcord-right CSS
 * vars rather than normal layout. Nothing that used to render inline next to
 * it — the nav row, Admin's toolbar — needs to change; this still exports a
 * `DayNightToggle` component, it just doesn't sit in the flexbox flow now.
 */
export function DayNightToggle() {
  const [theme, setTheme] = useTheme();

  return (
    <PullCord
      pulled={theme === 'light'}
      onPull={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      ariaLabel={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="theme-pullcord"
    />
  );
}