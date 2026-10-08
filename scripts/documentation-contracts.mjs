// Documentation checks are pure: importing schemas cannot initialize a runtime.
export function checkConfigurationReference(schemas, markdown, examples) {
  const problems = [];
  for (const [kind, schema] of Object.entries(schemas)) {
    const section = markdown.split(`\n## ${kind}\n`)[1]?.split(/\n## /)[0] ?? "";
    const fields = new Set([...section.matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]));
    for (const field of Object.keys(schema.shape)) if (!fields.has(field)) problems.push(`Field reference missing ${kind}.${field}`);
    for (const field of fields) if (!(field in schema.shape)) problems.push(`Field reference contains unknown ${kind}.${field}`);
    if (!(kind in examples)) problems.push(`Missing configuration example: ${kind}`);
    else {
      const parsed = schema.strict().safeParse(examples[kind]);
      if (!parsed.success) problems.push(`Invalid configuration example: ${kind} (${parsed.error.issues.map(issue => issue.path.join(".")).join(", ")})`);
    }
  }
  for (const kind of Object.keys(examples)) if (!(kind in schemas)) problems.push(`Unknown configuration example: ${kind}`);
  return problems;
}
