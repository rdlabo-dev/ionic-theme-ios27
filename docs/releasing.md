# Releasing the packages

`@rdlabo/capacitor-native-ui` and `@rdlabo/ionic-theme-ios27` share one release version. The root `package.json` is the version source. The published theme depends on that exact native package version; the local `file:../capacitor-native-ui` dependency is rewritten only in the packed archive.

The versioning flow follows [capacitor-community/stripe](https://github.com/capacitor-community/stripe/blob/main/.github/workflows/release.yml): use the root release command, synchronize every workspace to the tag version, build the workspaces, then publish the complete set. Workspaces are listed explicitly with Native UI first. This repository publishes packed archives so the theme’s local dependency becomes an exact registry version.

## npm setup

Each npm package needs its own GitHub Actions Trusted Publisher configuration:

- Organization: `rdlabo-dev`
- Repository: `ionic-theme-ios27`
- Workflow filename: `release.yml`
- Environment: leave empty
- Allow direct `npm publish`

The workflow uses `id-token: write` and npm provenance. No npm publishing token is required after Trusted Publishing is configured for both packages.

The native package's first manual publication can be performed from `packages/capacitor-native-ui` with `npm publish`. Its `prepublishOnly` hook cleans, generates API documentation and builds the package. Do not publish the theme directly from its workspace: use the release workflow so its local native dependency is replaced with the shared registry version.

## Versioned release

From an up-to-date, clean `main`, run the root `npm run release`. Choose a new shared version; both packages already use `1.2.1`, so the next patch release is `1.2.2`. The root npm configuration creates tags named `ios27-v<VERSION>`.

Pushing that tag starts `release.yml`, which:

1. Checks the tag version against the root version.
2. Synchronizes both workspace manifests and the root/demo lockfiles.
3. Builds and packs both packages with the shared version and exact native dependency.
4. Commits the synchronized version metadata back to the default branch using a normal, non-force push.
5. Checks both archives and existing registry versions before publishing the native package, then the theme.

Stable versions use `latest`; prerelease tags use `next`. Release jobs are serialized. Published versions cannot be overwritten: choose a new version if the existing archive differs.

## Beta releases

The existing `/beta` PR command and automatic post-merge beta flow publish both packages with the same immutable version, such as `1.2.2-beta.pr298.sha0123456789ab`, under `beta`. Required CI must pass before publication. The archive builder and authorization step both read the base version from the root `package.json`.

Beta publication downloads the verified CI archives and never executes their scripts. Both archives and registry versions are checked before either publication. The legacy `ios26` branch continues to publish only its own theme package.

Changes to release-gating workflows intentionally disable beta publication for that PR and its merge. Validate those changes with `npm run test:release`; a subsequent eligible change or version tag can use the updated workflow.

## Retry after a partial publication

npm cannot publish two packages atomically. If native publication succeeds but theme publication fails, rerun the failed workflow using the same source/version. An existing package is skipped only when its archive integrity matches. Authentication/network errors and content mismatches fail the job instead of being treated as unpublished versions.

`npm run test:release` exercises publication order, matching versions, registry failures and partial-release retries against a fake npm registry; it does not publish packages.
