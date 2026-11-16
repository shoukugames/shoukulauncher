# Code signing with SignPath Foundation

Windows shows "Unknown publisher" / "Windows protected your PC" for unsigned programs.
[SignPath Foundation](https://signpath.org/) signs open-source projects for free; the signing key
stays on their servers, so no hardware is needed.

The workflow in [`.github/workflows/windows.yml`](../.github/workflows/windows.yml) is ready. It
builds unsigned until the steps below are done, then signs automatically:

1. `shoukugames.exe` is built with full version info (`--app-only`).
2. SignPath signs `shoukugames.exe`.
3. The ZIP and MSI are built from the signed app folder (`--package-only`), so both contain the
   signed program.
4. SignPath signs the MSI.
5. `npm run check` verifies everything; on a `win-v*` tag the files are published as a GitHub release.

## One-time setup

1. **Apply** at <https://signpath.org/apply> with the repository
   `https://github.com/shoukugames/shoukulauncher`. The README's
   [Code signing policy](../README.md#code-signing-policy) section is what they look for.
2. When approved, in the SignPath web app:
   - Create (or use the provided) **project** with slug `shoukulauncher`.
   - Link **GitHub.com** as the project's trusted build system.
   - Add two **artifact configurations**, pasting the files from
     [`.signpath/artifact-configurations/`](../.signpath/artifact-configurations/):
     slug `app-exe` (from `app-exe.xml`) and slug `msi` (from `msi.xml`).
   - Check the **signing policy** slug. The workflow uses `release-signing`; if yours differs, set
     the repository variable `SIGNPATH_SIGNING_POLICY_SLUG`.
   - Create a **CI user**, give it submitter rights on the signing policy, and copy its API token.
3. On GitHub, in **Settings → Secrets and variables → Actions**:
   - Secret `SIGNPATH_API_TOKEN`: the CI user's token.
   - Variable `SIGNPATH_ORGANIZATION_ID`: shown in SignPath under your organization settings.
4. **Release**: bump `windowsVersion` in `package.json`, commit, then
   `git tag win-v<version> && git push origin win-v<version>`. Depending on the signing policy, an
   approver may need to approve the request in SignPath before the job continues.

To test without releasing, use **Actions → Windows build → Run workflow**; the files appear as a
build artifact named `windows-signed` (or `windows-unsigned` before setup).

## The games

The same SignPath organization can sign the 22 games' Windows builds. Each game repository needs
its own SignPath project (or artifact configuration) and a signing step in its own release
workflow, the same pattern as above: upload the `.exe` as an artifact, submit it with
`signpath/github-action-submit-signing-request`, then publish the signed file.
