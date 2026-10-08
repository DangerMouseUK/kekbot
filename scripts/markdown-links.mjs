import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

function prose(markdown) {
  let fence;
  return markdown.split(/\r?\n/).filter(line => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
      return false;
    }
    return !fence;
  }).join("\n");
}

export function markdownAnchors(markdown) {
  const body = prose(markdown), anchors = new Set();
  for (const match of body.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/<[^>]*>/g, "")
      .toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "").replace(/\s/g, "-");
    let id = slug, suffix = 0;
    while (anchors.has(id)) id = `${slug}-${++suffix}`;
    anchors.add(id);
  }
  for (const match of body.matchAll(/<a\s+[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/g)) anchors.add(match[1]);
  return anchors;
}

export function checkMarkdownLinks(root, file, markdown) {
  const problems = [];
  for (const link of prose(markdown).matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = link[1].replace(/^<|>$/g, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const [destination, fragment] = target.split("#", 2);
    let path, anchor;
    try {
      path = destination ? resolve(root, dirname(file), decodeURIComponent(destination.split("?")[0])) : resolve(root, file);
      anchor = fragment ? decodeURIComponent(fragment) : undefined;
    } catch { problems.push(`${file}: malformed local link ${target}`); continue; }
    const fromRoot = relative(root, path);
    if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\") || !existsSync(path)) {
      problems.push(`${file}: missing or out-of-repository link ${target}`);
    } else if (anchor && path.endsWith(".md") && !markdownAnchors(readFileSync(path, "utf8")).has(anchor)) {
      problems.push(`${file}: missing Markdown anchor ${target}`);
    }
  }
  return problems;
}
