import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { GHID_LIST, GHID_RELATED, type GhidEntry } from '../../lib/ghidIndexSchemas';

interface GhidRelatedGuidesProps {
  /** The current guide's path (e.g. "/ghid/declaratie-unica-trading212"), used to look up its related guides. */
  currentPath: string;
}

/**
 * "Ghiduri conexe" cross-link block rendered at the bottom of each /ghid spoke page.
 * Builds an internal topic cluster: real crawlable <Link> anchors (not JS-only buttons)
 * with the related guide's title as descriptive anchor text. Romanian-only, matching the
 * hardcoded-RO convention of the guide pages. Renders nothing if no related guides are mapped.
 */
export default function GhidRelatedGuides({ currentPath }: GhidRelatedGuidesProps) {
  const related: GhidEntry[] = (GHID_RELATED[currentPath] ?? [])
    .filter((path) => path !== currentPath)
    .map((path) => GHID_LIST.find((g) => g.path === path))
    .filter((g): g is GhidEntry => Boolean(g));

  if (related.length === 0) return null;

  return (
    <section aria-labelledby="ghiduri-conexe" className="mt-12 pt-8 border-t border-gray-200 dark:border-navy-700">
      <h2 id="ghiduri-conexe" className="text-xl font-bold mb-4">
        Ghiduri conexe
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {related.map((g) => (
          <Link
            key={g.path}
            to={g.path}
            className="block p-4 border border-gray-200 dark:border-navy-700 rounded-xl hover:border-accent dark:hover:border-accent-light hover:bg-accent/5 dark:hover:bg-accent/10 transition-colors group"
          >
            <h3 className="text-sm font-semibold mb-1 group-hover:text-accent dark:group-hover:text-accent-light transition-colors">
              {g.title}
            </h3>
            <span className="inline-flex items-center gap-1 text-xs text-accent dark:text-accent-light font-medium">
              Citește ghidul <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
