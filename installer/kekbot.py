#!/usr/bin/env python3
"""Guided, review-before-apply Linux installer/updater/uninstaller."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shlex
import sys
import tempfile
import textwrap

from core import Diagnostics, diagnostic_session, Installation, Problem, REPOSITORY, check_host, prepare_target, recommended_release, validate_options, validate_root


class Cancelled(Exception):
    pass


def explain(title, text):
    print("\n" + "=" * 76 + "\n" + title + "\n" + "=" * 76)
    for paragraph in text.split("\n\n"):
        print(textwrap.fill(paragraph, width=76) + "\n")


def ask(label, default=None):
    suffix = f" [{default}]" if default is not None else ""
    value = input(label + suffix + ": ").strip()
    if value.lower() in ("q", "quit", "cancel"):
        raise Cancelled()
    return value or default or ""


def choose(title, text, choices):
    explain(title, text)
    for number, (label, description, _) in enumerate(choices, 1):
        print(f"  {number}. {label}")
        print(textwrap.fill(description, width=72, initial_indent="     ", subsequent_indent="     "))
    while True:
        value = ask("Choose a number (q cancels)", "1")
        if value.isdigit() and 1 <= int(value) <= len(choices):
            return choices[int(value) - 1][2]
        print("Please enter one of the numbers above.")


def confirm(title, text, phrase="APPLY"):
    explain(title, text + f"\n\nNothing is applied until you type {phrase}. Type q to cancel.")
    if ask("Confirmation") != phrase:
        raise Cancelled()


def source_selection(directory, selection=None, *, guided=False):
    selection = selection or {}
    guided = guided and selection.get("source") in (None, "stable", "release") and selection.get("format") != "source"
    if guided and not selection.get("source"):
        tag, prerelease = recommended_release(directory)
        if prerelease:
            decision = choose("KekBot is currently in beta", f"There is no stable release yet. {tag} is a published test release. Choosing it does not establish full live testing or stable acceptance. Use a test installation and keep backups. Trying it is your choice; it will never be selected as latest stable.", [
                ("Stop for now", "Wait for a stable release. Nothing will be installed.", "stop"),
                (f"Try {tag}", "Install the published test image without compiling the app yourself.", "beta"),
                ("Advanced version choices", "Choose another release, branch, PR, exact commit or local bundle.", "advanced"),
            ])
            if decision == "stop":
                raise Cancelled()
            if decision == "advanced":
                return source_selection(directory, guided=False)
        if tag is None:
            raise Problem("No installable published release is available. Use Advanced setup for reviewed development code, or wait for a release.")
        selection = dict(source="release" if prerelease else "stable", ref=tag, format="image")
    kind = selection.get("source") or choose("Choose the version", "Latest stable is the normal default. Every selection is resolved once and pinned; branches are never pulled automatically. Downloads use verified HTTPS. A branch or PR can execute arbitrary build/application code with access to this host's Docker daemon: review its exact commit first.", [
        ("Latest stable release (recommended)", "Published stable GitHub release with accepted metadata. If none exists, stop and explicitly choose development; never silently use main.", "stable"),
        ("Specific release", "Enter an exact published tag, e.g. v0.1.0-beta.2 or v1.0.0. A beta must already be published and remains an evaluation build.", "release"),
        ("Repository branch", "Build a named branch, for example main. Its current commit is pinned for this operation.", "branch"),
        ("Pull request", "Build the PR head, including fork contributions, from refs/pull/NUMBER/head. This is untrusted code until reviewed.", "pr"),
        ("Exact commit", "Build a reviewed full 40-character commit SHA from the public repository.", "commit"),
        ("Local audited release bundle", "Directory containing release.json, SHA256SUMS and the required source/image/notices archives. Useful for transferred candidate or release artifacts.", "bundle"),
    ])
    value = (selection.get("ref") or "") if guided else ""
    if kind != "stable" and selection.get("source"):
        value = selection["ref"]
    elif kind != "stable":
        value = ask({"release": "Release tag", "branch": "Branch", "pr": "PR number", "commit": "Full commit SHA", "bundle": "Absolute bundle directory"}[kind])
    distribution = "source"
    if kind in ("stable", "release", "bundle"):
        distribution = selection.get("format") or ("image" if guided else choose("Choose distribution format", "Both formats use the audited release metadata and SHA256SUMS. Checksums detect corruption; they are not a publisher signature. Only obtain bundles from the project or a trusted operator. Automatic GitHub source zip downloads are not installer bundles.", [
            ("Prebuilt Linux amd64 image (recommended)", "Load the exact image archive and verify image ID, source/version labels and non-root user. Avoids application compilation on your server.", "image"),
            ("Build the release source", "Verify the source tar.gz, then build with Docker and locked dependencies. Needs more RAM/time and build-network access; rebuilt image bytes differ from the accepted image.", "source"),
        ]))
    print("\nResolving and downloading the selected public source. No application code is being executed.")
    target = prepare_target(kind, value, distribution, directory)
    explain("Review the resolved version", f"Application: {target['version']}\n\nSource commit: {target['sourceRef']}\n\nFormat: {target['distribution']}. " + ("Accepted package metadata is present. A source rebuild still needs its own verification." if target["accepted"] else "This is an evaluation candidate; full-product live acceptance is not established."))
    if kind in ("branch", "pr", "commit") or (not target["accepted"] and not guided):
        confirm("Trust this exact source?", "Only continue after reviewing the source and its CI. Root/Docker build access is powerful. This acknowledgement does not make a development build a supported release.", "TRUST " + target["sourceRef"][:12])
    return target


def installation_options(default_root=None, *, advanced=True):
    mode = choose("How will you use KekBot?", "Choose deliberately: missing provider credentials never turn a live installation into a demo. You can leave optional integrations disabled after setup. A fixture installation is a separate simulated environment and cannot be converted into a live database.", [
        ("Live creator installation", "Always-on Linux host, real provider accounts you own and a publicly trusted HTTPS origin. Credentials are entered later in the browser, not this terminal.", "live"),
        ("Isolated fixture evaluation", "Loopback-only simulated chat/media and randomly generated demo login. No real provider mutations or YouTube playback.", "fixture"),
    ])
    if advanced:
        explain("Storage and instance name", "Use a new dedicated directory on local disk. The wizard owns everything underneath it: protected environment, generated keys, data, backups, proxy and management tool. NFS/SMB and shared databases are unsupported. The directory must be outside this checkout and must not already exist. Root protects the directory; the app writes data as UID 1000. Keep an independent recovery-key copy elsewhere.")
    root = validate_root(ask("Installation directory", default_root or "/srv/kekbot") if advanced else default_root or "/srv/kekbot", new=True)
    project = ask("Unique Compose project name", "kekbot") if advanced else "kekbot"
    if advanced:
        explain("Application port", "The direct port binds only to 127.0.0.1. Choose an unused port from 1024 to 65535. Bundled HTTPS stays on ports 80/443. A second installation needs a different application port and an existing shared reverse proxy; two bundled proxies cannot own the same public ports.")
    else:
        explain("Recommended settings", f"Your files will be stored in {root}. KekBot will manage one Docker application named kekbot, using local port 3000. Docker runs the app in its own container, so you do not need to install Node.js. Choose Advanced setup if you need another directory, name, port or reply mode. These settings will appear again in the final review.")
    try:
        port = int(ask("Loopback application port", "3000")) if advanced else 3000
    except ValueError as error:
        raise Problem("Port must be a number.") from error
    if mode == "fixture":
        proxy, origin, chat_type = "local", f"http://127.0.0.1:{port}", "user"
    else:
        proxy = choose("Public HTTPS and callbacks", "Your bot needs a secure web address so your browser and Kick can reach it. Caddy is the included web server that can set up HTTPS. For a domain, point its DNS A record to this server first. For bundled hosting, allow public TCP ports 80 and 443. This tool does not buy a domain, edit DNS/firewalls or change SSH. An existing proxy is an advanced option.", [
            ("Domain with bundled Caddy (recommended)", "Point a DNS A record to this host; route inbound TCP 80/443. Caddy stores certificates in persistent Docker volumes and renews them automatically.", "domain"),
            ("Public IPv4 with bundled Caddy", "No domain purchase required. Uses pinned Caddy 2.11.6 and short-lived Let's Encrypt certificates. Provider acceptance and actual renewal still need testing.", "ip"),
            ("Existing HTTPS reverse proxy", "You configure forwarding to the chosen loopback port, SSE streaming and request limits. The wizard will not replace your proxy.", "external"),
        ])
        if advanced or proxy == "external":
            origin = ask("Exact HTTPS origin (no trailing slash)")
        else:
            address = ask("Your domain, for example bot.example.com" if proxy == "domain" else "This server's public IPv4 address")
            origin = (address if address.startswith("https://") else "https://" + address).rstrip("/")
        chat_type = choose("Kick reply identity", "The developer application's name does not set the chat sender. Later authorize the intended creator account and verify an actual reply. A standalone bot account cannot silently control a different creator's channel.", [
            ("Authorized account (recommended for initial proof)", "Use official user delivery as the Kick account that grants access.", "user"),
            ("Kick official bot delivery", "Use Kick's bot mode where the provider supports it. Verify availability and actual sender identity for the channel.", "bot"),
        ]) if advanced else "user"
    return root, validate_options(project, mode, proxy, origin, port, chat_type)


def next_steps(root, state):
    mode = state["options"]["mode"]
    launcher = root / "tool" / "install.sh"
    invocation = ["sudo", "bash", str(launcher)] if launcher.is_file() else ["sudo", "python3", "-B", str(root / "tool" / "kekbot.py")]
    command = shlex.join([*invocation, "--root", str(root)])
    explain("KekBot is ready for browser setup", f"Open {state['options']['origin']}. Container readiness and local integrity passed; publicly trusted TLS and provider delivery must still be verified.\n\nRead privately: {root / state['data'] / mode / 'secrets' / ('fixture-account.json' if mode == 'fixture' else 'setup.token')}. No secret values are printed by this wizard. Live setup expires in one hour; the owner account is created in the browser.\n\nKeep an independent protected copy of the encryption.key file in that same directory. Database/asset backups exclude keys.\n\nManage this installation with: {command}\n\nNext: {REPOSITORY}/blob/main/docs/FIRST_SESSION.md")
    if mode == "live":
        explain("Connect your applications in the dashboard", "1. Claim this installation with the private setup token and choose your local owner login.\n\n2. In Connections, create/configure your owner-controlled Kick app, exact callback URLs and required scopes. Enter secrets only there, authorize the intended creator and reconcile subscriptions. Verify an actual chat reply.\n\n3. Discord and YouTube are optional. Follow the provider guide for application IDs, channel/guild permissions, HTTP interactions and metadata key restrictions.\n\n4. Configure commands, timers, OBS source tokens and media rules in the first-session guide. Every editable field is explained in CONFIGURATION_FIELDS.md. OAuth and provider-console consent remain deliberate owner/browser actions.")
        print(REPOSITORY + "/blob/main/docs/PROVIDERS.md")


def main():
    os.umask(0o077)
    if sys.version_info < (3, 10):
        raise Problem("Use Python 3.10 or newer; no pip packages are required.")
    parser = argparse.ArgumentParser(description="Guided KekBot Linux installer/updater/uninstaller. Interactive review is always required before mutations.")
    parser.add_argument("--root", help="Managed directory, or suggested new-install directory; otherwise ask")
    parser.add_argument("--action", choices=["install", "update", "rollback", "start", "stop", "status", "uninstall"], help="Open this walkthrough directly")
    parser.add_argument("--diagnostics-dir", help="Opt-in protected directory outside source; bounded metadata only, no command output")
    parser.add_argument("--source", choices=["stable", "release", "branch", "pr", "commit", "bundle"], help="Prefill the application source; trust/final review still required")
    parser.add_argument("--ref", help="Release tag, branch, PR number, full commit or bundle directory for --source")
    parser.add_argument("--format", choices=["image", "source"], help="Prefill a release/bundle format; source refs always build source")
    parser.add_argument("--advanced", action="store_true", help="Show all settings and require exact-source trust for evaluation code")
    args = parser.parse_args()
    if args.source:
        if args.action and args.action not in ("install", "update"):
            parser.error("--source applies only to install/update")
        if args.source != "stable" and not args.ref or args.source == "stable" and args.ref:
            parser.error("--source needs --ref except for stable")
        if args.format == "image" and args.source not in ("stable", "release", "bundle"):
            parser.error("branches/PRs/commits build from source")
    elif args.ref is not None or args.format:
        parser.error("--ref/--format need --source")
    selection = dict(source=args.source, ref=args.ref, format=args.format)
    if not sys.stdin.isatty():
        parser.error("This wizard needs an interactive terminal. Read docs/INSTALLER.md; there is no unattended --yes mode.")
    explain("KekBot host management", "This walkthrough helps you install or manage your bot. Recommended setup fills in the usual settings; Advanced setup keeps every custom option. Provider accounts are connected later in your browser.\n\nPress Enter for a suggested choice, or type q to cancel. You will review changes before applying them. Ctrl+C exits. If you interrupt an update, inspect status before restarting. The installer does not change your SSH access, firewall or domain settings.")
    log = Diagnostics(args.diagnostics_dir) if args.diagnostics_dir else None
    if log:
        print("Private diagnostics enabled: bounded stage/exit/timing metadata only. No command output is saved.")
    with diagnostic_session(log):
        check_host()
        first = args.action
        while True:
            try:
                action = first or choose("What would you like to do?", "Status is read-only. Installation, update, rollback, start/stop and uninstall each have a final review. Live provider consent and ordinary module settings remain in the browser dashboard.", [
                    ("Install KekBot", "Create a new protected installation and claim the owner in your browser.", "install"),
                    ("Update an installation", "Choose stable/release/branch/PR/commit/bundle, prepare its image, stop, back up, migrate and verify readiness.", "update"),
                    ("Inspect status", "Show recorded version, source, image and current container health without printing environment or credentials.", "status"),
                    ("Start or resume", "Start the recorded version/data without reinitializing or reseeding.", "start"),
                    ("Stop", "Stop the app and managed proxy; keep all state and certificates.", "stop"),
                    ("Roll back the last update", "Restore the previous image and pre-update snapshot into a new data root. Changes made after that snapshot will not be present.", "rollback"),
                    ("Uninstall", "Remove managed containers. Keep data by default; complete purge requires an additional typed confirmation.", "uninstall"),
                    ("Exit", "Leave this menu.", "exit"),
                ])
                first = None
                if action == "exit":
                    return
                if action == "install":
                    advanced = args.advanced or args.source in ("branch", "pr", "commit", "bundle") or args.format == "source"
                    if not advanced:
                        advanced = choose("How would you like to set up KekBot?", "Start with recommended settings unless you already have another app on this server or need a custom layout. All normal features remain available in the dashboard.", [
                            ("Recommended setup", "Published image, standard storage and ports, with a guided choice of live bot or demo.", False),
                            ("Advanced setup", "Choose every host setting, version source, build format and Kick reply mode.", True),
                        ])
                    root, options = installation_options(args.root, advanced=advanced)
                    with tempfile.TemporaryDirectory(prefix="kekbot-install-stage-") as temporary:
                        target = source_selection(Path(temporary), selection, guided=not advanced)
                        confirm("Review installation", f"New directory: {root}\n\nProject: {options['project']}; mode: {options['mode']}; HTTPS: {options['proxy']}; origin: {options['origin']}; loopback port: {options['port']}; chat identity: {options['chatType']}.\n\nVersion: {target['version']}; commit: {target['sourceRef']}; format: {target['distribution']}.\n\nWill build/load the pinned app, optionally build Caddy, create private configuration/storage, initialize (seed only for fixtures), then start and check health. Existing installations are never adopted or overwritten. No provider credentials are requested. Builds may take several minutes and use network/disk/RAM.")
                        state = Installation(root).install(options, target)
                        next_steps(root, state)
                    if args.action:
                        return
                    continue
                root = validate_root(args.root or ask("Managed installation directory", "/srv/kekbot"))
                installation = Installation(root)
                state = installation.load()
                explain("Current installation", f"Directory: {root}; project: {state['options']['project']}; status: {state['status']}.\n\nVersion: {state['target']['version']}; commit: {state['target']['sourceRef']}; image: {state['imageId']}.\n\nData: {root / state['data']}; mode: {state['options']['mode']}; origin: {state['options']['origin']}.")
                if action == "status":
                    # Compose JSON status has no environment/credential values.
                    rows = installation.compose(state, "ps", "--all", "--format", "json")
                    for line in rows.splitlines():
                        row = json.loads(line)
                        print(f"{row.get('Service')}: {row.get('State')} ({row.get('Health', 'no health check')})")
                elif action == "update":
                    with tempfile.TemporaryDirectory(prefix="kekbot-update-stage-") as temporary:
                        advanced = args.advanced or args.source in ("branch", "pr", "commit", "bundle") or args.format == "source"
                        if not advanced and not args.source:
                            advanced = choose("Choose an update", "Recommended uses a published image and checks whether a stable release is available. Advanced keeps every version and build choice.", [
                                ("Recommended release", "Latest stable, or an explicit offer to try a beta when no stable exists.", False),
                                ("Advanced version choices", "A specific release, branch, PR, commit, source build or local bundle.", True),
                            ])
                        target = source_selection(Path(temporary), selection, guided=not advanced)
                        confirm("Review update", f"Update {root} to {target['version']} ({target['sourceRef']}) using {target['distribution']}.\n\nThe current image remains available. Prepare the new image before downtime; stop the app; wait for its lease; create a new database/asset snapshot; apply migrations; recreate; check readiness/integrity. Keys/config/proxy/origin/mode are preserved. Media requires deliberate moderator resume.\n\nOn failure, leave the app stopped and use Roll back. No downgrade is attempted against newer storage. Keep your independent encryption-key copy; backups do not contain it. Read the selected version's release notes and compatibility boundary before applying.")
                        installation.update(target)
                        print("Update complete. Verify provider connections, permissions, assets and queue before resuming your stream.")
                elif action in ("start", "stop", "rollback"):
                    descriptions = {"start": "Start the recorded app/proxy. No init, new owner or fixture reseed occurs.", "stop": "Stop the app and managed proxy. Data, keys, backups and certificates are kept.", "rollback": "Stop the current app. If migration was attempted, restore the pre-update snapshot into a new directory using the original keys, then start the previous image. Original/failed data remains for private inspection. Changes after the snapshot are absent; grants might require reauthorization. Never run both roots at once."}
                    confirm("Review " + action, descriptions[action])
                    getattr(installation, action)()
                    print(action.capitalize() + " complete.")
                elif action == "uninstall":
                    purge = choose("What should be removed?", "Removing containers does not revoke provider grants, delete provider applications, update DNS or remove Docker/Git. Do those separately if retiring the bot. No global Docker prune is ever run.", [
                        ("Containers only; keep all data (recommended)", "Retain database, assets, keys, environment, backups, management tool, images and certificate volumes. Completed installations can resume; incomplete updates still require recovery.", False),
                        ("Permanently purge this managed installation", "Delete the entire recorded directory, including backups and keys, and its managed certificate volumes. Docker images and all unrelated resources remain. Recovery is impossible without an independent backup AND original key.", True),
                    ])
                    backup_first = choose("Pre-uninstall backup", "A snapshot includes the database and assets, not encryption keys. In purge mode it is inside the directory being deleted, so it is not a recovery copy. Cancel and copy independent recovery material elsewhere before choosing purge.", [
                        ("Create a stopped-host snapshot first", "Abort removal if the snapshot fails. Recommended for container-only removal.", True),
                        ("Skip this snapshot", "Use only if you already have verified independent recovery material or deliberately accept losing it.", False),
                    ])
                    confirm("Final uninstall review", f"Directory: {root}; project: {state['options']['project']}.\n\n{'PERMANENT PURGE: database, assets, keys, environment and every backup below this root will be deleted; managed certificate volumes removed.' if purge else 'Remove containers only. Keep all installation files, keys, data and certificate volumes.'}\n\nPre-uninstall snapshot: {'yes' if backup_first else 'no'}. Verify the directory/project and any independent backup/key copy now.", "DELETE " + state["options"]["project"] if purge else "REMOVE CONTAINERS")
                    removed = installation.uninstall(purge=purge, backup_first=backup_first)
                    if not purge and removed["status"] != "uninstalled":
                        print("Containers removed; incomplete operation status and recovery checkpoints remain. Inspect status and the recovery guide before starting or updating.")
                    print("Uninstall complete. Revoke provider grants/apps and remove obsolete DNS/firewall rules yourself if retiring this installation.")
            except Cancelled:
                print("\nWalkthrough cancelled. No further actions will run.")
            except Problem as error:
                print("\nCould not complete: " + str(error))
                print("Inspect status and docs/INSTALLER.md recovery. Existing private state is retained unless you explicitly confirmed purge.")
                if args.action:
                    sys.exit(1)
            if args.action:
                return


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nInterrupted. Inspect status before restarting; use rollback for an incomplete update.")
        sys.exit(130)
    except (Problem, OSError, ValueError, KeyError) as error:
        print("\n" + (str(error) if isinstance(error, Problem) else "Configuration or storage could not be read. No private values were printed; inspect the installation privately."))
        sys.exit(1)
