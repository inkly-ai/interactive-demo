# Contributing

Thanks for helping. A few ground rules keep this repo easy to work in.

## Developer Certificate of Origin

Every commit must be signed off (`git commit -s`), which adds a
`Signed-off-by:` trailer certifying the [Developer Certificate of Origin](https://developercertificate.org/).
There is no contributor license agreement.

## Commits

- One concern per commit, in the [Conventional Commits](https://www.conventionalcommits.org/) style:
  `feat(runtime): ...`, `fix(cli): ...`, `docs: ...`, `chore: ...`, `test(editor): ...`.
- Keep the history readable: squash fix-ups before opening a pull request.

## Checks

Every pull request runs type-checking, linting and the test suite:

```sh
npm install
npm run typecheck
npm run lint
npm test
```

Ported code keeps its existing formatting; do not reformat files you are not otherwise changing.

## Releases

Both published packages are released by tag, from `main`, by the
`publish-runtime` and `publish-cli` workflows. Nothing publishes on a push.

Release the runtime **before** the CLI — the CLI depends on
`@inkly-org/interactive-demo` by range, and its workflow refuses to ship a CLI
whose runtime dependency is not on the registry yet.

```sh
# 1. Bump packages/runtime/package.json, commit, then:
git tag runtime-v0.1.0 && git push origin runtime-v0.1.0

# 2. Once that is published, bump packages/cli/package.json (and its
#    @inkly-org/interactive-demo range if it changed), commit, then:
git tag cli-v0.1.0 && git push origin cli-v0.1.0
```

The tag version must match the package version or the workflow fails before
publishing. npm versions are immutable, so a re-cut needs a new patch version
and a new tag — never move a tag. Both workflows can also be run from the
Actions tab (`workflow_dispatch`) with the version typed in, which is how the
first publish of each package is done.

Each workflow re-runs the full build, typecheck, lint and test suite, checks
that the tarball actually contains its build output, and refuses to overwrite
a version that already exists on npm.

### One-time setup

There is no publish secret to hold or rotate. Both packages authenticate with
[trusted publishing](https://docs.npmjs.com/trusted-publishers): the registry
trusts this repository over OIDC, which is why the workflows ask for
`id-token: write` and set `NODE_AUTH_TOKEN` empty — any token in the
environment shadows OIDC and the publish fails with a misleading 404.

It is configured already. Each package's Trusted Publisher, under Settings on
npmjs.com, names this repository, its own workflow filename
(`publish-runtime.yml` or `publish-cli.yml`) and no environment, with **Allow
`npm publish`** checked — the default grants only `npm stage publish`, which
would reject the direct publish the workflows do. Changing either workflow's
filename breaks publishing until the connection is updated to match.

Provenance is attested automatically. It needs the repository to be public and
each package's `repository.url` to point at it, so those fields are load
bearing rather than decorative.
