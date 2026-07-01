import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { Download } from 'lucide-react';
import { GitHubIcon } from '@/components/icons/github';
import { DOWNLOAD_ROUTE, GITHUB_URL } from '@/lib/site';
import { cn } from '@/lib/utils';

const compactStars = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fullStars = new Intl.NumberFormat('en-US');

export function DocsSidebarCta({ stars }: { stars: number | null }) {
  return (
    <div className="flex gap-2">
      {/* Raw <a>, not next/link: DOWNLOAD_ROUTE is a 302 redirect handler, so
          next/link would prefetch it (firing the redirect, inflating download
          counts) and double-fetch on click. Mirrors DownloadButton. */}
      <a
        href={DOWNLOAD_ROUTE}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download for macOS"
        title="Download for macOS"
        className={cn(buttonVariants({ color: 'primary', size: 'sm' }), 'flex-1 gap-2')}
      >
        <Download className="size-4" aria-hidden="true" />
        Download
      </a>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Star on GitHub"
        title={stars != null ? `${fullStars.format(stars)} GitHub stars` : 'Star on GitHub'}
        className={cn(buttonVariants({ color: 'secondary', size: 'sm' }), 'flex-1 gap-2')}
      >
        <GitHubIcon className="size-4" />
        Star
        {stars != null ? (
          <span className="tabular-nums text-fd-muted-foreground">
            {compactStars.format(stars)}
          </span>
        ) : null}
      </a>
    </div>
  );
}
