const REPO_URL = 'https://git.26fe.uk/stue/sell-my-stuff';

// Baked in at image build time (see Dockerfile's GIT_COMMIT build arg,
// set from the CI workflow's ${{ gitea.sha }}) so the deployed footer
// always names the exact commit currently running, without a rebuild.
export function Footer() {
  const commit = process.env.GIT_COMMIT;
  const shortCommit = commit ? commit.slice(0, 7) : null;

  return (
    <footer className="border-t border-border/70 px-4 py-4 text-center text-xs text-muted-foreground sm:px-7 lg:px-10">
      {shortCommit ? (
        <a
          href={`${REPO_URL}/commit/${commit}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono tabular-nums underline-offset-2 hover:underline"
        >
          {shortCommit}
        </a>
      ) : (
        <span>dev build</span>
      )}
    </footer>
  );
}
