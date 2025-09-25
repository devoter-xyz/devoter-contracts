# Security Policy

This document describes how to report security vulnerabilities, the scope of the program, how reports are handled, and the expected timelines for response and disclosure for the devoter-contracts repository.

## Summary

- Repository: devoter-contracts
- Location of main code: `contracts/` (Solidity smart contracts) and supporting scripts in `scripts/` and `ignition/modules/`.
- Preferred reporting channels: GitHub Security Advisories, or by email to security@devoter.xyz (see note on assumptions below).

If you have discovered a security vulnerability, please report it through one of the channels below. Do not create a public issue or otherwise disclose the vulnerability publicly before it has been addressed.

## Assumptions

1. This repository does not currently publish a dedicated PGP key or a dedicated security email in the repo. For the purposes of this policy file we assume an email of `security@devoter.xyz`. If that is incorrect, maintainers should update this file with the correct contact information and/or provide a PGP key for secure reports.
2. The preferred private disclosure mechanism is the GitHub Security Advisory for this repository. If you cannot use that facility, use the email above.

## How to report a vulnerability

Preferred: create a GitHub Security Advisory for this repository and mark it private, following GitHub's process.

Secondary: send a direct email to security@devoter.xyz with the following information:

- Affected component(s) and path (for example `contracts/DEVoterEscrow.sol`).
- A clear, concise description of the vulnerability and impact.
- Reproduction steps or a minimal test case that demonstrates the issue.
- Suggested mitigation or patch (if available).
- Your PGP public key (optional) if you would like communications encrypted — see "PGP encryption" below.

If you are unable to share PoC code in the initial message, provide enough detail to confirm the issue exists and we will coordinate next steps.

## PGP encryption

If you want to send sensitive exploit PoC data encrypted, please request the maintainer's public PGP key by email. At the time this file was created there is no PGP key published in the repository; maintainers should add a key block or a fingerprint here if they want researchers to encrypt sensitive data.

Example (how to send encrypted content):

1. Request the project's PGP key/fingerprint.
2. Encrypt your report with the project's public key (e.g., `gpg --encrypt --recipient <fingerprint> -o report.gpg report.txt`).
3. Attach the encrypted file to your email.

## What we need from reporters

To investigate and fix the issue efficiently, please provide:

- Clear reproduction steps or a minimal test/PoC.
- Expected and actual behavior.
- Exploitability assumptions (e.g., attacker with on-chain state only, attacker who can call a function, attacker who controls a transaction origin, etc.).
- Any suggested remediation if you have one.

Providing an actual test case (for example a Truffle/Hardhat or Foundry script) saves time and helps with prioritization.

## Vulnerability handling process

1. Acknowledgement: we will acknowledge receipt of a valid report within 48 hours of receipt via the same channel it was sent.
2. Triage: we will triage reports and assign a severity and a maintainer within 7 calendar days.
3. Fixing: maintainers will work to produce a fix, mitigation, or mitigation guidance. Critical fixes will be prioritized and, where appropriate, we will coordinate with downstream integrators.
4. Disclosure: we will coordinate a public disclosure timeline with the reporter. If no timeline is agreed, we will follow the timeline in the "Disclosure timeline" section below.

During the process we may ask for additional information or request a short embargo to implement and test a fix before public disclosure.

## Response time and SLAs

- Acknowledgement: within 48 hours.
- Initial triage & severity assignment: within 7 days.
- Patch / mitigation timeline: varies by severity and complexity. For Critical issues we aim to provide either a patch or clear mitigations within 14 days where practical.

These are targets, not guarantees. If we miss a target we will communicate updated timelines.

## Severity classification (examples)

We use the following high-level categories to guide prioritization. Concrete classification may depend on on-chain conditions and exploitability.

- Critical: Funds-loss or complete protocol compromise (e.g., arbitrary token withdrawal, governance takeover allowing theft, reentrancy that leads to immediate loss of funds).
- High: Vulnerabilities that can lead to significant loss under realistic conditions or permit large-scale misuse (e.g., permissioning bypass, severe logic flaws in accounting).
- Medium: Vulnerabilities that require strong attacker assumptions or are limited in impact (e.g., possible front-running, edge-case DoS that requires unusual conditions).
- Low: Minor issues or information leakage with limited practical impact.
- Informational: Coding style, gas-optimization suggestions, or minor clarity issues that do not affect correctness or security.

## Scope

In-scope:

- All code and artifacts in this repository, including but not limited to `contracts/`, `scripts/`, `deploy/`, `ignition/modules/`, and the test suite.

Out-of-scope:

- Third-party dependencies and services unless the issue arises from interaction between this code and an upstream component and the root cause is in this repository.
- Social-engineering attacks (phishing, account takeovers) that do not meaningfully involve code vulnerabilities in this repository.

If you are unsure whether something is in-scope, report it and we will clarify.

## Safe harbor

We welcome responsible disclosure. If you follow this policy and act in good faith to avoid privacy violations, data destruction, or interruption of service, we will not pursue legal action against you for the good-faith discovery and reporting of vulnerabilities.

Do not exploit vulnerabilities for financial gain, attempt to steal funds, or otherwise act maliciously. If you have already discovered a vulnerability and need a safe channel to report it, use the contact channels above and indicate the sensitivity.

## Disclosure timeline

If we cannot agree on a timeline with the reporter, the default disclosure schedule is:

- 0–7 days: Acknowledgement and initial triage.
- 7–30 days: Active remediation and patch deployment (or coordinated mitigation plan), depending on severity.
- 30–90 days: Public disclosure after patch release or mitigation, unless the vulnerability is critical and earlier disclosure is required to protect users (in which case the reporter will be consulted).

The timelines above may be extended in coordination with the reporter or when additional coordination with third parties is required.

## Reporting a fix / submitting a PR

If you can propose a patch, please submit a pull request against this repository and mark it as a draft if you wish to keep it private while maintainers review. Do not push exploit PoC code to the public PR; instead attach PoC to the private advisory or provide it directly to maintainers via the secure channel.

## Recognition and credits

We appreciate the work of security researchers. With explicit permission from the reporter we will acknowledge and credit researchers in our public advisories. If you prefer to remain anonymous, tell us when you report the issue.

## Legal and contact notes

This policy is not a contract and does not provide legal advice. It is intended to communicate intent and expectations for responsible disclosure. If you need legal confirmation of safe-harbor provisions, please consult legal counsel.

Maintainers: please update this file with a verified contact email address and, if desired, a PGP public key or fingerprint so researchers can encrypt sensitive data.

---

Last updated: 2025-09-25
