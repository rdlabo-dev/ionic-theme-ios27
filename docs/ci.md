# CI and test reports

Pull requests run lint, package validation, and Ionic 8/9 browser tests. Metadata edits do not start new runs. When retargeting a PR to a different release branch, push the rebased/updated head to validate against that branch. New test runs cancel older jobs for the same PR, Ionic version and shard.

## Browser tests

PRs run Ionic 8 screenshot coverage in one job and the full Ionic 9 suite in two Playwright shards. Main-branch runs split the full suite for each Ionic version into two shards. Sharding preserves the test set and the existing worker count per runner; it adds runners rather than increasing contention within a runner.

Ionic 9 PR shards upload blob reports. A merge job requires both shards, then produces the HTML report and JSON used in the PR result comment. Failed tests remain failed CI checks even when report generation succeeds. Artifacts expire after three days and reruns replace artifacts with the same name.

The E2E jobs do not restore/save the old shared npm cache. In the measured PR #299 run, cache restore/save took about 53–56 seconds per runner, in addition to dependency installation. Compare complete job duration on subsequent runs before reintroducing caching. npm installation skips audit/funding requests in these test jobs.

## GitHub Pages retention

The report publisher and close-event cleanup share one repository-wide concurrency group. Each execution fetches the current gh-pages tree and open PR list, removes every closed PR's `pr-<number>` directory, and publishes the complete remaining tree. An API failure stops the operation before deleting reports. An old PR head cannot replace a newer head's report.

`keep_files: false` is intentional: removed directories must disappear from the published branch. `force_orphan: true` retains only the current report commit instead of accumulating screenshot history. Open PR reports stay available; closing a PR removes its report. If a cleanup execution is superseded, the next report operation also removes all closed PR reports.

GitHub Pages deployment is asynchronous and has its own workflow status. The PR comment links to the report and states that it becomes available after that deployment. E2E checks do not poll Pages URLs or fail because Pages deployment takes longer than five minutes.

Both main and ios26 can write gh-pages. Keep their report retention and concurrency settings aligned when backporting workflow changes.

Validate workflow syntax with `actionlint` and retention behavior with `node --test scripts/report-retention.test.mjs`. Retention tests execute the workflow's pruning code against local directories and a mock GitHub API; they do not modify the remote branch.
