#!/usr/bin/env bash
# Download this file, review it, then run with Bash. Never pipe it into a shell.
# Linux host launcher; application decisions remain in installer/kekbot.py.

usage() {
  cat <<'HELP'
KekBot guided launcher — Linux x86-64

  bash install.sh                         Explained install/manage menu
  bash install.sh install                  Install a new instance
  bash install.sh update --root /srv/kekbot Update an existing instance
  bash install.sh status|start|stop|rollback|uninstall --root /srv/kekbot
  bash install.sh --check                  Offline host readiness report
  bash install.sh --setup                  Optional Ubuntu 24.04 prerequisite setup
  bash install.sh --prepare-only           Download tools for inspection; do not run

Application choices (install/update only; interactive choices remain available):
  --stable                 Latest accepted stable (never falls back to a beta)
  --release TAG            Exact published release, including explicit betas
  --branch NAME            Build a pinned repository branch
  --pr NUMBER              Build a pinned PR head
  --commit FULL_SHA        Build an exact lowercase 40-character commit
  --bundle DIRECTORY       Local audited release bundle
  --format image|source    Release/bundle format; branches/PRs/commits use source

Management tool choices (separate from the application version):
  --tool-branch NAME       Download this branch (new installations default to main)
  --tool-release TAG       Download tools from an exact tag
  --tool-pr NUMBER         Download tools from a PR head
  --tool-commit FULL_SHA   Download tools from an exact commit
  --local-tools DIRECTORY  Explicitly use a reviewed checkout or copied tool
  --diagnostics-dir PATH   Opt-in private bounded lifecycle metadata
  --action ACTION          Same as the positional action; menu opens the full wizard
  -h, --help               Help without root, Docker, network or a terminal

Existing instances reuse their protected copied tool unless a tool source is
explicitly selected. New downloads are pinned, staged privately and require
TRUST <first 12 SHA characters> before execution. --prepare-only retains its
private download for review. There is no --yes, silent upgrade or automatic
purge. All lifecycle changes still require the wizard's final confirmation.
HELP
}

fail() { printf '\nKekBot: %s\n' "$*" >&2; exit 1; }
title() { printf '\n=== %s ===\n\n' "$*"; }
answer() {
  read -r -p "$1" REPLY || exit 130
  case "$REPLY" in q|quit|cancel) printf 'Cancelled.\n'; exit 0 ;; esac
}
select_app() {
  [[ -z "$app_kind" ]] || fail 'Choose only one application source.'
  app_kind=$1; app_value=$2
}
select_tool() {
  [[ "$tool_explicit" == 0 ]] || fail 'Choose only one management tool source.'
  tool_kind=$1; tool_value=$2; tool_explicit=1
}
validate_root_arg() {
  [[ "$root" == /* && "$root" != / && "/$root/" != */../* && "/$root/" != */./* ]] || fail '--root must be an absolute dedicated directory without dot segments.'
}
parse_args() {
  action=; root=; app_kind=; app_value=; format=; diagnostics=
  tool_kind=branch; tool_value=main; tool_explicit=0; local_tools=
  check_only=0; setup_only=0; prepare_only=0
  while (($#)); do
    case "$1" in
      -h|--help) usage; return 2 ;;
      --check|doctor) check_only=1; shift ;;
      --setup) setup_only=1; shift ;;
      --prepare-only) prepare_only=1; shift ;;
      --stable) select_app stable ''; shift ;;
      --root|--action|--format|--diagnostics-dir|--local-tools|--release|--branch|--pr|--commit|--bundle|--tool-branch|--tool-release|--tool-pr|--tool-commit)
        (($# >= 2)) && [[ -n "$2" ]] || fail 'An option is missing its value; see --help.'
        case "$1" in
          --root) root=$2 ;;
          --action) [[ -z "$action" ]] || fail 'Choose only one action.'; action=$2 ;;
          --format) format=$2 ;;
          --diagnostics-dir) diagnostics=$2 ;;
          --local-tools) select_tool local "$2"; local_tools=$2 ;;
          --tool-*) select_tool "${1#--tool-}" "$2" ;;
          --*) select_app "${1#--}" "$2" ;;
        esac
        shift 2 ;;
      install|update|status|start|stop|rollback|uninstall|menu)
        [[ -z "$action" ]] || fail 'Choose only one action.'; action=$1; shift ;;
      *) fail 'Unknown argument; see bash install.sh --help.' ;;
    esac
  done
  case "$action" in ''|menu|install|update|status|start|stop|rollback|uninstall) ;; *) fail 'Unknown action.' ;; esac
  [[ -z "$format" || "$format" == image || "$format" == source ]] || fail 'Format must be image or source.'
  if [[ -n "$app_kind$format" ]]; then
    [[ -z "$action" || "$action" == menu || "$action" == install || "$action" == update ]] || fail 'Application choices apply only to install/update.'
    [[ -n "$app_kind" ]] || fail '--format needs an explicit application source.'
    [[ "$format" != image || "$app_kind" == stable || "$app_kind" == release || "$app_kind" == bundle ]] || fail 'Branches, PRs and commits build from source.'
  fi
  ((check_only + setup_only + prepare_only <= 1)) || fail 'Choose only one of --check, --setup and --prepare-only.'
  if ((check_only || setup_only || prepare_only)); then
    [[ -z "$action$root$app_kind$format$diagnostics" ]] || fail 'Readiness/setup/prepare modes cannot perform lifecycle actions.'
  fi
  if ((prepare_only)); then [[ -z "$local_tools" ]] || fail '--prepare-only downloads tools; omit --local-tools.'; fi
  if [[ -n "$root" ]]; then
    validate_root_arg
  fi
  return 0
}

platform_check() {
  [[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || fail 'Use a Linux x86-64 host. Windows/macOS evaluation: docs/DOCKER_DESKTOP.md.'
}
python_ready() { command -v python3 >/dev/null && python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' >/dev/null 2>&1; }
host_report() {
  local missing=0
  title 'Host readiness (no changes)'
  if python_ready; then printf 'OK   Python 3.10+\n'; else printf 'NEED Python 3.10+\n'; missing=1; fi
  if command -v git >/dev/null; then printf 'OK   Git\n'; else printf 'NEED Git\n'; missing=1; fi
  if command -v docker >/dev/null && docker info >/dev/null 2>&1; then printf 'OK   Reachable Docker Engine\n'; else printf 'NEED Local Docker Engine (or administrator access/service repair)\n'; missing=1; fi
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then printf 'OK   Docker Compose v2\n'; else printf 'NEED Docker Compose v2\n'; missing=1; fi
  if [[ -n "${DOCKER_HOST:-}" ]]; then printf 'NEED Unset DOCKER_HOST; use a local Unix-socket context\n'; missing=1; fi
  printf '\nThe wizard also verifies Docker architecture/context, paths and permissions.\n'
  printf 'Allow disk space for images, assets, backups and separate recovery roots.\n'
  printf 'Live use needs reachable HTTPS and owner-controlled provider applications.\n'
  return "$missing"
}
require_root() {
  if ((EUID != 0)); then
    fail 'Run this reviewed file with sudo bash install.sh (and the same options). --check and --prepare-only do not require sudo.'
  fi
}
ubuntu_supported() {
  [[ -f /etc/os-release ]] || return 1
  local ID= VERSION_ID=; source /etc/os-release
  [[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]]
}
prepare_docker_repo() {
  local key=/etc/apt/keyrings/kekbot-docker.asc sources=/etc/apt/sources.list.d/kekbot-docker.sources
  [[ ! -L /etc/apt/keyrings && ! -L /etc/apt/sources.list.d && ! -L "$key" && ! -L "$sources" ]] || fail 'Refusing linked apt configuration paths.'
  local expected=$'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: noble\nComponents: stable\nArchitectures: amd64\nSigned-By: /etc/apt/keyrings/kekbot-docker.asc'
  [[ ! -e "$sources" || "$(cat "$sources")" == "$expected" ]] || fail 'Existing KekBot Docker repository configuration differs; inspect it manually.'
  install -m 0755 -d /etc/apt/keyrings
  key_stage=$(mktemp /tmp/kekbot-docker-key.XXXXXXXX)
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --max-time 60 --max-filesize 2097152 --retry 2 https://download.docker.com/linux/ubuntu/gpg -o "$key_stage" 2>/dev/null || fail 'Docker signing-key download failed; retry with trusted HTTPS.'
  install -m 0644 "$key_stage" "$key"; rm -f -- "$key_stage"; key_stage=
  printf '%s\n' "$expected" > "$sources"; chmod 0644 "$sources"
}
setup_host() {
  require_root
  ubuntu_supported || fail 'Use your distribution and Docker installation guides; automatic assistance supports Ubuntu 24.04 only.'
  local docker_new=0 package
  local packages=()
  command -v git >/dev/null || packages+=(git)
  python_ready || packages+=(python3)
  command -v curl >/dev/null || packages+=(curl)
  [[ -s /etc/ssl/certs/ca-certificates.crt ]] || packages+=(ca-certificates)
  if ! command -v docker >/dev/null; then
    docker_new=1
    for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
      if [[ "$(dpkg-query -W -f='${db:Status-Status}' "$package" 2>/dev/null || true)" == installed ]]; then
        fail 'Conflicting Docker/container packages are installed. Resolve them using Docker official instructions; this launcher never removes host packages.'
      fi
    done
    [[ ! -e /etc/apt/sources.list.d/docker.sources && ! -e /etc/apt/sources.list.d/docker.list ]] || fail 'An existing Docker repository needs manual review before installation.'
  fi
  title 'Review optional Ubuntu prerequisites'
  printf 'Missing host packages: %s\n' "${packages[*]:-none}"
  if ((docker_new)); then
    printf 'Add Docker official HTTPS apt repository and signing key; install Docker Engine,\nCLI, containerd, Buildx and Compose plugins; enable/start the Docker service.\n'
  else
    printf 'Keep existing Docker packages, service configuration and resources unchanged.\n'
  fi
  printf '\nApt may update required dependencies; this does not run apt upgrade.\nPackage setup may survive a failure. No SSH, DNS, firewall or user-group edits;\nno package removal or Docker pruning.\n'
  printf 'Reference: https://docs.docker.com/engine/install/ubuntu/\n'
  answer 'Type INSTALL PREREQUISITES to apply, or q to cancel: '
  [[ "$REPLY" == 'INSTALL PREREQUISITES' ]] || fail 'Prerequisite setup was not confirmed.'
  if ((${#packages[@]})); then
    apt-get -o DPkg::Lock::Timeout=120 update >/dev/null 2>&1
    DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=120 install -y --no-install-recommends "${packages[@]}" >/dev/null 2>&1
  fi
  if ((docker_new)); then
    prepare_docker_repo
    apt-get -o DPkg::Lock::Timeout=120 update >/dev/null 2>&1
    DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=120 install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null 2>&1
    systemctl enable --now docker >/dev/null 2>&1
  fi
  host_report || fail 'Prerequisites are incomplete. Inspect installed packages/Docker service privately; see docs/LAUNCHER.md. Existing state was not removed.'
}

tool_ref() {
  case "$tool_kind" in
    branch|release)
      [[ "$tool_value" =~ ^[A-Za-z0-9_./-]+$ && ${#tool_value} -le 200 && "$tool_value" != -* ]] || fail 'Invalid tool branch/tag.'
      if [[ "$tool_kind" == branch ]]; then resolved_ref="refs/heads/$tool_value"; else resolved_ref="refs/tags/$tool_value"; fi
      git check-ref-format "$resolved_ref" >/dev/null 2>&1 || fail 'Invalid tool branch/tag.' ;;
    pr) [[ "$tool_value" =~ ^[1-9][0-9]{0,7}$ ]] || fail 'Invalid tool PR number.'; resolved_ref="refs/pull/$tool_value/head" ;;
    commit) [[ "$tool_value" =~ ^[a-f0-9]{40}$ ]] || fail 'Use an exact lowercase 40-character tool commit.'; resolved_ref=$tool_value ;;
    *) fail 'Invalid management tool source.' ;;
  esac
}
stage_tools() {
  tool_ref
  stage=$(mktemp -d /tmp/kekbot-launcher.XXXXXXXX)
  local repo="$stage/git" entry mode type oid path size
  tools="$stage/tools"
  export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0
  git init --quiet "$repo" >/dev/null 2>&1
  printf 'Downloading management tools from %s (%s)...\n' "$tool_value" "$tool_kind"
  git -c core.hooksPath=/dev/null -c protocol.allow=never -c protocol.https.allow=always -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 -C "$repo" fetch --quiet --depth=1 --no-tags https://github.com/DangerMouseUK/kekbot.git "$resolved_ref" >/dev/null 2>&1 || fail 'Tool download failed. Check the ref, connectivity and trusted certificates; no downloaded code ran.'
  tool_sha=$(git -C "$repo" rev-parse 'FETCH_HEAD^{commit}')
  [[ "$tool_sha" =~ ^[a-f0-9]{40}$ ]] || fail 'Downloaded tool commit is invalid.'
  [[ "$tool_kind" != commit || "$tool_sha" == "$tool_value" ]] || fail 'Downloaded tool commit does not match.'
  for path in installer/core.py installer/kekbot.py deploy/Caddyfile deploy/Caddyfile.ip deploy/Caddy.Dockerfile deploy/caddy/go.mod deploy/caddy/go.sum deploy/caddy/main.go install.sh; do
    entry=$(git -C "$repo" ls-tree "$tool_sha" -- "$path")
    if [[ "$path" == install.sh && -z "$entry" ]]; then continue; fi
    read -r mode type oid _ <<< "$entry" || true
    [[ "$type" == blob && ( "$mode" == 100644 || "$mode" == 100755 ) ]] || fail 'Selected tool lacks required regular files. Choose a reviewed compatible revision.'
    size=$(git -C "$repo" cat-file -s "$oid")
    [[ "$size" =~ ^[0-9]+$ ]] && ((size > 0 && size <= 4194304)) || fail 'Tool file exceeds supported bounds.'
    mkdir -p -- "$tools/$(dirname "$path")"
    git -C "$repo" cat-file blob "$oid" > "$tools/$path"
  done
  printf '\nPinned management source: %s\nReview directory: %s\nReview: https://github.com/DangerMouseUK/kekbot/commit/%s\n' "$tool_sha" "$tools" "$tool_sha"
}
installed_tool() {
  local current="$root" file owner permissions
  [[ -f "$root/installation.json" && -d "$root/tool" ]] || fail 'No managed installation found. Use Install for a new root; manual deployments are not adopted.'
  for file in "$root/installation.json" "$root/tool" "$root/tool/core.py" "$root/tool/kekbot.py"; do
    current=$file
    while [[ "$current" != / ]]; do
      [[ ! -L "$current" ]] || fail 'Refusing linked installation/tool paths.'
      read -r owner permissions < <(stat -c '%u %a' -- "$current")
      [[ "$owner" == 0 && "$permissions" =~ ^[0-7]{3,4}$ ]] || fail 'Installed tool and its parents must be root-owned.'
      # Root-owned sticky ancestors such as /tmp protect the private root entry.
      if (( (8#$permissions & 0022) != 0 )); then
        [[ "$current" != "$file" && -d "$current" ]] && (( (8#$permissions & 01000) != 0 )) || fail 'Installed tool paths must not be writable by other users.'
      fi
      current=$(dirname "$current")
    done
  done
  tools="$root/tool"
  printf 'Using protected installed management tool. No new code is downloaded.\n'
}
cleanup() {
  if [[ -n "${stage:-}" && "${keep_stage:-0}" == 0 && "$stage" == /tmp/kekbot-launcher.* && -d "$stage" && ! -L "$stage" ]]; then rm -rf -- "$stage"; fi
  if [[ -n "${key_stage:-}" && "$key_stage" == /tmp/kekbot-docker-key.* && ! -L "$key_stage" ]]; then rm -f -- "$key_stage"; fi
}
main() {
  local parsed=0
  parse_args "$@" || parsed=$?
  ((parsed != 2)) || return 0
  platform_check
  if ((check_only)); then host_report; return $?; fi
  if ((!prepare_only)); then
    [[ -t 0 && -t 1 ]] || fail 'Use an interactive terminal and download this file first; pipe-to-shell/unattended execution is unsupported.'
    require_root
  fi
  if ((setup_only)); then setup_host; return 0; fi
  [[ -z "${DOCKER_HOST:-}" ]] || fail 'Unset DOCKER_HOST and use a local Docker Unix-socket context.'
  if ((prepare_only)); then
    command -v git >/dev/null || fail 'Install Git first; --setup offers optional Ubuntu 24.04 assistance.'
  elif ! host_report; then
    printf '\nPrerequisites are incomplete. Optional assistance requires Ubuntu 24.04.\n'
    setup_host
  fi
  if [[ -z "$action$root" ]] && ((!prepare_only)); then
    title 'Welcome to KekBot'
    printf '1. Install a new instance (live or isolated demo)\n2. Manage an existing instance\n3. Exit\n'
    answer 'Choose [1]: '
    case "${REPLY:-1}" in
      1) action=install ;;
      2) action=menu; answer 'Managed installation directory [/srv/kekbot]: '; root=${REPLY:-/srv/kekbot} ;;
      3) return 0 ;;
      *) fail 'Choose 1, 2 or 3.' ;;
    esac
  fi
  if [[ "$action" != install && "$action" != '' ]] || [[ -n "$root" ]]; then root=${root:-/srv/kekbot}; fi
  [[ -z "$root" ]] || validate_root_arg
  if [[ -n "$local_tools" ]]; then
    local_tools=$(cd -- "$local_tools" && pwd -P) || fail 'Local tool directory is unavailable.'
    if [[ -f "$local_tools/installer/kekbot.py" ]]; then tools="$local_tools/installer"; else tools=$local_tools; fi
    [[ -f "$tools/kekbot.py" && -f "$tools/core.py" ]] || fail 'Local tools need installer/kekbot.py and core.py (or a copied tool directory).'
    printf '\nExplicit local management source: %s\n' "$tools"
    answer 'After reviewing these local files, type TRUST LOCAL to execute: '
    [[ "$REPLY" == 'TRUST LOCAL' ]] || fail 'Local management code was not trusted.'
  elif [[ -n "$root" && "$action" != install && "$tool_explicit" == 0 ]]; then
    installed_tool
  else
    stage_tools
    if ((prepare_only)); then keep_stage=1; printf '\nPrepared only; no management code ran. Retained private directory: %s\n' "$stage"; return 0; fi
    answer "After reviewing this exact source, type TRUST ${tool_sha:0:12} to execute: "
    [[ "$REPLY" == "TRUST ${tool_sha:0:12}" ]] || fail 'Downloaded management code was not trusted.'
    tools="$tools/installer"
  fi
  local arguments=()
  [[ -z "$action" || "$action" == menu ]] || arguments+=(--action "$action")
  [[ -z "$root" ]] || arguments+=(--root "$root")
  [[ -z "$diagnostics" ]] || arguments+=(--diagnostics-dir "$diagnostics")
  [[ -z "$app_kind" ]] || arguments+=(--source "$app_kind" --ref "$app_value")
  [[ -z "$format" ]] || arguments+=(--format "$format")
  if [[ -n "$app_kind" ]] && ! grep -q 'parser.add_argument("--source"' "$tools/kekbot.py"; then
    fail 'This older tool lacks source shortcuts. Omit them and choose interactively, or explicitly select reviewed current tools with --tool-branch main.'
  fi
  title 'Opening the guided lifecycle wizard'
  printf 'Application versions are selected independently; latest stable excludes betas.\n'
  printf 'Review again before APPLY. Updates snapshot first; uninstall keeps data by default.\n'
  python3 -B "$tools/kekbot.py" "${arguments[@]}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -Eeuo pipefail
  umask 077
  stage=; key_stage=; keep_stage=0
  trap cleanup EXIT
  trap 'printf "\nKekBot launcher could not finish. No command output or credentials were logged.\nInspect prerequisites/status privately before retrying; use the recovery guide\nfor an interrupted lifecycle operation.\n" >&2' ERR
  trap 'exit 130' INT
  trap 'exit 143' TERM
  main "$@"
fi
