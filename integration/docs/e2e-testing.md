# E2E screenshot testing

This maintainer guide explains how to run the Playwright visual-regression suite for the iOS26 demo. The suite covers every entry declared in `demo/e2e/screenshot.spec.ts` in both light and dark modes. Overlay variants are generated from the shared arrays in `demo/src/app/overlay-types.ts`.

## Run the suite

Install the demo dependencies first:

```bash
cd demo
npm install
```

Then choose the command that matches the task:

```bash
npm run test:e2e          # Run the suite
npm run test:e2e:ui       # Open Playwright UI mode
npm run test:e2e:debug    # Run with the Playwright debugger
npm run test:e2e:update   # Regenerate intentional baseline changes
```

To reproduce the Linux environment used by CI, run the Docker variants from `demo/`:

```bash
npm run test:e2e:docker
npm run test:e2e:docker:update
```

The Docker commands use the Playwright image pinned in `demo/package.json`.

## Review a failure

A screenshot mismatch can be a regression or an intentional visual change. Before updating a baseline:

1. Inspect the actual, expected, and diff images in `demo/test-results/`.
2. Check the affected route in both light and dark modes.
3. Confirm that the component change is intentional.
4. Regenerate the baseline with `npm run test:e2e:update`, or use the Docker variant when matching CI rendering.

The HTML report is written to `demo/playwright-report/` and can be opened with:

```bash
npx playwright show-report
```

## Add coverage

When adding a demo route or overlay variant, update `demo/e2e/screenshot.spec.ts` and regenerate the relevant baselines. Commit baseline changes only after reviewing the visual diff.

Pull requests targeting `main` or `ios26` run the E2E workflow in `.github/workflows/e2e-pull_request.yml`; pushes to either branch run `.github/workflows/e2e-main.yml`. GitHub builds the pull-request merge ref against its target branch, so an `ios26` pull request starts with the iOS 26 snapshots. Snapshot changes intentionally committed by the pull request are then tested as part of that merge result. The `/update-screenshots` command loads its update procedure from the pull request's target branch and commits the regenerated screenshots to the pull request branch.
