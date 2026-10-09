"""Linux CI only: audited bundle -> install -> update failure/recovery -> uninstall.

Runs with an isolated fixture root and generated credentials. Never emits those
credentials or uploads runtime files. Called after release-package and checksums.
"""
import contextlib
import argparse
import json
import os
from pathlib import Path
import sqlite3
import tempfile
from unittest.mock import patch

from core import Installation, Problem, check_host, prepare_target, run, validate_options


def main(release=None):
    if os.geteuid() != 0:
        raise Problem("The isolated CI lifecycle rehearsal requires sudo for UID ownership.")
    check_host()
    bundles = [] if release else list(Path("output/release").iterdir())
    if not release and len(bundles) != 1:
        raise Problem("Expected one audited candidate bundle.")
    selection = ("release", release) if release else ("bundle", str(bundles[0].resolve()))
    with tempfile.TemporaryDirectory(prefix="kekbot-managed-smoke-") as temporary:
        private = Path(temporary)
        stage = private / "stage"
        stage.mkdir()
        target = prepare_target(*selection, "image", stage)
        if release:
            print("Published release selection verified: " + target["sourceRef"] + " / " + target["image"]["imageId"])
        root = private / "installation"
        project = "kekbot-ci-" + str(os.getpid())
        options = validate_options(project, "fixture", "local", "http://127.0.0.1:3317", 3317, "user")
        engine = Installation(root)
        try:
            initial = engine.install(options, target)
            database = root / "data/fixture/kekbot.sqlite"
            with sqlite3.connect(database) as db:
                accounts = db.execute("SELECT count(*) FROM accounts").fetchone()[0]
                documents = db.execute("SELECT count(*) FROM documents").fetchone()[0]
            if accounts != 1 or documents < 18:
                raise Problem("Fresh fixture installation was not seeded.")
            event = json.loads(engine.compose(initial, "exec", "--no-TTY", "--env", "KEKBOT_PUBLIC_URL=http://127.0.0.1:3000", "kekbot", "node", "src/cli.ts", "fixture-event"))
            if event.get("status") != 200 or not event.get("result", {}).get("accepted"):
                raise Problem("Managed fixture intake failed through the container's internal loopback port.")
            key = (root / "data/fixture/secrets/encryption.key").read_bytes()
            asset = root / "data/fixture/assets/recovery-check.txt"
            asset.write_text("synthetic asset")
            os.chown(asset, 1000, 1000)
            base_tag = project + ":base"
            run(["docker", "tag", initial["imageId"], base_tag])

            def derived(broken):
                context = private / ("broken" if broken else "updated")
                context.mkdir()
                dockerfile = "FROM " + base_tag + "\n"
                if broken:
                    (context / "broken.ts").write_text("process.exit(1);\n")
                    dockerfile += "COPY --chown=node:node broken.ts /app/src/cli.ts\n"
                else:
                    dockerfile += "LABEL org.kekbot.synthetic-update=1\n"
                (context / "Dockerfile").write_text(dockerfile)
                tag = project + (":broken" if broken else ":updated")
                run(["docker", "build", "--tag", tag, str(context)])
                image = run(["docker", "image", "inspect", "--format", "{{.Id}}", tag])
                archive = context / "image.tar"
                run(["docker", "save", "--output", str(archive), tag])
                return dict(target, archive=str(archive), image=dict(imageId=image, platform="linux/amd64"))

            try:
                engine.update(derived(True))
                raise Problem("Broken maintenance image unexpectedly succeeded.")
            except Problem:
                if engine.load()["status"] != "update-failed":
                    raise
            checkpoint = engine.load()["previous"]
            engine.uninstall(backup_first=False)
            retained = engine.load()
            if retained["status"] != "update-failed" or retained["previous"] != checkpoint:
                raise Problem("Retained removal cleared the failed-update recovery checkpoint.")
            for action in (engine.start, lambda: engine.update(target)):
                try:
                    action()
                except Problem as error:
                    if not str(error).startswith("Resolve"):
                        raise
                else:
                    raise Problem("Retained removal bypassed failed-update recovery.")
            restored = engine.rollback()
            if restored["imageId"] != initial["imageId"] or not restored["data"].startswith("recovery/"):
                raise Problem("Failed-update rollback did not restore the previous image into a new root.")
            if (root / restored["data"] / "fixture/secrets/encryption.key").read_bytes() != key or (root / restored["data"] / "fixture/assets/recovery-check.txt").read_text() != "synthetic asset":
                raise Problem("Rollback did not preserve original key and asset.")
            source_stage = private / "source-stage"
            source_stage.mkdir()
            source_target = prepare_target(*selection, "source", source_stage)
            if source_target["sourceRef"] != target["sourceRef"]:
                raise Problem("Published source and image selections disagree.")
            engine.stage_image(source_target)
            updated = engine.update(derived(False))
            if updated["imageId"] == initial["imageId"]:
                raise Problem("Successful update did not switch image identity.")
            # Actual containers must stop even when activation cannot be recorded.
            engine.stop()
            for stage in ("readiness", "save"):
                original = engine.save
                def save(current):
                    if stage == "save":
                        raise OSError("synthetic final-record failure")
                    original(current)
                readiness = patch.object(engine, "wait_ready", side_effect=Problem("synthetic readiness failure")) if stage == "readiness" else contextlib.nullcontext()
                with readiness, patch.object(engine, "save", side_effect=save):
                    try:
                        engine.start()
                    except (Problem, OSError):
                        pass
                    else:
                        raise Problem("Failed Start unexpectedly succeeded.")
                running = engine.compose(engine.load(), "ps", "--status", "running", "--quiet")
                if running:
                    raise Problem("Failed Start left a managed container running.")
                engine.start()
                engine.stop()
            engine.start()
            engine.uninstall()
            if not (root / updated["data"] / "fixture/kekbot.sqlite").exists():
                raise Problem("Default uninstall removed persistent data.")
            engine.start()
            engine.uninstall(purge=True, backup_first=False)
            if root.exists():
                raise Problem("Explicit purge retained managed files.")
            print("Both bundle formats, managed install, failed update, separate-root rollback, successful update, retained-data uninstall/resume and explicit purge passed with isolated fixtures.")
        finally:
            if root.exists() and (root / "compose.json").exists():
                state = engine.load()
                engine.compose(state, "down", "--remove-orphans")
            # Ephemeral CI-only images; never prune shared Docker resources.
            for tag in (project + ":broken", project + ":updated", project + ":base"):
                try:
                    run(["docker", "image", "rm", tag])
                except Problem:
                    pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Isolated Linux fixture lifecycle rehearsal; no live providers.")
    parser.add_argument("--release", help="Explicit published version tag; otherwise use the local audited candidate bundle.")
    arguments = parser.parse_args()
    try:
        main(arguments.release)
    except (Problem, OSError, ValueError, KeyError):
        print("Managed lifecycle rehearsal failed. Private runtime output was not printed or uploaded.")
        raise SystemExit(1)
