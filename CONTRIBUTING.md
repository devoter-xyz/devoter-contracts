# Contributing

Thanks for your interest in contributing to this project! The following guidelines will help you get set up and make useful contributions quickly.

## Quick start

1. Fork the repository and clone your fork:

```bash
git clone https://github.com/<your-username>/devoter-contracts.git
cd devoter-contracts
```

2. Install dependencies:

```bash
npm install
```

3. Run the test suite:

```bash
# run with npm script if available
npm test

# or with hardhat directly
npx hardhat test
```

4. Run linters / formatters if configured:

```bash
npm run lint     # if an eslint script exists
npm run format   # if a prettier/format script exists
```

If anything above is missing from the repository (scripts or tools), try the equivalent direct command (for example `npx hardhat test`).

## What to work on

- Check the `docs/` and `test/` folders for open ideas and existing tests.
- If you plan a larger change, open an issue first to discuss design and scope.

## Branching and pull requests

- Create a descriptive branch from the default branch (usually `main`):

```bash
git checkout -b feat/<short-description>
```

- Make small, focused commits. Keep each PR scoped to a single concern.
- Push your branch and open a pull request against `main`.

When opening a PR, include:

- A short description of the change and motivation.
- Any breaking changes and migration steps.
- A summary of tests you added or ran.

Use the PR checklist below to improve the review flow.

## Pull request checklist

- [ ] Branch name is descriptive.
- [ ] PR description explains why the change is needed.
- [ ] Tests added or updated (unit/integration where relevant).
- [ ] All tests pass locally (`npx hardhat test`).
- [ ] Lint and format checks run cleanly.
- [ ] No secrets or private keys are included.

## Tests

We require automated tests for bug fixes and new features. Add tests under the `test/` directory. Tests in this repository use Hardhat and TypeScript — follow existing test patterns.

Run tests locally with:

```bash
npx hardhat test
```

If tests are flaky, include notes in the PR and try to make them deterministic.

## Commit messages

We recommend clear, imperative commit messages. A conventional format example:

```
feat(contract): add voting power cap
fix(escrow): prevent reentrancy in withdraw
docs: update README
```

Use short title lines (<=72 chars) and a body when more detail is needed.

## Code style and Solidity guidelines

- Follow existing project conventions for TypeScript and Solidity code.
- Prefer OpenZeppelin audited contracts and libraries where appropriate.
- Add NatSpec comments for public/external functions and events.
- Be explicit about visibility and use immutable/constant where applicable.

Security-first mindset: think about reentrancy, integer over/underflow, access control, and input validation.

## Reporting security issues

If you discover a security vulnerability, please do not open a public issue. Instead reach out privately to the maintainers. If you need an email address, check the `README.md` or the project maintainer's contact on the repository.

## Code reviews

All contributions will be reviewed. Reviews focus on correctness, tests, documentation, and security. Be responsive to review comments and be prepared to split large PRs into smaller ones if requested.

## Contributor license and license file

By contributing, you accept that your contributions will be licensed under this repository's license (see `LICENSE`). If the project requires a CLA, the maintainers will let you know.

## Questions

If you have questions, open an issue with the `discussion` label or contact the maintainers via the channels listed in `README.md`.

Thank you for helping improve the project!
