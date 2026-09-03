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
