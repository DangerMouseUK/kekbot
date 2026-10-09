"""Offline tests: no Docker daemon, GitHub traffic or provider accounts required."""
import contextlib
import errno
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import core
import kekbot

SHA = "a" * 40
IMAGE = "sha256:" + "b" * 64
OLD_IMAGE = "sha256:" + "c" * 64


def target(**overrides):
    return dict(dict(kind="branch", value="main", distribution="source", sourceRef=SHA, version="0.1.0-dev.0", source="/synthetic/source", image=None, accepted=False), **overrides)


def state(**overrides):
    return dict(dict(format="kekbot-installation", version=1, id="a" * 32, status="ready", data="data", imageId=OLD_IMAGE,
                     options=core.validate_options("kekbot-test", "fixture", "local", "http://127.0.0.1:3210", 3210, "user"),
                     target={key: target()[key] for key in ("kind", "value", "distribution", "sourceRef", "version", "accepted")}, previous=None), **overrides)


def archive(path, members=None, version="0.1.0-dev.0"):
    with tarfile.open(path, "w:gz") as output:
        for name, contents, kind in members or [("kekbot/Dockerfile", b"FROM scratch", tarfile.REGTYPE), ("kekbot/package.json", json.dumps({"version": version}).encode(), tarfile.REGTYPE)]:
            entry = tarfile.TarInfo(name)
            entry.type, entry.size = kind, len(contents)
            if kind == tarfile.SYMTYPE:
                entry.linkname = "/etc/passwd"
            output.addfile(entry, io.BytesIO(contents) if kind == tarfile.REGTYPE else None)


class Contracts(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="kekbot-installer-test-")
        self.root = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def test_options_reject_origin_injection_credentials_paths_and_fixture_publication(self):
        for origin in ("https://bot.example/", "https://user:secret@bot.example", "https://bot.example?key=secret", "https://bot.example\nKEKBOT_MODE=live", "https://$(command).example"):
            with self.subTest(origin=origin), self.assertRaises(core.Problem):
                core.validate_options("kekbot", "live", "external", origin, 3000, "user")
        with self.assertRaises(core.Problem):
            core.validate_options("kekbot", "fixture", "domain", "https://bot.example", 3000, "user")
        with self.assertRaises(core.Problem):
            core.validate_options("kekbot", "live", "ip", "https://127.0.0.1", 3000, "user")
        with self.assertRaises(core.Problem):
            core.validate_options("other-project", "live", "domain", "https://bot.example", 3000, "user")
        self.assertEqual(core.validate_options("kekbot", "live", "external", "https://bot.example:8443", 3001, "bot")["port"], 3001)

    def test_managed_paths_cannot_escape_or_follow_links(self):
        for value in ("../outside", "/outside", "data/../../outside", "", "data\\outside"):
            with self.subTest(value=value), self.assertRaises(core.Problem):
                core.managed_path(self.root, value)
        if os.name == "posix":
            (self.root / "data").symlink_to(self.root.parent, target_is_directory=True)
            with self.assertRaises(core.Problem):
                core.managed_path(self.root, "data/child")

    def test_existing_root_and_source_overlap_are_rejected(self):
        with self.assertRaises(core.Problem):
            core.validate_root(str(self.root), new=True)
        with self.assertRaises(core.Problem):
            core.validate_root(str(Path(__file__).resolve().parent.parent / "private"), new=True)

    def test_archive_extraction_rejects_traversal_links_devices_duplicate_and_multiple_roots(self):
        for index, members in enumerate([
            [("kekbot/../../escaped", b"x", tarfile.REGTYPE)],
            [("/absolute", b"x", tarfile.REGTYPE)],
            [("kekbot/link", b"", tarfile.SYMTYPE)],
            [("kekbot/device", b"", tarfile.CHRTYPE)],
            [("kekbot/file", b"a", tarfile.REGTYPE), ("kekbot/file", b"b", tarfile.REGTYPE)],
            [("one/file", b"a", tarfile.REGTYPE), ("two/file", b"b", tarfile.REGTYPE)],
        ]):
            package = self.root / f"bad{index}.tar.gz"
            archive(package, members)
            with self.subTest(index=index), self.assertRaises(core.Problem):
                core.extract_source(package, self.root / f"bad{index}")
        archive(self.root / "good.tar.gz")
        core.extract_source(self.root / "good.tar.gz", self.root / "good")
        self.assertTrue((self.root / "good/Dockerfile").is_file())

    def bundle(self, image=False, version="0.1.0-dev.0"):
        bundle = self.root / "bundle"
        bundle.mkdir()
        archive(bundle / "kekbot-source.tar.gz", version=version)
        metadata = dict(format="kekbot-release", version=1, applicationVersion=version, sourceRef=SHA, sourceArchive="kekbot-source.tar.gz", image=None, status="candidate-unaccepted", schemaVersion=3, backupFormat=1)
        if image:
            metadata["image"] = dict(imageId=IMAGE, platform="linux/amd64")
            (bundle / "kekbot-linux-amd64-image.tar.gz").write_bytes(b"synthetic image, never loaded")
            (bundle / "kekbot-notices.tar.gz").write_bytes(b"synthetic notices")
        (bundle / "release.json").write_text(json.dumps(metadata))
        (bundle / "SHA256SUMS").write_text("".join(f"{core.checksum(item)}  {item.name}\n" for item in sorted(bundle.iterdir())))
        return bundle

    def test_source_and_image_bundle_formats_validate(self):
        bundle = self.bundle(image=True)
        source_stage, image_stage = self.root / "source-stage", self.root / "image-stage"
        source_stage.mkdir()
        image_stage.mkdir()
        source = core.prepare_target("bundle", str(bundle), "source", source_stage)
        image = core.prepare_target("bundle", str(bundle), "image", image_stage)
        self.assertEqual(source["sourceRef"], SHA)
        self.assertEqual(image["image"]["imageId"], IMAGE)
        self.assertFalse(source["accepted"])

    def test_corrupt_metadata_or_asset_fails_before_execution(self):
        bundle = self.bundle()
        (bundle / "kekbot-source.tar.gz").write_bytes(b"corrupted")
        with self.assertRaisesRegex(core.Problem, "checksum"):
            core.prepare_target("bundle", str(bundle), "source", self.root)
        (bundle / "SHA256SUMS").write_text("0" * 64 + "  ../escape\n")
        with self.assertRaises(core.Problem):
            core.checksum_index(bundle / "SHA256SUMS")

    def test_missing_prebuilt_image_never_silently_builds(self):
        bundle = self.bundle()
        with self.assertRaisesRegex(core.Problem, "no supported prebuilt image"):
            core.prepare_target("bundle", str(bundle), "image", self.root)

    def test_no_stable_release_never_falls_back_to_main(self):
        with patch.object(core, "api_json", side_effect=core.Problem("No stable release")), patch.object(core, "run") as commands:
            with self.assertRaises(core.Problem):
                core.prepare_target("stable", "", "image", self.root)
            commands.assert_not_called()

    def test_prerelease_is_rejected_by_stable_selector(self):
        with patch.object(core, "api_json", return_value={"draft": False, "prerelease": True}), self.assertRaises(core.Problem):
            core.prepare_target("stable", "", "image", self.root)

    def test_ref_arguments_and_exact_commit_are_checked(self):
        for kind, value in (("pr", "--upload-pack=evil"), ("pr", "0"), ("branch", "-evil"), ("branch", "with space"), ("commit", "a" * 12)):
            with self.subTest(kind=kind, value=value), self.assertRaises(core.Problem):
                core.prepare_target(kind, value, "source", self.root)
        with patch.object(core, "run", side_effect=["", "", "b" * 40]), self.assertRaisesRegex(core.Problem, "identity"):
            core.prepare_target("commit", SHA, "source", self.root)

    def test_branch_pr_and_commit_resolve_real_git_archive_without_checkout_execution(self):
        repository = self.root / "repository"
        repository.mkdir()
        (repository / "Dockerfile").write_text("FROM scratch\n")
        (repository / "package.json").write_text('{"version":"0.1.0-dev.0"}')
        core.run(["git", "init", "--quiet", "--initial-branch=main", str(repository)])
        core.run(["git", "-C", str(repository), "add", "."])
        core.run(["git", "-C", str(repository), "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"])
        sha = core.run(["git", "-C", str(repository), "rev-parse", "HEAD"])
        core.run(["git", "-C", str(repository), "update-ref", "refs/pull/17/head", sha])
        original = core.run

        def local_git(arguments, **kwargs):
            return original([str(repository) if item == core.REPOSITORY + ".git" else item for item in arguments], **kwargs)

        for kind, value in (("branch", "main"), ("pr", "17"), ("commit", sha)):
            stage = self.root / kind
            stage.mkdir()
            with patch.object(core, "run", side_effect=local_git):
                selected = core.prepare_target(kind, value, "source", stage)
            self.assertEqual(selected["sourceRef"], sha)
            self.assertTrue((Path(selected["source"]) / "Dockerfile").exists())
            self.assertFalse((Path(selected["source"]) / ".git").exists())

    def test_release_downloads_require_official_assets_and_exact_checksums(self):
        bundle = self.bundle(image=True)
        assets = [{"name": item.name, "browser_download_url": core.REPOSITORY + "/releases/download/v0.1.0-dev.0/" + item.name} for item in bundle.iterdir()]

        def fetch(url, destination, **_kwargs):
            Path(destination).write_bytes((bundle / url.rsplit("/", 1)[-1]).read_bytes())

        stage = self.root / "release-stage"
        stage.mkdir()
        with patch.object(core, "api_json", return_value=dict(tag_name="v0.1.0-dev.0", draft=False, prerelease=True, assets=assets)), patch.object(core, "download", side_effect=fetch):
            selected = core.prepare_target("release", "v0.1.0-dev.0", "image", stage)
        self.assertEqual(selected["image"]["imageId"], IMAGE)
        stage = self.root / "bad-release-stage"
        stage.mkdir()
        assets[0]["browser_download_url"] = "https://untrusted.example/asset"
        with patch.object(core, "api_json", return_value=dict(tag_name="v0.1.0-dev.0", draft=False, assets=assets)), patch.object(core, "download", side_effect=fetch), self.assertRaises(core.Problem):
            core.prepare_target("release", "v0.1.0-dev.0", "image", stage)

    def test_explicit_beta_release_supports_both_formats_without_stable_promotion(self):
        version, tag = "0.1.0-beta.2", "v0.1.0-beta.2"
        bundle = self.bundle(image=True, version=version)
        assets = [{"name": item.name, "browser_download_url": core.REPOSITORY + "/releases/download/" + tag + "/" + item.name} for item in bundle.iterdir()]
        release = dict(tag_name=tag, draft=False, prerelease=True, assets=assets)

        def fetch(url, destination, **_kwargs):
            Path(destination).write_bytes((bundle / url.rsplit("/", 1)[-1]).read_bytes())

        for distribution in ("source", "image"):
            stage = self.root / distribution
            stage.mkdir()
            with self.subTest(distribution=distribution), patch.object(core, "api_json", return_value=release), patch.object(core, "download", side_effect=fetch):
                selected = core.prepare_target("release", tag, distribution, stage)
            self.assertEqual(selected["version"], version)
            self.assertEqual(selected["sourceRef"], SHA)
            self.assertEqual(selected["distribution"], distribution)
            self.assertFalse(selected["accepted"])
            if distribution == "image":
                self.assertEqual(selected["image"]["imageId"], IMAGE)
        with patch.object(core, "api_json", return_value=release), patch.object(core, "download") as download, self.assertRaises(core.Problem):
            core.prepare_target("stable", "", "image", self.root)
        download.assert_not_called()

    def test_image_identity_is_exact_and_nonroot(self):
        inspection = dict(Id=IMAGE, Os="linux", Architecture="amd64", Config=dict(User="node", Labels={"org.opencontainers.image.revision": SHA, "org.opencontainers.image.version": "0.1.0-dev.0", "org.opencontainers.image.source": core.REPOSITORY, "org.opencontainers.image.licenses": "MIT"}))
        command = lambda _args: json.dumps([inspection])
        self.assertEqual(core.verify_image(IMAGE, target(), command), IMAGE)
        inspection["Config"]["User"] = "root"
        with self.assertRaises(core.Problem):
            core.verify_image(IMAGE, target(), command)

    def test_wizard_defaults_explanations_cancel_and_typed_confirmation(self):
        with patch("builtins.input", return_value=""), patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(kekbot.choose("Version", "Stable is the default.", [("Stable", "Latest stable.", "stable"), ("Branch", "Development.", "branch")]), "stable")
            self.assertIn("Stable is the default", output.getvalue())
        with patch("builtins.input", return_value="q"), self.assertRaises(kekbot.Cancelled):
            kekbot.ask("Anything")
        with patch("builtins.input", return_value="yes"), patch("sys.stdout", new_callable=io.StringIO), self.assertRaises(kekbot.Cancelled):
            kekbot.confirm("Purge", "Irreversible", "DELETE kekbot-test")

    def test_update_walkthrough_never_applies_before_final_review(self):
        for confirmation, applied in (("q", False), ("APPLY", True)):
            with self.subTest(confirmation=confirmation), patch.object(sys, "argv", ["kekbot.py", "--root", str(self.root), "--action", "update"]), patch.object(sys.stdin, "isatty", return_value=True), patch.object(kekbot, "check_host"), patch.object(kekbot, "validate_root", return_value=self.root), patch.object(kekbot, "Installation") as engine, patch.object(kekbot, "prepare_target", return_value=target(kind="stable", accepted=True)), patch("builtins.input", side_effect=["1", "1", confirmation]), patch("sys.stdout", new_callable=io.StringIO) as output:
                engine.return_value.load.return_value = state()
                kekbot.main()
                self.assertEqual(engine.return_value.update.called, applied)
                self.assertIn("Review update", output.getvalue())
                self.assertIn("backup", output.getvalue())

    def test_uninstall_walkthrough_defaults_keep_data_and_purge_requires_exact_phrase(self):
        for answers, expected in ((["1", "1", "yes"], None), (["1", "1", "REMOVE CONTAINERS"], {"purge": False, "backup_first": True}), (["2", "2", "DELETE kekbot-test"], {"purge": True, "backup_first": False})):
            with self.subTest(answers=answers), patch.object(sys, "argv", ["kekbot.py", "--root", str(self.root), "--action", "uninstall"]), patch.object(sys.stdin, "isatty", return_value=True), patch.object(kekbot, "check_host"), patch.object(kekbot, "validate_root", return_value=self.root), patch.object(kekbot, "Installation") as engine, patch("builtins.input", side_effect=answers), patch("sys.stdout", new_callable=io.StringIO):
                engine.return_value.load.return_value = state()
                kekbot.main()
                if expected:
                    engine.return_value.uninstall.assert_called_once_with(**expected)
                else:
                    engine.return_value.uninstall.assert_not_called()

    def test_generated_compose_keeps_loopback_immutable_images_and_persistent_certificates(self):
        current = state(options=core.validate_options("kekbot-test", "live", "domain", "https://bot.example", 3000, "user"), proxyImageId=IMAGE)
        spec = core.compose_spec(self.root, current)
        self.assertEqual(spec["services"]["kekbot"]["ports"], ["127.0.0.1:3000:3000"])
        self.assertEqual(spec["services"]["kekbot"]["pull_policy"], "never")
        self.assertEqual(spec["services"]["proxy"]["image"], IMAGE)
        self.assertEqual(spec["volumes"]["certificates"]["name"], "kekbot-test-certificates")
        self.assertTrue(spec["services"]["proxy"]["volumes"][0]["read_only"])


class RecoveryFailures(unittest.TestCase):
    """Real private records; Docker is simulated. Linux retains real flock."""

    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="kekbot-recovery-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "installation"
        ownership = patch.object(core.os, "chown", create=True)
        ownership.start()
        self.addCleanup(ownership.stop)
        # The engine's production path/ownership rules target Linux. Exercise
        # its failure transitions on Windows too without weakening those rules.
        if os.name == "nt":
            replacement = patch.object(core, "validate_root", return_value=self.root)
            replacement.start()
            self.addCleanup(replacement.stop)
        self.engine = core.Installation(self.root, command=lambda _args, **_kwargs: "", progress=lambda _message: None)
        if os.name == "nt":
            replacement = patch.object(self.engine, "lock", side_effect=contextlib.nullcontext)
            replacement.start()
            self.addCleanup(replacement.stop)

    def record(self, **overrides):
        self.root.mkdir(mode=0o700, exist_ok=True)
        current = state(**overrides)
        self.engine.save(current)
        self.engine.configure(current)
        return current

    def test_proxy_preparation_failure_leaves_no_installation_and_can_retry(self):
        options = core.validate_options("kekbot-test", "live", "domain", "https://bot.example", 3210, "user")
        for failure in ("build", "inspect", "identity"):
            def command(args, **_kwargs):
                if (args[:2] == ["docker", "build"] and failure == "build") or (args[:3] == ["docker", "image", "inspect"] and failure == "inspect"):
                    raise core.Problem("simulated proxy preparation failure")
                return "invalid" if args[:3] == ["docker", "image", "inspect"] else ""

            with self.subTest(failure=failure), patch.object(self.engine, "command", side_effect=command), patch.object(self.engine, "stage_image", return_value=IMAGE), patch.object(core.socket, "socket"), self.assertRaises(core.Problem):
                self.engine.install(options, target())
            self.assertFalse(self.root.exists())

        def command(args, **_kwargs):
            return IMAGE if args[:3] == ["docker", "image", "inspect"] else ""

        with patch.object(self.engine, "command", side_effect=command), patch.object(self.engine, "stage_image", return_value=IMAGE), patch.object(self.engine, "cli", return_value={}), patch.object(self.engine, "wait_ready"), patch.object(core.socket, "socket"):
            installed = self.engine.install(options, target())
        self.assertEqual(installed["status"], "ready")
        self.assertEqual(self.engine.load()["proxyImageId"], IMAGE)

    def assert_proxy_install_has_complete_context_and_retained_resources(self, proxy):
        origin = "https://bot.example" if proxy == "domain" else "https://203.0.113.10"
        options = core.validate_options("kekbot-test", "live", proxy, origin, 3210, "user")
        deploy = core.proxy_directory()
        expected = {"Caddyfile", "Caddyfile.ip", "Caddy.Dockerfile", "caddy/go.mod", "caddy/go.sum", "caddy/main.go"}
        builds = []

        def command(args, **_kwargs):
            if args[:2] == ["docker", "build"]:
                context = Path(args[-1])
                dockerfile = Path(args[args.index("--file") + 1])
                self.assertEqual(dockerfile, context / "deploy/Caddy.Dockerfile")
                self.assertEqual({str(path.relative_to(context)).replace("\\", "/") for path in context.rglob("*") if path.is_file()}, {"deploy/" + name for name in expected})
                # Check actual consumer paths, not just the producer's file list.
                for line in dockerfile.read_text().splitlines():
                    if line.startswith("COPY ") and "--from=" not in line:
                        for name in line.split()[1:-1]:
                            self.assertEqual((context / name).read_bytes(), (deploy.parent / name).read_bytes())
                builds.append(True)
            return IMAGE if args[:3] == ["docker", "image", "inspect"] else ""

        with patch.object(self.engine, "command", side_effect=command), patch.object(self.engine, "stage_image", return_value=IMAGE), patch.object(self.engine, "cli", return_value={}), patch.object(self.engine, "wait_ready"), patch.object(core.socket, "socket"):
            installed = self.engine.install(options, target())
        self.assertEqual(installed["status"], "ready")
        self.assertEqual(len(builds), 1)
        for name in expected:
            self.assertEqual((self.root / "proxy" / name).read_bytes(), (deploy / name).read_bytes())
            self.assertEqual((self.root / "tool/deploy" / name).read_bytes(), (deploy / name).read_bytes())
        # The copied tool must work after the original checkout is unavailable.
        with patch.object(core, "__file__", str(self.root / "tool/core.py")):
            retained = core.proxy_directory()
            self.assertEqual(retained, self.root / "tool/deploy")
            context = self.root / "retained-context"
            core.stage_proxy_context(retained, context)
            self.assertEqual((context / "deploy/caddy/go.sum").read_bytes(), (deploy / "caddy/go.sum").read_bytes())

    def test_domain_install_stages_and_retains_all_proxy_build_inputs(self):
        self.assert_proxy_install_has_complete_context_and_retained_resources("domain")

    def test_ip_install_stages_and_retains_all_proxy_build_inputs(self):
        # Keep the example reserved; simulate public classification offline.
        with patch.object(core.ipaddress.IPv4Address, "is_global", new_callable=unittest.mock.PropertyMock, return_value=True):
            self.assert_proxy_install_has_complete_context_and_retained_resources("ip")

    def test_missing_proxy_source_fails_before_creating_installation_state(self):
        incomplete = self.root.parent / "incomplete-deploy"
        core.copy_proxy_files(core.proxy_directory(), incomplete)
        (incomplete / "caddy/go.sum").unlink()
        options = core.validate_options("kekbot-test", "live", "domain", "https://bot.example", 3210, "user")
        with patch.object(core, "proxy_directory", return_value=incomplete), patch.object(self.engine, "stage_image", return_value=IMAGE), patch.object(core.socket, "socket"), self.assertRaises(FileNotFoundError):
            self.engine.install(options, target())
        self.assertFalse(self.root.exists())

    def assert_shutdown_after_record_failure(self, action):
        if action != "install":
            self.record(**({"imageId": IMAGE, "status": "update-failed", "previous": dict(state=state(), backup=None, phase="stopping")} if action == "rollback" else {}))
        actual_save = self.engine.save
        failures, commands = [], []

        def save(current):
            if current["status"] in ("ready", action + "-failed"):
                failures.append(current["status"])
                raise OSError(errno.ENOSPC, "simulated full storage")
            actual_save(current)

        with patch.object(self.engine, "save", side_effect=save), patch.object(self.engine, "stage_image", return_value=IMAGE), patch.object(self.engine, "backup", return_value="backups/checkpoint"), patch.object(self.engine, "cli", return_value={}), patch.object(self.engine, "wait_ready"), patch.object(self.engine, "compose", side_effect=lambda _state, *args: commands.append(args) or ""), patch.object(core.socket, "socket"):
            with self.assertRaises(OSError) as raised:
                if action == "install":
                    self.engine.install(state()["options"], target())
                elif action == "update":
                    self.engine.update(target())
                else:
                    self.engine.rollback()
        self.assertEqual(raised.exception.errno, errno.ENOSPC)
        self.assertEqual(failures, ["ready", action + "-failed"])
        self.assertTrue(any(args[0] == "up" for args in commands))
        self.assertEqual(commands[-1], ("stop",) if action == "install" else ("stop", "kekbot"))
        pending = {"install": "installing", "update": "updating", "rollback": "rolling-back"}[action]
        self.assertEqual(self.engine.load()["status"], pending)

    def test_install_stops_even_if_final_and_failure_record_writes_fail(self):
        self.assert_shutdown_after_record_failure("install")

    def test_update_stops_even_if_final_and_failure_record_writes_fail(self):
        self.assert_shutdown_after_record_failure("update")

    def test_rollback_stops_even_if_final_and_failure_record_writes_fail(self):
        self.assert_shutdown_after_record_failure("rollback")

    def test_start_stops_on_readiness_and_final_record_failure(self):
        for failed_stage in ("readiness", "save"):
            with self.subTest(stage=failed_stage):
                self.record(status="stopped")
                original = self.engine.save
                calls = []
                def save(current):
                    if failed_stage == "save":
                        raise OSError(errno.ENOSPC, "synthetic full disk")
                    original(current)
                with patch.object(self.engine, "cli", return_value={"integrity": "ok"}), patch.object(self.engine, "compose", side_effect=lambda _state, *args: calls.append(args) or ""), patch.object(self.engine, "wait_ready", side_effect=core.Problem("readiness failed") if failed_stage == "readiness" else None), patch.object(self.engine, "save", side_effect=save):
                    with self.assertRaises((core.Problem, OSError)):
                        self.engine.start()
                self.assertEqual(calls[-1], ("stop",))
                self.assertEqual(self.engine.load()["status"], "stopped")

    def test_diagnostics_record_only_allowlisted_metadata_and_rotate(self):
        directory = self.root / "diagnostics"
        log = core.Diagnostics(directory)
        with core.diagnostic_session(log), patch.object(core.subprocess, "run", return_value=unittest.mock.Mock(returncode=7)):
            with self.assertRaises(core.Problem):
                core.run(["docker", "build", "private-token-value"], env={"SECRET": "private-token-value"})
        path = directory / "lifecycle-diagnostics.log"
        entry = json.loads(path.read_text())
        self.assertEqual(entry["operation"], "docker build")
        self.assertEqual(entry["exitCode"], 7)
        self.assertNotIn("private-token-value", path.read_text())
        self.assertEqual(set(entry), {"at", "operation", "outcome", "elapsedMs", "exitCode"})
        if os.name == "posix":
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        for _ in range(4):
            path.write_text("x" * (1024 * 1024))
            log.record("docker compose", "success", 0, 0)
        self.assertEqual(len(list(directory.iterdir())), 3)
        with patch.object(core.os, "open", side_effect=OSError(errno.ENOSPC, "full")):
            log.record("docker compose", "error", 0, 1)
        with patch.object(core.os, "open", side_effect=PermissionError("readonly")):
            log.record("docker compose", "error", 0, 1)

    def test_diagnostics_reject_checkout_and_nonprivate_directory(self):
        with self.assertRaises(core.Problem):
            core.Diagnostics(Path(core.__file__).resolve().parent)
        with self.assertRaises(core.Problem):
            core.Diagnostics(Path(core.__file__).resolve().parent / ".." / "installer")
        if os.name == "posix":
            self.root.mkdir(mode=0o700, exist_ok=True)
            directory = self.root / "public-diagnostics"
            directory.mkdir(mode=0o755)
            directory.chmod(0o755)  # Wizard tests may have set a restrictive process umask.
            with self.assertRaises(core.Problem):
                core.Diagnostics(directory)

    def test_retained_uninstall_preserves_incomplete_operation_and_checkpoint(self):
        checkpoint = dict(state=state(), backup="backups/checkpoint", phase="migrating")
        for status in ("updating", "update-failed", "rolling-back", "rollback-failed"):
            for backup_first in (True, False):
                with self.subTest(status=status, backup_first=backup_first):
                    self.record(status=status, imageId=IMAGE, previous=checkpoint)
                    with patch.object(self.engine, "backup", return_value="backups/removal") as backup, patch.object(self.engine, "compose") as compose:
                        self.engine.uninstall(backup_first=backup_first)
                    self.assertEqual(backup.called, backup_first)
                    compose.assert_called_once_with(unittest.mock.ANY, "down", "--remove-orphans")
                    retained = self.engine.load()
                    self.assertEqual(retained["status"], status)
                    self.assertEqual(retained["previous"], checkpoint)
                    with patch.object(self.engine, "stage_image") as stage, patch.object(self.engine, "cli") as cli:
                        with self.assertRaises(core.Problem):
                            self.engine.start()
                        with self.assertRaises(core.Problem):
                            self.engine.update(target())
                        stage.assert_not_called()
                        cli.assert_not_called()
                    self.assertEqual(self.engine.load(), retained)

    def test_explicit_purge_can_retire_an_incomplete_installation(self):
        self.record(status="update-failed", imageId=IMAGE, previous=dict(state=state(), backup="backups/checkpoint", phase="migrating"))
        self.engine.uninstall(purge=True, backup_first=False)
        self.assertFalse(self.root.exists())


@unittest.skipUnless(os.name == "posix", "Lifecycle locking/ownership are Linux-only; CI exercises the real daemon")
class Transactions(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="kekbot-lifecycle-test-")
        self.root = Path(self.temporary.name)
        self.engine = core.Installation(self.root, command=lambda _args, **_kwargs: "", progress=lambda _message: None)
        self.engine.save(state())
        self.engine.configure(state())

    def tearDown(self):
        self.temporary.cleanup()

    def test_concurrent_management_is_refused(self):
        with self.engine.lock(), self.assertRaisesRegex(core.Problem, "Another lifecycle"):
            with core.Installation(self.root).lock():
                pass

    def test_failed_migration_preserves_checkpoint_stops_app_and_requires_recovery(self):
        calls = []
        with patch.object(self.engine, "stage_image", return_value=IMAGE), patch.object(self.engine, "backup", return_value="backups/checkpoint"), patch.object(self.engine, "cli", side_effect=core.Problem("migration failed")), patch.object(self.engine, "compose", side_effect=lambda _state, *args: calls.append(args) or ""):
            with self.assertRaisesRegex(core.Problem, "migration failed"):
                self.engine.update(target())
        failed = self.engine.load()
        self.assertEqual(failed["status"], "update-failed")
        self.assertEqual(failed["previous"]["state"]["imageId"], OLD_IMAGE)
        self.assertEqual(failed["previous"]["phase"], "migrating")
        self.assertIn(("stop", "kekbot"), calls)
        self.engine.stop()
        self.assertEqual(self.engine.load()["status"], "update-failed")
        with self.assertRaises(core.Problem):
            self.engine.start()

    def test_backup_failure_does_not_migrate(self):
        with patch.object(self.engine, "stage_image", return_value=IMAGE), patch.object(self.engine, "backup", side_effect=core.Problem("backup failed")), patch.object(self.engine, "cli") as cli:
            with self.assertRaises(core.Problem):
                self.engine.update(target())
            cli.assert_not_called()
        self.assertEqual(self.engine.load()["previous"]["phase"], "stopping")

    def test_successful_update_order_and_bounded_checkpoint_history(self):
        calls = []
        self.engine.save(state(previous={"older": "record"}))
        with patch.object(self.engine, "stage_image", side_effect=lambda _target: calls.append("prepare") or IMAGE), patch.object(self.engine, "backup", side_effect=lambda _state: calls.append("backup") or "backups/checkpoint"), patch.object(self.engine, "cli", side_effect=lambda _state, *args: calls.append(args[0]) or {}), patch.object(self.engine, "wait_ready", side_effect=lambda _state: calls.append("ready")):
            result = self.engine.update(target())
        self.assertEqual(calls, ["prepare", "backup", "init", "ready"])
        self.assertEqual(result["status"], "ready")
        self.assertIsNone(result["previous"]["state"]["previous"])

    def test_rollback_restores_into_new_root_and_keeps_failed_storage(self):
        secrets = self.root / "data/fixture/secrets"
        secrets.mkdir(parents=True)
        (secrets / "encryption.key").write_text("synthetic private input")
        (self.root / "data/retained.txt").write_text("failed state")
        (self.root / "backups/checkpoint").mkdir(parents=True)
        self.engine.save(state(imageId=IMAGE, status="update-failed", previous=dict(state=state(), backup="backups/checkpoint", phase="migrating")))
        calls = []
        with patch.object(core.os, "chown"), patch.object(self.engine, "compose", side_effect=lambda current, *args: calls.append((current["data"], args)) or ""), patch.object(self.engine, "cli", return_value={}), patch.object(self.engine, "wait_ready"):
            result = self.engine.rollback()
        self.assertTrue(result["data"].startswith("recovery/"))
        self.assertEqual(result["imageId"], OLD_IMAGE)
        self.assertTrue((self.root / "data/retained.txt").exists())
        self.assertTrue(any("restore" in args for _data, args in calls))

    def test_default_uninstall_retains_data_and_never_prunes_or_deletes_volumes(self):
        (self.root / "data").mkdir()
        calls = []
        with patch.object(self.engine, "backup", return_value="backups/checkpoint"), patch.object(self.engine, "compose", side_effect=lambda _state, *args: calls.append(args) or ""):
            self.engine.uninstall()
        self.assertTrue((self.root / "data").exists())
        self.assertEqual(self.engine.load()["status"], "uninstalled")
        self.assertEqual(calls, [("down", "--remove-orphans")])

    def test_purge_refuses_symlinks_and_retains_outside_data(self):
        with tempfile.TemporaryDirectory(prefix="kekbot-outside-test-") as outside:
            sentinel = Path(outside) / "keep"
            sentinel.write_text("keep")
            (self.root / "linked").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(core.Problem, "symbolic link"):
                self.engine.uninstall(purge=True, backup_first=False)
            self.assertTrue(sentinel.exists())
            self.assertTrue(self.root.exists())


if __name__ == "__main__":
    unittest.main()
