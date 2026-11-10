// Client-side validation that mirrors the server by using the same zod schemas from
// catalog.ts, then explains each issue in plain English next to its field. The server
// still validates every save; this only catches mistakes before a round trip.
import type { z } from "zod";
import { configSchemas, type ConfigDocument, type Kind } from "../../server/domain/catalog.ts";
import { layouts, labelOf, type Data, type FieldSpec } from "./layouts.ts";
import { formatDuration, type DurationUnit } from "./time.ts";

export type Bounds = {
  min?: number;
  max?: number;
  int?: boolean;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  nullable?: boolean;
  required?: boolean;
};

type Introspected = {
  _zod: { def: { type: string; checks?: { _zod: { def: Record<string, unknown> } }[] } };
  unwrap?: () => Introspected;
  minValue?: number | null;
  maxValue?: number | null;
  isInt?: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  element?: Introspected;
};

function unwrap(schema: Introspected) {
  let current = schema,
    nullable = false,
    optional = false;
  for (let i = 0; i < 5 && current.unwrap; i++) {
    const type = current._zod.def.type;
    if (type === "nullable") nullable = true;
    else if (type === "default" || type === "optional") optional = true;
    else break;
    current = current.unwrap();
  }
  return { schema: current, nullable, optional };
}

export function fieldSchema(kind: Kind, key: string): Introspected | undefined {
  return (configSchemas[kind].shape as Record<string, unknown>)[key] as Introspected | undefined;
}

/** Inclusive bounds for one field, read from its zod schema. */
export function bounds(kind: Kind, key: string): Bounds {
  const raw = fieldSchema(kind, key);
  if (!raw) return {};
  const { schema, nullable, optional } = unwrap(raw);
  const result: Bounds = { nullable, required: !optional && !nullable };
  const type = schema._zod.def.type;
  if (type === "number") {
    if (typeof schema.minValue === "number" && Number.isFinite(schema.minValue))
      result.min = schema.minValue;
    if (typeof schema.maxValue === "number" && Number.isFinite(schema.maxValue))
      result.max = schema.maxValue;
    result.int = Boolean(schema.isInt);
  } else if (type === "string") {
    if (typeof schema.minLength === "number") result.minLength = schema.minLength;
    if (typeof schema.maxLength === "number") result.maxLength = schema.maxLength;
  } else if (type === "array") {
    for (const check of schema._zod.def.checks ?? []) {
      const def = check._zod.def;
      if (def.check === "min_length") result.minItems = Number(def.minimum);
      if (def.check === "max_length") result.maxItems = Number(def.maximum);
    }
  }
  return result;
}

/** The schema for one item of a list field, used to check chips before adding them. */
export function itemSchema(kind: Kind, key: string): z.ZodType | undefined {
  const raw = fieldSchema(kind, key);
  if (!raw) return undefined;
  const { schema } = unwrap(raw);
  return schema._zod.def.type === "array" ? (schema.element as unknown as z.ZodType) : undefined;
}

const specs = new Map<string, FieldSpec>();
for (const [kind, sections] of Object.entries(layouts))
  for (const section of sections)
    for (const field of section.fields) specs.set(`${kind}.${field.key}`, field);
export const specFor = (kind: Kind, key: string) => specs.get(`${kind}.${key}`);

function amount(kind: Kind, key: string, value: number) {
  const control = specFor(kind, key)?.control;
  if (control?.type === "duration") return formatDuration(value, control.base as DurationUnit);
  if (control?.type === "number" && control.suffix)
    return control.suffix === "%" ? `${value}%` : `${value} ${control.suffix}`;
  if (control?.type === "volume") return `${Math.round(value * 100)}%`;
  return String(value);
}

type Issue = z.core.$ZodIssue;

/** One zod issue → a short sentence for the field it belongs to. */
export function explainIssue(kind: Kind, issue: Issue, data: Data): string {
  const key = String(issue.path[0] ?? "");
  const spec = specFor(kind, key);
  const control = spec?.control;
  const item = (
    control?.type === "list" || control?.type === "chips"
      ? control.item
      : control?.type === "grants"
        ? `${control.noun} grant`
        : "item"
  ).toLowerCase();
  const index = typeof issue.path[1] === "number" ? issue.path[1] : undefined;
  const prefix =
    index !== undefined && control?.type === "list"
      ? `${control.item} ${index + 1}: `
      : index !== undefined
        ? `“${String((data[key] as unknown[])?.[index] ?? "")}”: `
        : "";
  const b = bounds(kind, key);
  if (control?.type === "grants" && issue.path.length > 1)
    return issue.path[2] === "permission"
      ? "A row has a permission KekBot does not recognise. Remove that row to save."
      : "Check the highlighted rows: Discord IDs are 1–24 digits only.";
  switch (issue.code) {
    case "too_small": {
      const minimum = Number(issue.minimum);
      if (issue.origin === "string")
        return minimum <= 1
          ? `${prefix}${index !== undefined ? "Cannot be empty." : "Required."}`
          : `${prefix}Use at least ${minimum} characters.`;
      if (issue.origin === "array")
        return minimum === 1 ? `Add at least one ${item}.` : `Add at least ${minimum} ${item}s.`;
      if (b.max !== undefined)
        return `Choose between ${amount(kind, key, b.min ?? minimum)} and ${amount(kind, key, b.max)}.`;
      return `Must be at least ${amount(kind, key, minimum)}.`;
    }
    case "too_big": {
      const maximum = Number(issue.maximum);
      if (issue.origin === "string") return `${prefix}Keep this to ${maximum} characters or fewer.`;
      if (issue.origin === "array") return `You can add up to ${maximum} ${item}s.`;
      if (b.min !== undefined)
        return `Choose between ${amount(kind, key, b.min)} and ${amount(kind, key, b.max ?? maximum)}.`;
      return `Must be at most ${amount(kind, key, maximum)}.`;
    }
    case "invalid_format":
      return `${prefix}${spec?.format ?? "This does not look right."}`;
    case "invalid_type":
      if (issue.expected === "int") return "Use a whole number.";
      if (control?.type === "datetime") return "Choose a date and time.";
      if (issue.expected === "number") return "Enter a number.";
      if (issue.expected === "string") return `${prefix}Required.`;
      return "Required.";
    case "invalid_value":
      return "Choose one of the options.";
    case "custom":
      return control?.type === "timezone"
        ? "Choose a timezone from the list."
        : "Check this value.";
    case "unrecognized_keys":
      return "";
    default:
      return issue.message;
  }
}

/** Applies each text field's normaliser (e.g. trigger → `!lowercase`) without touching others. */
export function normalizeFields(kind: Kind, data: Data): Data {
  let next = data;
  for (const section of layouts[kind])
    for (const field of section.fields) {
      const control = field.control;
      const value = data[field.key];
      if (control.type !== "text" || !control.normalize || typeof value !== "string") continue;
      const normalized = control.normalize(value);
      if (normalized !== value) next = { ...next, [field.key]: normalized };
    }
  return next;
}

/** Every problem the schema finds, keyed by top-level field (first problem wins). */
export function validate(kind: Kind, data: Data): Record<string, string> {
  const result = configSchemas[kind].strict().safeParse(data);
  const errors: Record<string, string> = {};
  if (result.success) return errors;
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (!key || errors[key]) continue;
    const message = explainIssue(kind, issue, data);
    if (message) errors[key] = message;
  }
  return errors;
}

// Built-in commands the server reserves (src/server/domain/state.ts).
export const reservedTriggers = [
  "!kekbot",
  "!commands",
  "!uptime",
  "!rules",
  "!discord",
  "!socials",
  "!so",
  "!sr",
  "!queue",
  "!nowplaying",
  "!skip",
  "!goal",
  "!points",
  "!watchtime",
  "!top",
  "!vote",
  "!enter",
  "!redeem",
];

/** Checks the schema cannot express, using current state. The server re-checks on save. */
export function crossChecks(
  kind: Kind,
  data: Data,
  documents: ConfigDocument[] | undefined,
  id: string | undefined,
): { errors: Record<string, string>; warnings: Record<string, string> } {
  const errors: Record<string, string> = {},
    warnings: Record<string, string> = {};
  if (kind === "command") {
    const trigger = String(data.trigger ?? "");
    const aliases = Array.isArray(data.aliases) ? data.aliases.map(String) : [];
    if (reservedTriggers.includes(trigger))
      errors.trigger = `${trigger} is a built-in command. Choose a different trigger.`;
    const reservedAlias = aliases.find((alias) => reservedTriggers.includes(alias));
    if (reservedAlias) errors.aliases = `${reservedAlias} is a built-in command. Remove it.`;
    if (aliases.includes(trigger)) errors.aliases = `${trigger} is already the main trigger.`;
    const other = documents?.find(
      (doc) =>
        doc.kind === "command" &&
        doc.id !== id &&
        [doc.data.trigger, ...((doc.data.aliases as unknown[]) ?? [])].some(
          (name) => name === trigger || aliases.includes(String(name)),
        ),
    );
    if (other && !errors.trigger)
      errors.trigger = `Already used by the “${String(other.data.name)}” command. Choose a different trigger or alias.`;
  }
  if (kind === "timer") {
    const start = data.quietStart,
      end = data.quietEnd;
    if ((start === null) !== (end === null))
      warnings.quietEnd = "Set both quiet hours, or neither. One alone has no effect.";
    else if (start !== null && start === end)
      warnings.quietEnd = "Same start and end means the timer is quiet all day.";
  }
  if (kind === "widget" && data.type === "counter" && !data.target)
    warnings.target = "Choose a command, or this widget will always show 0.";
  if (kind === "widget" && data.type === "countdown" && !data.endsAt)
    warnings.endsAt = "Choose when the countdown ends.";
  if ((kind === "poll" || kind === "raffle") && data.status === "open") {
    const ends = Number(data.endsAt);
    if (ends > 0 && ends <= Date.now())
      warnings.endsAt = "This time has passed, so it will close straight away.";
  }
  if (kind === "rule") {
    const starts = data.startsAt as number | null,
      ends = data.endsAt as number | null;
    if (starts !== null && ends !== null && ends <= starts)
      warnings.endsAt = "The end is not after the start, so this rule will never match.";
  }
  return { errors, warnings };
}

export const fieldLabel = (kind: Kind, key: string, data: Data) => {
  const spec = specFor(kind, key);
  return spec ? labelOf(spec, data) : key;
};
