### Checking your work

Do not run pnpm build or dev to check your work. I'm running a live server and doing next build will interrupt my workflow. Instead you can just check types by doing pnpm exec tsc --noEmit 2>&1

### Format

When you change files in client, make sure to run `pnpm run format` in the client directory.

### Commits

Do not include Co-Authored-By lines in commits.
