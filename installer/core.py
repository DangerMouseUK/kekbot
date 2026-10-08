"""Dependency-free host lifecycle engine. UI lives in kekbot.py; no provider calls."""
from __future__ import annotations

import contextlib
import contextvars
import hashlib
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import socket
import subprocess
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

REPOSITORY = "https://github.com/DangerMouseUK/kekbot"
API = "https://api.github.com/repos/DangerMouseUK/kekbot"
SHA = re.compile(r"[a-f0-9]{40}\Z")
IMAGE_ID = re.compile(r"sha256:[a-f0-9]{64}\Z")
VERSION = re.compile(r"\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?\Z")


class Problem(Exception):
    """Safe user-facing explanation; subprocess bodies are never included."""


class Diagnostics:
    """Opt-in bounded metadata only: never command arguments, bodies or output."""
    def __init__(self, directory):
        self.directory = no_links(Path(directory))
        checkout = Path(__file__).resolve().parent.parent
        if not Path(directory).is_absolute() or checkout == self.directory or checkout in self.directory.parents:
            raise Problem("Diagnostics require an absolute private directory outside the source/tool checkout.")
        self.directory.mkdir(parents=True, mode=0o700, exist_ok=True)
        if not self.directory.is_dir():
            raise Problem("Diagnostics destination must be a directory.")
        if os.name == "posix" and (self.directory.stat().st_uid != os.geteuid() or self.directory.stat().st_mode & 0o077):
            raise Problem("Diagnostics directory must belong to this user with permissions 0700.")

    def record(self, operation, outcome, elapsed, code=None):
        try:
            path = no_links(self.directory / "lifecycle-diagnostics.log")
            if path.exists() and (not path.is_file() or path.stat().st_nlink != 1):
                return
            if path.exists() and path.stat().st_size >= 1024 * 1024:
                oldest = no_links(self.directory / "lifecycle-diagnostics.2.log")
                oldest.unlink(missing_ok=True)
                previous = no_links(self.directory / "lifecycle-diagnostics.1.log")
                if previous.exists():
                    os.replace(previous, oldest)
                os.replace(path, previous)
            descriptor = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                os.chmod(path, 0o600)
                output.write(json.dumps(dict(at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), operation=operation,
                    outcome=outcome, elapsedMs=round(elapsed * 1000), exitCode=code)) + "\n")
        except OSError:
            # Logging must never interrupt recovery or shutdown.
            pass
        except Problem:
            pass


_diagnostics = contextvars.ContextVar("kekbot_diagnostics", default=None)


@contextlib.contextmanager
def diagnostic_session(log):
    token = _diagnostics.set(log)
    try:
        yield
    finally:
        _diagnostics.reset(token)


def run(args, *, cwd=None, timeout=1200, env=None):
    # Store no subprocess output, even in private diagnostics. Build output may
    # contain credentials; the log carries only allowlisted stage/exit/timing.
    binary = Path(args[0]).name
    operation = binary if binary in ("docker", "git") else "subprocess"
    if operation in ("docker", "git") and len(args) > 1 and args[1] in ("build", "load", "save", "image", "inspect", "compose", "ps", "network", "volume", "info", "context", "clone", "fetch", "archive", "rev-parse", "--version"):
        operation += " " + args[1]
    started, outcome, code = time.monotonic(), "error", None
    try:
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            try:
                result = subprocess.run(args, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                        stdout=output, stderr=errors, timeout=timeout, check=False)
            except (OSError, subprocess.TimeoutExpired) as error:
                outcome = "timeout" if isinstance(error, subprocess.TimeoutExpired) else "unavailable"
                raise Problem("A required command could not finish. Check prerequisites, disk space and connectivity.") from error
            code = result.returncode
            if result.returncode:
                raise Problem(operation + " failed (exit " + str(code) + "). No command output or credentials were printed.")
            outcome = "success"
            output.seek(0)
            return output.read(4 * 1024 * 1024).decode("utf-8", errors="replace").strip()
    finally:
        log = _diagnostics.get()
        if log:
            log.record(operation, outcome, time.monotonic() - started, code)


def write_private(path, value):
    path = Path(path)
    if path.is_symlink():
        raise Problem("Refusing a symbolic-link destination.")
    temporary = path.with_name(path.name + ".new-" + uuid.uuid4().hex)
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(value)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)
    if os.name == "posix":
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def no_links(path):
    path = Path(path).absolute()
    if any(part.is_symlink() for part in [path, *path.parents]):
        raise Problem("Choose a real local path without symbolic links.")
    return path


def managed_path(root, relative):
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise Problem("Invalid managed path in the installation record.")
    parts = PurePosixPath(relative)
    if parts.is_absolute() or any(part in (".", "..") for part in parts.parts):
        raise Problem("Managed paths must stay inside this installation.")
    path = no_links(root / relative).resolve()
    if path == root or root not in path.parents:
        raise Problem("Managed paths must stay inside this installation.")
    return path


def validate_root(value, *, new=False):
    raw = Path(value).expanduser()
    if not raw.is_absolute():
        raise Problem("Use an absolute installation path.")
    if any(character in str(raw) for character in ("$", ":", "\\", "\n", "\r", "\x00")):
        raise Problem("Installation paths cannot contain interpolation, control or volume-separator characters.")
    root = no_links(raw).resolve()
    if len(root.parts) < 3:
        raise Problem("Choose a dedicated installation directory, not a checkout or system directory.")
    checkout = Path(__file__).resolve().parent.parent
    if (checkout / "package.json").is_file() and (checkout / "Dockerfile").is_file() and (checkout == root or checkout in root.parents or root in checkout.parents):
        raise Problem("Keep installation data outside the tool's source checkout.")
    if new and root.exists():
        raise Problem("The destination already exists. Use its management menu or choose a new directory.")
    return root


def validate_options(project, mode, proxy, origin, port, chat_type):
    if not re.fullmatch(r"kekbot(?:-[a-z0-9][a-z0-9-]{0,30})?", project):
        raise Problem("Project name must be kekbot or kekbot- followed by lowercase letters, numbers or hyphens.")
    if mode not in ("fixture", "live") or proxy not in ("domain", "ip", "external", "local"):
        raise Problem("Invalid operating mode or HTTPS choice.")
    if type(port) is not int or not 1024 <= port <= 65535 or chat_type not in ("user", "bot"):
        raise Problem("Choose an application port from 1024 to 65535 and a supported chat identity.")
    if not isinstance(origin, str) or any(ord(character) < 33 or ord(character) > 126 for character in origin) or any(character in origin for character in ("$", "\\", "\"", "'")):
        raise Problem("Use a plain ASCII origin without whitespace, interpolation or credentials.")
    url = urllib.parse.urlsplit(origin)
    if url.username or url.password or url.query or url.fragment or url.path or not url.hostname:
        raise Problem("Enter only the origin, for example https://bot.example; no path, credentials or trailing slash.")
    if mode == "fixture":
        if proxy != "local" or origin != f"http://127.0.0.1:{port}":
            raise Problem("Fixtures use loopback HTTP only and cannot enable the public proxy.")
    else:
        if proxy == "local" or url.scheme != "https":
            raise Problem("Live operation requires an explicit HTTPS origin.")
        if proxy in ("ip", "domain") and url.netloc != url.hostname:
            raise Problem("The bundled proxy requires HTTPS on its standard port.")
        if proxy == "external":
            try:
                if url.port is not None and not 1 <= url.port <= 65535:
                    raise ValueError()
                try:
                    ipaddress.ip_address(url.hostname)
                except ValueError:
                    if not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", url.hostname):
                        raise ValueError()
            except ValueError as error:
                raise Problem("Use a valid HTTPS hostname/IP and optional port for the existing proxy.") from error
        if proxy == "ip":
            try:
                address = ipaddress.IPv4Address(url.hostname)
                if not address.is_global:
                    raise ValueError()
            except ValueError as error:
                raise Problem("IP certificates require a public IPv4 address.") from error
        elif proxy == "domain" and not re.fullmatch(r"(?=.{1,253}\Z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", url.hostname):
            raise Problem("Enter a valid public DNS hostname.")
    return dict(project=project, mode=mode, proxy=proxy, origin=origin, port=port, chatType=chat_type)


def check_host():
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
        raise Problem("Managed installation supports Linux x86-64. Use the Docker Desktop/source guides elsewhere.")
    if os.geteuid() != 0:
        raise Problem("Run this reviewed tool with sudo for protected files and container UID 1000 ownership.")
    run(["git", "--version"])
    info = json.loads(run(["docker", "info", "--format", "{{json .}}"], timeout=30))
    if info.get("OSType") != "linux" or info.get("Architecture") not in ("x86_64", "amd64"):
        raise Problem("Docker must use a local Linux x86-64 daemon.")
    # Remote daemons interpret bind paths on another host; never guess that mapping.
    endpoint = json.loads(run(["docker", "context", "inspect"]))[0]["Endpoints"]["docker"]["Host"]
    if os.environ.get("DOCKER_HOST") or not endpoint.startswith("unix://"):
        raise Problem("Use the local Docker Unix socket context; remote Docker hosts are unsupported.")
    run(["docker", "compose", "version"], timeout=30)


class HTTPSOnly(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, url):
        if urllib.parse.urlsplit(url).scheme != "https":
            raise Problem("Refusing an insecure download redirect.")
        return super().redirect_request(request, fp, code, message, headers, url)


def download(url, destination, limit=2 * 1024**3):
    if urllib.parse.urlsplit(url).scheme != "https":
        raise Problem("Downloads require HTTPS with normal certificate validation.")
    request = urllib.request.Request(url, headers={"User-Agent": "KekBot-installer/1", "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.build_opener(HTTPSOnly()).open(request, timeout=60) as response, open(destination, "xb") as output:
            size = 0
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise Problem("Download exceeds the supported size limit.")
                output.write(chunk)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise Problem("No matching published release/ref exists. There may be no stable release yet; explicitly choose a branch or PR for evaluation.") from error
        raise Problem("GitHub refused the request. Check its availability or API rate limit; try again later.") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise Problem("Download failed. Check network access, trusted certificates and free disk space.") from error


def api_json(path, directory):
    target = directory / (uuid.uuid4().hex + ".json")
    download(API + path, target, limit=8 * 1024**2)
    return json.loads(target.read_text())


def checksum(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def checksum_index(path):
    result = {}
    for line in path.read_text().splitlines():
        match = re.fullmatch(r"([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]{0,199})", line)
        if not match or match[2] in result:
            raise Problem("Invalid or duplicate release checksum entry.")
        result[match[2]] = match[1]
    return result


def verify_file(directory, name, sums):
    if not isinstance(name, str) or name not in sums or Path(name).name != name:
        raise Problem("Release file is missing from SHA256SUMS.")
    path = directory / name
    if path.is_symlink() or not path.is_file() or checksum(path) != sums[name]:
        raise Problem("Release checksum mismatch or missing file. Nothing was installed.")
    return path


def extract_source(archive, destination):
    # Do not use extractall: allow only bounded ordinary files/directories under
    # one prefix. Reject links/devices, traversal, duplicates and archive bombs.
    with tarfile.open(archive, "r:gz") as bundle:
        entries = bundle.getmembers()
        if not entries or len(entries) > 20000 or sum(entry.size for entry in entries) > 512 * 1024**2:
            raise Problem("Source archive exceeds supported limits.")
        seen, prefixes = set(), set()
        for entry in entries:
            path = PurePosixPath(entry.name)
            if path.is_absolute() or ".." in path.parts or "\\" in entry.name or not path.parts or not (entry.isfile() or entry.isdir()) or entry.name in seen:
                raise Problem("Unsafe source archive member.")
            seen.add(entry.name)
            prefixes.add(path.parts[0])
        if len(prefixes) != 1:
            raise Problem("Source archive must have one top-level directory.")
        destination.mkdir(mode=0o700)
        for entry in entries:
            relative = PurePosixPath(entry.name).parts[1:]
            if not relative:
                continue
            target = destination.joinpath(*relative)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if entry.isdir():
                target.mkdir(exist_ok=True, mode=0o700)
            else:
                with bundle.extractfile(entry) as source, open(target, "xb") as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o700 if entry.mode & 0o111 else 0o600)
    if not (destination / "Dockerfile").is_file() or not (destination / "package.json").is_file():
        raise Problem("Archive is not a KekBot source package.")


def prepare_target(kind, value, distribution, directory):
    """Resolve/download only. Never execute selected code before UI review."""
    directory = Path(directory)
    if kind in ("branch", "pr", "commit"):
        if distribution != "source":
            raise Problem("Branches, PRs and commits must build from source.")
        if kind == "branch":
            if not value or len(value) > 200 or value.startswith("-") or not re.fullmatch(r"[A-Za-z0-9_./-]+", value):
                raise Problem("Enter an existing branch name.")
            ref = "refs/heads/" + value
            run(["git", "check-ref-format", ref])
        elif kind == "pr":
            if not re.fullmatch(r"[1-9][0-9]{0,7}", value):
                raise Problem("Enter a positive PR number, without #.")
            ref = f"refs/pull/{value}/head"
        else:
            if not SHA.fullmatch(value):
                raise Problem("Enter the full 40-character lowercase commit SHA.")
            ref = value
        git = directory / "git"
        run(["git", "init", "--quiet", str(git)])
        run(["git", "-C", str(git), "fetch", "--depth=1", "--no-tags", REPOSITORY + ".git", ref])
        sha = run(["git", "-C", str(git), "rev-parse", "FETCH_HEAD"])
        if not SHA.fullmatch(sha) or kind == "commit" and sha != value:
            raise Problem("Source commit identity did not match.")
        archive = directory / "source.tar.gz"
        run(["git", "-C", str(git), "archive", "--format=tar.gz", "--prefix=kekbot/", "--output", str(archive), sha])
        source = directory / "source"
        extract_source(archive, source)
        version = json.loads((source / "package.json").read_text())["version"]
        if not VERSION.fullmatch(version):
            raise Problem("Invalid application version.")
        return dict(kind=kind, value=value, distribution="source", sourceRef=sha, version=version, source=str(source), image=None, accepted=False)
    if kind not in ("stable", "release", "bundle") or distribution not in ("source", "image"):
        raise Problem("Unknown source selection.")
    if kind == "bundle":
        bundle = no_links(Path(value).expanduser())
        if not bundle.is_dir():
            raise Problem("Choose the directory containing release.json and SHA256SUMS.")
    else:
        release = api_json("/releases/latest" if kind == "stable" else "/releases/tags/" + urllib.parse.quote(value, safe=""), directory)
        if release.get("draft") or kind == "stable" and release.get("prerelease"):
            raise Problem("The default accepts only a published stable release.")
        value = release["tag_name"]
        assets = {asset["name"]: asset["browser_download_url"] for asset in release["assets"]}
        bundle = directory / "bundle"
        bundle.mkdir(mode=0o700)

        def fetch(name):
            url = assets.get(name, "")
            if not url.startswith(REPOSITORY + "/releases/download/"):
                raise Problem("Required audited release assets are missing. Automatic GitHub source zips are not installer bundles.")
            download(url, bundle / name)

        fetch("SHA256SUMS")
        fetch("release.json")
    sums = checksum_index(bundle / "SHA256SUMS")
    metadata = json.loads(verify_file(bundle, "release.json", sums).read_text())
    if metadata.get("format") != "kekbot-release" or metadata.get("version") != 1 or not SHA.fullmatch(metadata.get("sourceRef", "")) or not VERSION.fullmatch(metadata.get("applicationVersion", "")):
        raise Problem("Unsupported release metadata.")
    accepted = metadata.get("status") == "acceptance-verified-unpublished"
    if kind == "stable" and (not accepted or not re.fullmatch(r"[1-9]\d*\.\d+\.\d+", metadata["applicationVersion"])):
        raise Problem("Latest release does not carry the required stable acceptance metadata.")
    if metadata.get("schemaVersion") not in (2, 3) or metadata.get("backupFormat") != 1:
        raise Problem("This installer cannot manage that schema/backup boundary. Use its matching installer and upgrade notes.")
    source_name = metadata.get("sourceArchive")
    required = [source_name]
    image_name = None
    if distribution == "image":
        image = metadata.get("image") or {}
        candidates = [name for name in sums if name.endswith("-linux-amd64-image.tar.gz")]
        if len(candidates) != 1 or not IMAGE_ID.fullmatch(image.get("imageId", "")) or image.get("platform") != "linux/amd64":
            raise Problem("This bundle has no supported prebuilt image. Explicitly select source build instead.")
        image_name = candidates[0]
        required += [image_name]
        notices = [name for name in sums if name.endswith("-notices.tar.gz")]
        if len(notices) != 1:
            raise Problem("Prebuilt release notices are missing.")
        required += notices
    for name in required:
        if not isinstance(name, str) or name not in sums:
            raise Problem("Required release asset is missing.")
        if kind != "bundle":
            fetch(name)
        verify_file(bundle, name, sums)
    source = directory / "source"
    extract_source(bundle / source_name, source)
    if json.loads((source / "package.json").read_text())["version"] != metadata["applicationVersion"]:
        raise Problem("Release source version mismatch.")
    return dict(kind=kind, value=value, distribution=distribution, sourceRef=metadata["sourceRef"], version=metadata["applicationVersion"], source=str(source), image=metadata.get("image") if distribution == "image" else None, archive=str(bundle / image_name) if image_name else None, accepted=accepted)


def verify_image(image, target, command=run):
    inspection = json.loads(command(["docker", "image", "inspect", image]))[0]
    labels = inspection.get("Config", {}).get("Labels", {}) or {}
    if not IMAGE_ID.fullmatch(inspection.get("Id", "")) or inspection.get("Os") != "linux" or inspection.get("Architecture") != "amd64" or inspection["Config"].get("User") not in ("node", "1000", "1000:1000") or labels.get("org.opencontainers.image.revision") != target["sourceRef"] or labels.get("org.opencontainers.image.version") != target["version"] or labels.get("org.opencontainers.image.source") != REPOSITORY or labels.get("org.opencontainers.image.licenses") != "MIT":
        raise Problem("Image identity, platform, version or non-root user did not match.")
    if target.get("image") and inspection["Id"] != target["image"]["imageId"]:
        raise Problem("Loaded image differs from the recorded release image.")
    return inspection["Id"]


def compose_spec(root, state):
    config = state["options"]
    data = managed_path(root, state["data"])
    service = dict(image=state["imageId"], pull_policy="never", init=True, restart="unless-stopped",
                   env_file=[str(root / "runtime.env")], environment={"KEKBOT_DATA_DIR": "/data", "HOSTNAME": "0.0.0.0", "PORT": "3000"},
                   ports=[f"127.0.0.1:{config['port']}:3000"],
                   volumes=[{"type": "bind", "source": str(data), "target": "/data"}], stop_grace_period="30s")
    spec = {"services": {"kekbot": service}}
    if config["proxy"] in ("domain", "ip"):
        hostname = urllib.parse.urlsplit(config["origin"]).hostname
        spec["services"]["proxy"] = dict(image=state["proxyImageId"], pull_policy="never", restart="unless-stopped", ports=["80:80", "443:443"],
            environment={"KEKBOT_DOMAIN" if config["proxy"] == "domain" else "KEKBOT_PUBLIC_IP": hostname},
            volumes=[{"type": "bind", "source": str(root / "proxy" / ("Caddyfile" if config["proxy"] == "domain" else "Caddyfile.ip")), "target": "/etc/caddy/Caddyfile", "read_only": True}, "certificates:/data", "certificate_config:/config"])
        spec["volumes"] = {"certificates": {"name": config["project"] + "-certificates"}, "certificate_config": {"name": config["project"] + "-certificate-config"}}
    return spec


class Installation:
    def __init__(self, root, *, command=run, progress=print):
        self.root = validate_root(str(root))
        self.command, self.progress = command, progress

    def load(self):
        record = no_links(self.root / "installation.json")
        state = json.loads(record.read_text())
        if state.get("format") != "kekbot-installation" or state.get("version") != 1 or not re.fullmatch(r"[a-f0-9]{32}", state.get("id", "")):
            raise Problem("This is not a supported managed installation.")
        options = state["options"]
        validate_options(options["project"], options["mode"], options["proxy"], options["origin"], options["port"], options["chatType"])
        managed_path(self.root, state["data"])
        if not IMAGE_ID.fullmatch(state["imageId"]):
            raise Problem("Invalid installed image identity.")
        if options["proxy"] in ("domain", "ip") and not IMAGE_ID.fullmatch(state.get("proxyImageId", "")):
            raise Problem("The proxy preparation is incomplete. Preserve state and follow failed-install recovery.")
        return state

    @contextlib.contextmanager
    def lock(self):
        # Linux-only at execution. A second management process must not race a
        # backup, migration, rollback or purge.
        import fcntl
        with open(no_links(self.root / ".management.lock"), "a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise Problem("Another lifecycle command is running for this installation.") from error
            yield

    def save(self, state):
        write_private(self.root / "installation.json", json.dumps(state, indent=2) + "\n")

    def configure(self, state):
        write_private(self.root / "compose.json", json.dumps(compose_spec(self.root, state), indent=2) + "\n")

    def fail_and_stop(self, state, status, *services):
        state["status"] = status
        try:
            self.save(state)
        finally:
            # A full/read-only filesystem must not prevent runtime shutdown.
            with contextlib.suppress(Problem):
                self.compose(state, "stop", *services)

    def compose(self, state, *args):
        return self.command(["docker", "compose", "--project-name", state["options"]["project"], "--file", str(self.root / "compose.json"), *args], cwd=self.root)

    def cli(self, state, *args):
        return json.loads(self.compose(state, "run", "--rm", "--no-deps", "kekbot", "node", "src/cli.ts", *args))

    def stage_image(self, target):
        self.progress("Preparing the selected image before stopping the installed application. Source builds may take several minutes.")
        if target["distribution"] == "image":
            self.command(["docker", "load", "--input", target["archive"]])
            image = target["image"]["imageId"]
        else:
            image = "kekbot-managed:" + uuid.uuid4().hex
            self.command(["docker", "build", "--build-arg", "VCS_REF=" + target["sourceRef"], "--build-arg", "VERSION=" + target["version"], "--tag", image, target["source"]])
        return verify_image(image, target, self.command)

    def wait_ready(self, state):
        self.progress("Waiting for container readiness (up to two minutes).")
        for _ in range(60):
            containers = self.compose(state, "ps", "--quiet", "kekbot")
            if containers:
                status = self.command(["docker", "inspect", "--format", "{{.State.Health.Status}}", containers])
                if status == "healthy":
                    diagnosis = self.cli(state, "doctor")
                    if diagnosis.get("integrity") == "ok":
                        return
                    raise Problem("Database diagnostics failed; leave the application stopped and inspect recovery guidance.")
            time.sleep(2)
        raise Problem("Startup did not become healthy. Use status, the troubleshooting guide and rollback; do not rerun migrations blindly.")

    def install(self, options, target):
        validate_root(str(self.root), new=True)
        validate_options(options["project"], options["mode"], options["proxy"], options["origin"], options["port"], options["chatType"])
        project = options["project"]
        if self.command(["docker", "ps", "--all", "--quiet", "--filter", "label=com.docker.compose.project=" + project]) or self.command(["docker", "network", "ls", "--quiet", "--filter", "label=com.docker.compose.project=" + project]):
            raise Problem("That Compose project already has resources. Manage the existing installation or choose a unique name.")
        volumes = self.command(["docker", "volume", "ls", "--format", "{{.Name}}"]).splitlines()
        if any(project + suffix in volumes for suffix in ("-certificates", "-certificate-config")):
            raise Problem("That project already has certificate volumes. Do not adopt another installation's state.")
        for address, port in [("127.0.0.1", options["port"])] + ([("0.0.0.0", 80), ("0.0.0.0", 443)] if options["proxy"] in ("domain", "ip") else []):
            try:
                with socket.socket() as probe:
                    probe.bind((address, port))
            except OSError as error:
                raise Problem("A selected application/proxy port is unavailable. Choose a free port or an existing reverse proxy.") from error
        image_id = self.stage_image(target)
        tool = Path(__file__).resolve().parent
        deploy = tool.parent / "deploy"
        if not deploy.is_dir():
            deploy = tool / "deploy"
        proxy_files = ("Caddyfile", "Caddyfile.ip", "Caddy.Dockerfile")
        proxy_image_id = None
        if options["proxy"] in ("domain", "ip"):
            self.progress("Building the pinned Caddy proxy before creating installation state. DNS and ports remain your responsibility.")
            with tempfile.TemporaryDirectory(prefix="kekbot-proxy-stage-") as temporary:
                context = Path(temporary)
                for name in proxy_files:
                    shutil.copyfile(deploy / name, context / name)
                proxy_tag = "kekbot-caddy-managed:" + uuid.uuid4().hex
                self.command(["docker", "build", "--file", str(context / "Caddy.Dockerfile"), "--tag", proxy_tag, str(context)])
                proxy_image_id = self.command(["docker", "image", "inspect", "--format", "{{.Id}}", proxy_tag])
                if not IMAGE_ID.fullmatch(proxy_image_id):
                    raise Problem("Proxy image identity could not be verified. No installation state was created.")
        self.root.mkdir(parents=True, mode=0o700)
        self.root.chmod(0o700)
        state = dict(format="kekbot-installation", version=1, id=uuid.uuid4().hex, status="installing", options=options, data="data", imageId=image_id,
                     target={key: target[key] for key in ("kind", "value", "distribution", "sourceRef", "version", "accepted")}, previous=None)
        if proxy_image_id:
            state["proxyImageId"] = proxy_image_id
        self.save(state)
        with self.lock():
            data = self.root / "data"
            data.mkdir(mode=0o700)
            os.chown(data, 1000, 1000)
            for name in ("backups", "recovery", "tool", "proxy"):
                (self.root / name).mkdir(mode=0o700)
            os.chown(self.root / "backups", 1000, 1000)
            for name in ("core.py", "kekbot.py"):
                shutil.copyfile(tool / name, self.root / "tool" / name)
            for name in proxy_files:
                shutil.copyfile(deploy / name, self.root / "proxy" / name)
            shutil.copytree(self.root / "proxy", self.root / "tool" / "deploy")
            mode, origin = options["mode"], options["origin"]
            write_private(self.root / "runtime.env", f"KEKBOT_MODE={mode}\nKEKBOT_RUN_JOBS=1\nKEKBOT_ENABLE_PROOF=0\nNEXT_TELEMETRY_DISABLED=1\nKEKBOT_PUBLIC_URL={origin}\nKICK_CHAT_TYPE={options['chatType']}\nKICK_CLIENT_ID=\nKICK_CLIENT_SECRET=\nKICK_BROADCASTER_USER_ID={'123' if mode == 'fixture' else ''}\n")
            self.configure(state)
            self.save(state)
            try:
                self.compose(state, "config", "--quiet")
                self.progress("Initializing local storage and preserving separately generated keys.")
                self.cli(state, "init")
                if mode == "fixture":
                    self.cli(state, "fixture-seed")
                self.compose(state, "up", "--detach", "--no-build")
                self.wait_ready(state)
                state["status"] = "ready"
                self.save(state)
            except BaseException:
                self.fail_and_stop(state, "install-failed")
                raise
        return state

    def backup(self, state):
        self.progress("Stopping KekBot and creating a database/asset backup. Keys remain separate.")
        self.compose(state, "stop", "kekbot")
        # A forced previous exit may leave the durable 30-second instance lease.
        diagnosis = self.cli(state, "doctor")
        expiry = (diagnosis.get("instanceLease") or {}).get("expiresAt", 0)
        remaining = max(0, expiry / 1000 - time.time())
        if remaining > 31:
            raise Problem("The installation lease is unexpectedly far in the future. Check the host clock before maintenance.")
        if remaining:
            time.sleep(remaining + 0.1)
        name = "before-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + uuid.uuid4().hex[:8]
        self.compose(state, "run", "--rm", "--no-deps", "--volume", str(self.root / "backups") + ":/backups", "kekbot", "node", "src/cli.ts", "backup", "/backups/" + name)
        snapshot = self.root / "backups" / name
        if not (snapshot / "manifest.json").is_file():
            raise Problem("Backup did not complete. Update stopped before migration; preserve current data.")
        return "backups/" + name

    def update(self, target):
        with self.lock():
            old = self.load()
            if old["status"] not in ("ready", "stopped", "uninstalled"):
                raise Problem("Resolve the previous incomplete operation before updating. Use rollback or the recovery guide.")
            image_id = self.stage_image(target)
            if image_id == old["imageId"]:
                self.progress("This exact image is already installed; no stop or migration needed.")
                return old
            old = dict(old, previous=None)
            state = dict(old, status="updating", previous={"state": old, "backup": None, "phase": "stopping"})
            self.save(state)
            try:
                state["previous"]["backup"] = self.backup(old)
                state["previous"]["phase"] = "backed-up"
                self.save(state)
                state["imageId"] = image_id
                state["target"] = {key: target[key] for key in ("kind", "value", "distribution", "sourceRef", "version", "accepted")}
                self.configure(state)
                state["previous"]["phase"] = "migrating"
                self.save(state)
                self.progress("Applying checked-in migrations while the application is stopped.")
                self.cli(state, "init")
                self.compose(state, "up", "--detach", "--no-build", "--force-recreate")
                self.wait_ready(state)
                state["status"] = "ready"
                self.save(state)
                return state
            except BaseException:
                self.fail_and_stop(state, "update-failed", "kekbot")
                raise

    def rollback(self):
        with self.lock():
            current = self.load()
            previous = current.get("previous")
            if not previous:
                raise Problem("No managed pre-update checkpoint exists. Follow manual backup recovery.")
            old = previous["state"]
            if old.get("id") != current["id"] or old.get("options") != current["options"] or not IMAGE_ID.fullmatch(old.get("imageId", "")):
                raise Problem("Recovery checkpoint does not match this installation.")
            current["status"] = "rolling-back"
            self.save(current)
            try:
                self.compose(current, "stop", "kekbot")
                state = dict(old, previous=None, status="rolling-back")
                if previous["phase"] == "migrating":
                    backup = managed_path(self.root, previous["backup"])
                    relative = "recovery/" + uuid.uuid4().hex
                    destination = managed_path(self.root, relative)
                    mode = old["options"]["mode"]
                    secrets = managed_path(self.root, old["data"]) / mode / "secrets"
                    no_links(secrets)
                    for item in secrets.iterdir():
                        if item.is_symlink() or not item.is_file():
                            raise Problem("Unexpected secret-file type. Resolve it privately before recovery.")
                    shutil.copytree(secrets, destination / mode / "secrets")
                    for path in [destination, *destination.rglob("*")]:
                        os.chown(path, 1000, 1000)
                        path.chmod(0o700 if path.is_dir() else 0o600)
                    state["data"] = relative
                    self.configure(state)
                    self.compose(state, "run", "--rm", "--no-deps", "--volume", str(backup) + ":/restore:ro", "kekbot", "node", "src/cli.ts", "restore", "/restore")
                else:
                    # No migration was attempted: original storage is still valid.
                    self.configure(state)
                self.cli(state, "doctor")
                self.compose(state, "up", "--detach", "--no-build", "--force-recreate")
                self.wait_ready(state)
                state["status"] = "ready"
                self.save(state)
                return state
            except BaseException:
                self.fail_and_stop(current, "rollback-failed", "kekbot")
                raise

    def start(self):
        with self.lock():
            state = self.load()
            if state["status"] not in ("ready", "stopped", "uninstalled", "install-failed", "installing"):
                raise Problem("Resolve the failed update with rollback before starting.")
            self.configure(state)
            # No migration here: failed initialization requires manual recovery.
            self.cli(state, "doctor")
            try:
                self.compose(state, "up", "--detach", "--no-build")
                self.wait_ready(state)
                state["status"] = "ready"
                self.save(state)
            except BaseException:
                # Keep failed initialization retryable; update recovery stays guarded.
                self.fail_and_stop(state, "stopped" if state["status"] in ("ready", "stopped", "uninstalled") else state["status"])
                raise
            return state

    def stop(self):
        with self.lock():
            state = self.load()
            self.compose(state, "stop")
            if state["status"] in ("ready", "stopped", "uninstalled"):
                state["status"] = "stopped"
            self.save(state)

    def uninstall(self, *, purge=False, backup_first=True):
        with self.lock():
            state = self.load()
            if backup_first:
                self.backup(state)
            self.compose(state, "down", "--remove-orphans")
            # Removing containers must not clear an incomplete operation's
            # recovery guard or allow another update to replace its checkpoint.
            if state["status"] in ("ready", "stopped", "uninstalled"):
                state["status"] = "uninstalled"
            self.save(state)
            if purge:
                # Refuse hidden mount/symlink surprises. Never use docker prune
                # or delete outside the recorded, exclusively managed root.
                if os.path.ismount(self.root):
                    raise Problem("Purge refused a mounted installation root. Data is retained.")
                for parent, directories, files in os.walk(self.root, followlinks=False):
                    if any((Path(parent) / name).is_symlink() for name in directories + files):
                        raise Problem("Purge refused a symbolic link. Containers are removed; data is retained for inspection.")
                    if Path(parent) != self.root and os.path.ismount(parent):
                        raise Problem("Purge refused a nested mount. Containers are removed; data is retained.")
                if state["options"]["proxy"] in ("domain", "ip"):
                    existing = self.command(["docker", "volume", "ls", "--format", "{{.Name}}"]).splitlines()
                    for suffix in ("-certificates", "-certificate-config"):
                        if state["options"]["project"] + suffix in existing:
                            self.command(["docker", "volume", "rm", state["options"]["project"] + suffix])
                shutil.rmtree(self.root)
        return state
