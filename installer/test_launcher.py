"""Launcher contracts: no network, package manager, Docker or live credentials."""
import io
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import kekbot
from test_lifecycle import target

ROOT = Path(__file__).resolve().parent.parent
LAUNCHER = ROOT / "install.sh"
BASH = str(Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe") if os.name == "nt" else shutil.which("bash")
SHA = "a" * 40

# Replace transport only. Production always fetches the hardcoded official repo.
FAKE_GIT = r'''
git() {
  local argument command= last=
  for argument in "$@"; do
    case "$argument" in check-ref-format|init|fetch|rev-parse|ls-tree|cat-file) command=$argument ;; esac
    last=$argument
  done
  case "$command" in
    check-ref-format|init) return 0 ;;
    fetch) printf '%s\n' "$last" >> "$CALLS"; return "${FETCH_EXIT:-0}" ;;
    rev-parse) printf '%s\n' "$FAKE_SHA" ;;
    ls-tree)
      [[ "$last" != "${MISSING_FILE:-}" ]] || return 0
      printf '%s blob %s\t%s\n' "${FILE_MODE:-100644}" "$last" "$last" ;;
    cat-file)
      if [[ " $* " == *' -s '* ]]; then printf '100\n'; else cat "$PUBLIC_ROOT/$last"; fi ;;
    *) return 99 ;;
  esac
}
'''.rstrip()


class LauncherCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="kekbot-launcher-contract-")
        self.private = Path(self.temporary.name)
        self.environment = dict(os.environ, PUBLIC_ROOT=ROOT.as_posix(), FAKE_SHA=SHA, CALLS=(self.private / "calls").as_posix())

    def tearDown(self):
        self.temporary.cleanup()

    def shell(self, script, *arguments, environment=None):
        return subprocess.run([BASH, "-c", 'set -Eeuo pipefail; source "$1"; shift; ' + script, "contract", LAUNCHER.as_posix(), *arguments],
                              env=dict(self.environment, **(environment or {})), capture_output=True, text=True, timeout=30)


@unittest.skipUnless(BASH and Path(BASH).is_file(), "Bash is required; Linux CI always runs these contracts")
class LauncherContracts(LauncherCase):
    def test_help_syntax_and_unknown_options_do_not_probe_or_mutate_host(self):
        result = subprocess.run([BASH, "-n", str(LAUNCHER)], capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0)
        result = subprocess.run([BASH, str(LAUNCHER), "--help"], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--tool-commit", result.stdout)
        result = self.shell('platform_check() { exit 99; }; main "$@"', "--yes")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotEqual(result.returncode, 99)
        self.assertFalse((self.private / "calls").exists())

    def test_conflicting_and_dangerous_arguments_fail_before_host_work(self):
        for arguments in [("--release",), ("--branch", "main", "--stable"), ("status", "--branch", "main"),
                          ("--format", "image"), ("--pr", "2", "--format", "image"), ("--root", "relative"),
                          ("--root", "/"), ("--root", "/srv/../etc"), ("--check", "install"),
                          ("--setup", "--prepare-only"), ("--tool-pr", "3", "--tool-branch", "main")]:
            with self.subTest(arguments=arguments):
                result = self.shell('parse_args "$@"', *arguments)
                self.assertNotEqual(result.returncode, 0)

    def test_arguments_with_spaces_are_preserved_without_shell_evaluation(self):
        result = self.shell('parse_args "$@"; printf "%s\\n" "$root" "$app_value"',
                            "update", "--root", "/srv/kekbot demo", "--bundle", "/srv/public bundle;false")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.splitlines(), ["/srv/kekbot demo", "/srv/public bundle;false"])

    def test_tool_ref_validation_rejects_injection_and_resolves_exact_names(self):
        for kind, value in [("commit", "short"), ("branch", "--upload-pack=bad"), ("pr", "0"), ("release", "v1;bad")]:
            with self.subTest(kind=kind):
                result = self.shell(FAKE_GIT + '; parse_args --tool-' + kind + ' "$1"; tool_ref', value)
                self.assertNotEqual(result.returncode, 0)
        for kind, value, ref in [("commit", SHA, SHA), ("branch", "dev/beta", "refs/heads/dev/beta"), ("pr", "12", "refs/pull/12/head"), ("release", "v1.0.0", "refs/tags/v1.0.0")]:
            result = self.shell(FAKE_GIT + '; parse_args --tool-' + kind + ' "$1"; tool_ref; printf "%s" "$resolved_ref"', value)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout, ref)

    def test_download_stages_only_required_regular_files_and_cleans_up(self):
        script = FAKE_GIT + r'''; stage=; keep_stage=0; trap cleanup EXIT
parse_args --tool-commit "$1"; stage_tools
test -f "$tools/installer/core.py" && test -f "$tools/deploy/caddy/go.sum"
test -f "$tools/install.sh" && test ! -e "$tools/.git" && test ! -e "$tools/src"
printf 'VERIFIED\n'
'''
        result = self.shell(script, SHA)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("VERIFIED", result.stdout)
        directory = next(line.split(": ", 1)[1] for line in result.stdout.splitlines() if line.startswith("Review directory:"))
        # Use Bash path semantics on Windows too.
        self.assertEqual(self.shell('test ! -e "$1"', directory).returncode, 0)

    def test_failed_fetch_wrong_commit_missing_or_linked_files_never_execute(self):
        script = FAKE_GIT + '; stage=; trap cleanup EXIT; parse_args --tool-commit "$1"; stage_tools; printf EXECUTED'
        for environment in [{"FETCH_EXIT": "1"}, {"FAKE_SHA": "b" * 40}, {"MISSING_FILE": "installer/core.py"}, {"FILE_MODE": "120000"}, {"FILE_MODE": "160000"}]:
            with self.subTest(environment=environment):
                result = self.shell(script, SHA, environment=environment)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("KekBot:", result.stderr)
                self.assertNotIn("EXECUTED", result.stdout)

    def test_old_tool_without_launcher_can_still_be_prepared(self):
        result = self.shell(FAKE_GIT + '; stage=; trap cleanup EXIT; parse_args; stage_tools; test -f "$tools/installer/kekbot.py"', environment={"MISSING_FILE": "install.sh"})
        self.assertEqual(result.returncode, 0)

    def test_readiness_failure_reports_missing_requirements_without_setup(self):
        result = self.shell('python_ready() { return 1; }; docker() { return 1; }; host_report')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("NEED Python", result.stdout)
        self.assertFalse((self.private / "calls").exists())

    def test_setup_is_gated_by_platform_conflicts_and_confirmation(self):
        base = r'''require_root() { :; }; command() { if [[ "$*" == '-v docker' ]]; then return 1; else builtin command "$@"; fi; }
apt-get() { printf APT >> "$CALLS"; }; systemctl() { printf SERVICE >> "$CALLS"; }
prepare_docker_repo() { printf REPO >> "$CALLS"; }
'''
        for overrides in ['ubuntu_supported() { return 1; };',
                          "ubuntu_supported() { :; }; dpkg-query() { printf installed; };",
                          "ubuntu_supported() { :; }; dpkg-query() { return 1; }; answer() { REPLY=cancelled; };"]:
            result = self.shell(base + overrides + 'setup_host')
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((self.private / "calls").exists())

    def test_confirmed_setup_reuses_existing_docker_and_stops_on_package_failure(self):
        # Replace host effects, while running the real setup control flow.
        base = r'''require_root() { :; }; ubuntu_supported() { :; }; python_ready() { :; }
command() { if [[ "$*" == '-v docker' ]]; then return "${DOCKER_MISSING:-0}"; else builtin command "$@"; fi; }
dpkg-query() { return 1; }
answer() { REPLY='INSTALL PREREQUISITES'; }
prepare_docker_repo() { printf 'REPO\n' >> "$CALLS"; }
apt-get() { printf 'APT %s\n' "$*" >> "$CALLS"; if [[ " $* " == *' install '* && " $* " == *' docker-ce '* ]]; then return "${DOCKER_INSTALL_EXIT:-0}"; fi; }
systemctl() { printf 'SERVICE\n' >> "$CALLS"; }
host_report() { :; }
'''
        result = self.shell(base + 'setup_host')
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.private / 'calls'
        recorded = calls.read_text() if calls.exists() else ''
        self.assertNotIn('REPO', recorded)
        self.assertNotIn('SERVICE', recorded)
        for exit_code in ('0', '1'):
            calls.unlink(missing_ok=True)
            result = self.shell(base + 'setup_host', environment={'DOCKER_MISSING': '1', 'DOCKER_INSTALL_EXIT': exit_code})
            recorded = calls.read_text()
            self.assertIn('REPO', recorded)
            self.assertIn('docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin', recorded)
            self.assertEqual(result.returncode == 0, exit_code == '0')
            self.assertEqual('SERVICE' in recorded, exit_code == '0')


class LauncherWizardContracts(unittest.TestCase):
    def test_fixture_rehearsal_reaches_apply_for_accepted_and_candidate_bundles(self):
        from smoke import fixture_install_responses
        with tempfile.TemporaryDirectory(prefix="kekbot-rehearsal-contract-") as temporary:
            root = Path(temporary) / "installation"
            for accepted in (False, True):
                selected = target(kind="bundle", value="/synthetic/bundle", distribution="image", accepted=accepted,
                                  version="1.0.0" if accepted else "0.1.0-beta.2")
                answers = iter(fixture_install_responses("kekbot-test", selected).splitlines())
                # Bash consumes the local-tool trust; Python receives the rest.
                self.assertEqual(next(answers), "TRUST LOCAL")
                arguments = ["kekbot.py", "--action", "install", "--root", str(root),
                             "--source", "bundle", "--ref", "/synthetic/bundle", "--format", "image"]
                with self.subTest(accepted=accepted), patch.object(sys, "argv", arguments), patch.object(sys.stdin, "isatty", return_value=True), \
                     patch("builtins.input", side_effect=lambda _: next(answers)), patch("sys.stdout", new=io.StringIO()), \
                     patch.object(kekbot, "check_host"), patch.object(kekbot, "validate_root", return_value=root), \
                     patch.object(kekbot, "prepare_target", return_value=selected), patch.object(kekbot, "Installation") as engine, \
                     patch.object(kekbot, "next_steps") as next_steps:
                    # Exercise the real prompts and confirmations, with host effects isolated.
                    kekbot.main()
                    engine.return_value.install.assert_called_once()
                    self.assertEqual(engine.return_value.install.call_args.args[1], selected)
                    next_steps.assert_called_once()
                    self.assertIsNone(next(answers, None), "No shifted or unconsumed confirmation input")

    def test_source_prefill_retains_exact_trust_confirmation_and_final_review_boundary(self):
        for kind, ref, distribution in [("stable", "", "image"), ("release", "v0.1.0-beta.2", "source"),
                                        ("branch", "dev/beta", "source"), ("pr", "12", "source"),
                                        ("commit", SHA, "source"), ("bundle", "/srv/public bundle", "image")]:
            selection = dict(source=kind, ref=ref, format=distribution)
            with self.subTest(kind=kind), patch.object(kekbot, "prepare_target", return_value=target(kind=kind, value=ref, distribution=distribution)) as prepare, patch.object(kekbot, "confirm") as confirm, patch.object(kekbot, "choose", side_effect=AssertionError("Prefilled source must not change silently")), patch("sys.stdout", new=io.StringIO()):
                kekbot.source_selection(Path("/synthetic/stage"), selection)
                self.assertEqual(prepare.call_args.args[:3], (kind, ref, distribution))
                self.assertEqual(confirm.call_args.args[-1], "TRUST " + SHA[:12])

    def test_invalid_prefills_fail_before_host_checks(self):
        for arguments in [["--source", "branch"], ["--source", "stable", "--ref", "main"],
                          ["--source", "branch", "--ref", "main", "--format", "image"],
                          ["--format", "source"], ["--action", "uninstall", "--source", "stable"]]:
            with self.subTest(arguments=arguments), patch.object(sys, "argv", ["kekbot.py", *arguments]), patch.object(kekbot, "check_host") as host, patch("sys.stderr", new=io.StringIO()), self.assertRaises(SystemExit):
                kekbot.main()
            host.assert_not_called()


@unittest.skipUnless(os.name == "posix" and BASH, "Real terminal dispatch is exercised in Linux CI")
class LauncherTerminalContracts(LauncherCase):
    def terminal(self, body, responses, *arguments):
        from smoke import terminal_command
        script = 'set -Eeuo pipefail; source "$1"; shift; stage=; keep_stage=0; trap cleanup EXIT; ' + FAKE_GIT + r'''
platform_check() { :; }; require_root() { :; }; host_report() { :; }
python3() { printf '%s\n' "$@" >> "$CALLS"; }
''' + body + '\nmain "$@"'
        terminal_command([BASH, "-c", script, "terminal-contract", str(LAUNCHER), *arguments], responses, environment=self.environment, timeout=15)

    def test_downloaded_code_requires_exact_trust_and_cancel_never_executes(self):
        self.terminal('', 'q\n', 'install', '--tool-commit', SHA)
        self.assertEqual((self.private / "calls").read_text().splitlines(), [SHA])
        (self.private / "calls").unlink()
        self.terminal('', 'TRUST ' + SHA[:12] + '\n', 'update', '--root', '/srv/synthetic', '--tool-commit', SHA, '--branch', 'dev/beta')
        calls = (self.private / "calls").read_text().splitlines()
        self.assertIn('--action', calls)
        self.assertIn('update', calls)
        self.assertIn('--source', calls)
        self.assertIn('dev/beta', calls)

    def test_local_tool_selection_is_explicit_and_cancel_does_not_execute(self):
        self.terminal('', 'q\n', 'install', '--local-tools', str(ROOT))
        self.assertFalse((self.private / 'calls').exists())

    def test_installed_tools_are_offline_and_linked_or_writable_paths_are_rejected(self):
        root = self.private / "managed"
        (root / 'tool').mkdir(parents=True, mode=0o700)
        (root / 'installation.json').write_text('{}')
        for name in ('core.py', 'kekbot.py'):
            (root / 'tool' / name).write_text('# trusted synthetic manager\n')
        # Only ownership is simulated; real symlink and permission checks still run.
        ownership = r'''stat() { printf '0 '; command stat -c '%a' -- "${@: -1}"; }
'''
        self.terminal(ownership, '', 'status', '--root', str(root))
        calls = (self.private / 'calls').read_text().splitlines()
        self.assertNotIn(SHA, calls)  # No fetch.
        self.assertIn('status', calls)
        (root / 'tool/core.py').chmod(0o666)
        with self.assertRaises(Exception):
            self.terminal(ownership, '', 'status', '--root', str(root))
        (root / 'tool/core.py').chmod(0o600)
        (root / 'tool/core.py').unlink()
        (root / 'tool/core.py').symlink_to(root / 'tool/kekbot.py')
        with self.assertRaises(Exception):
            self.terminal(ownership, '', 'status', '--root', str(root))


if __name__ == "__main__":
    unittest.main()
