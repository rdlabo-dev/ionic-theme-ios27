# Releasing the packages

`@rdlabo/capacitor-native-ui` and `@rdlabo/ionic-theme-ios27` share one release version. The root `package.json` is the release version source. The theme declares an exact version of Native UI; npm links the matching workspace during local development.

The release flow follows [capacitor-community/stripe](https://github.com/capacitor-community/stripe/blob/main/.github/workflows/release.yml): run the root release command, synchronize workspace versions in GitHub Actions, build, then publish each workspace with `npm publish --workspace`. Native UI is listed first so it is published before the theme that depends on it. There is no custom archive builder.

## npm setup

Each npm package needs its own GitHub Actions Trusted Publisher configuration:

- Organization: `rdlabo-dev`
- Repository: `ionic-theme-ios27`
- Workflow filename: `release.yml`
- Environment: leave empty
- Allow direct `npm publish`

The workflow uses `id-token: write` and npm provenance. No npm publishing token is required after Trusted Publishing is configured for both packages.

For a new native package's initial manual publication, run `npm publish` from `packages/capacitor-native-ui`. Its Capacitor-style `prepublishOnly` hook cleans, generates API documentation and builds the package. Subsequent coordinated releases use the workflow below.

## Versioned release

From an up-to-date, clean `main`, run the root `npm run release` and choose the version increment. You can also pass an increment, such as `npm run release -- premajor` for the next major prerelease. The root npm configuration creates tags named `ios27-v<VERSION>`.

Pushing that tag starts `release.yml`, which:

1. Checks the tag version against the root version.
2. Updates the theme's exact Native UI dependency, both workspace versions, and the root/demo lockfiles.
3. Builds both workspaces.
4. Commits the synchronized version metadata back to the default branch using a normal, non-force push.
5. Validates both workspace versions and the theme dependency, then publishes Native UI followed by the theme with `npm publish --workspace`.

Stable versions use `latest`; prerelease tags use `next`. Release jobs are serialized. npm lifecycle hooks run during workspace publication, including Native UI's `prepublishOnly` build.

npm cannot publish both packages atomically. Before retrying a failed release, check which versions reached npm. If neither was published, the same workflow can be rerun after resolving the failure. If one was published, use a new shared version; the versioned workflow does not skip existing versions. Never overwrite a published package version.

## Beta releases

The `/beta` PR command and automatic post-merge beta flow publish both packages with the same immutable version under `beta`. Required CI must pass before publication. The Package Candidate workflow reads the root base version, updates the workspace versions and theme dependency, builds, and creates artifacts with standard `npm pack --workspaces --ignore-scripts`.

Beta publication downloads those verified CI archives and never executes their scripts. Both archives and registry versions are checked before either publication. An existing beta is skipped only when its archive integrity matches, allowing a partial beta publication to be retried. The legacy `ios26` branch continues to publish only its own theme package.

Changes to release-gating workflows intentionally disable beta publication for that PR and its merge. Validate those changes with `npm run test:release`; a subsequent eligible change or version tag can use the updated workflow.

`npm run test:release` checks versioned workspace publication and beta archive publication against a fake npm executable; it never publishes packages. `npm run test:packages` verifies the contents and consumer-facing imports of archives produced by standard npm packing.
