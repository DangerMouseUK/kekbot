import { spawnSync } from "node:child_process";

// Ubuntu's supported Python 3 is the host wizard runtime; Windows can run its
// portable contract tests while Linux CI also checks locking and real Docker.
const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-B", "-m", "unittest", "discover", "-s", "installer", "-p", "test_*.py", "-v"], { stdio: "inherit", windowsHide: true });
process.exitCode = result.status ?? 1;
