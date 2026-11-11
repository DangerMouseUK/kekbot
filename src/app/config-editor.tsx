"use client";
import "./forms/forms.css";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { defaults, type ConfigDocument, type Kind } from "../server/domain/catalog.ts";
import { examples } from "./forms/examples.ts";
import type { Snapshot } from "./ui";
import {
  Checks,
  Chips,
  DateTimeInput,
  DurationInput,
  FieldShell,
  HourSelect,
  ListInput,
  NumberInput,
  Select,
  TextArea,
  TextInput,
  Toggle,
  Volume,
  describedBy,
  rangeText,
} from "./forms/fields.tsx";
import {
  AssetPicker,
  GrantRows,
  TargetPicker,
  TemplateInput,
  TimezoneSelect,
  ViewerInput,
  Winners,
} from "./forms/pickers.tsx";
import { TemplatePreview } from "./forms/preview.tsx";
import { problemFromError, type ServerProblem } from "./forms/errors.ts";
import {
  availabilityFields,
  availabilityOptions,
  commandAvailability,
  type Availability,
} from "./forms/availability.ts";
import { helpOf, labelOf, layouts, type Data, type FieldSpec } from "./forms/layouts.ts";
import {
  bounds,
  crossChecks,
  explainIssue,
  itemSchema,
  normalizeFields,
  specFor,
  validate,
} from "./forms/schema.ts";
import { commandVariables, timerVariables } from "./forms/template.ts";
import { formatDuration } from "./forms/time.ts";

export { examples };

const nouns: Record<Kind, string> = {
  command: "command",
  timer: "timer",
  alert: "alert",
  widget: "widget",
  rule: "rule",
  goal: "goal",
  reward: "reward",
  poll: "poll",
  raffle: "raffle",
  note: "note",
  guild: "Discord route",
  settings: "settings",
};

function initial(kind: Kind, document?: ConfigDocument): Data {
  const data: Data = { ...examples[kind], ...document?.data };
  if (!document && ["poll", "raffle"].includes(kind))
    data.endsAt = Math.ceil((Date.now() + 3600000) / 60000) * 60000;
  return data;
}

export type SaveOptions = { version?: number };

export default function ConfigEditor({
  kind,
  document,
  save,
  cancel,
  snapshot,
}: {
  kind: Kind;
  document?: ConfigDocument;
  /** Saves the form values. `options.version` is the version the form was loaded from (it changes after "Reload latest values"). */
  save: (data: Record<string, unknown>, options?: SaveOptions) => Promise<void>;
  cancel: () => void;
  /** Current dashboard state, used to populate pickers (assets, goals, polls, commands, viewers). */
  snapshot?: Snapshot;
}) {
  const prefix = `kf${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [base, setBase] = useState(document);
  const [data, setData] = useState(() => initial(kind, document));
  const [revision, setRevision] = useState(0);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [problem, setProblem] = useState<ServerProblem>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const noun = nouns[kind];

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const sections = layouts[kind];
  const covered = useMemo(
    () =>
      new Set(
        sections.flatMap((section) =>
          section.fields.flatMap((field) => [field.key, ...(field.also ?? [])]),
        ),
      ),
    [sections],
  );
  // Fields added to the schema later still appear, with a generic control.
  const extras = Object.keys(data).filter((key) => !covered.has(key));
  const documentId = base?.id ?? (kind === "settings" ? "instance" : undefined);

  // Validate what would be saved: text normalisers (trigger "welcome" → "!welcome") run on save.
  const ready = useMemo(() => normalizeFields(kind, data), [kind, data]);
  const schemaErrors = useMemo(() => validate(kind, ready), [kind, ready]);
  const cross = useMemo(
    () => crossChecks(kind, ready, snapshot?.documents, documentId),
    [kind, ready, snapshot?.documents, documentId],
  );
  const errors: Record<string, string> = { ...cross.errors, ...schemaErrors };
  const visibleSpec = (spec: FieldSpec) => !spec.visible || spec.visible(data);

  const update = (key: string, value: unknown) => {
    setNotice("");
    setTouched((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));
    setProblem((previous) => {
      if (!previous?.fields[key]) return previous;
      const fields = { ...previous.fields };
      delete fields[key];
      return { ...previous, fields };
    });
    setData((previous) => ({ ...previous, [key]: value }));
  };

  const shownError = (key: string) =>
    problem?.fields[key] ?? (submitted || touched.has(key) ? errors[key] : undefined);

  async function reload() {
    setBusy(true);
    try {
      const response = await fetch("/api/control", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const latest = ((await response.json()).documents as ConfigDocument[]).find(
        (doc) => doc.id === documentId,
      );
      if (!latest) {
        setProblem({
          code: "configuration_not_found",
          summary: `This ${noun} no longer exists; someone may have deleted it. Cancel to close the form.`,
          fields: {},
          conflict: false,
        });
        return;
      }
      setBase(latest);
      setData(initial(kind, latest));
      setRevision((value) => value + 1);
      setTouched(new Set());
      setSubmitted(false);
      setProblem(undefined);
      setNotice("Loaded the latest saved values. Review them, make your changes again, then save.");
      heading.current?.focus();
    } catch {
      setProblem((previous) =>
        previous
          ? {
              ...previous,
              summary: `${previous.summary} Reloading failed; check your connection and try again.`,
            }
          : previous,
      );
    } finally {
      setBusy(false);
    }
  }

  const errorKeys = Object.keys(errors);
  const allSpecs = sections.flatMap((section) => section.fields);
  const labelFor = (key: string) => {
    const spec = allSpecs.find((field) => field.key === key);
    return spec ? labelOf(spec, data) : humanize(key);
  };

  function control(spec: FieldSpec) {
    const key = spec.key,
      id = `${prefix}-${key}`,
      label = labelOf(spec, data),
      b = bounds(kind, key),
      error = shownError(key),
      warning = cross.warnings[key];
    let help = helpOf(spec, data);
    const value = data[key];
    const set = (next: unknown) => update(key, next);
    const c = spec.control;
    const range =
      c.type === "number"
        ? rangeText(b, (n) => withSuffix(n, c.suffix))
        : c.type === "duration"
          ? rangeText(b, (n) => formatDuration(n, c.base))
          : "";
    if (range) help = [help, `Range: ${range}.`].filter(Boolean).join(" ");
    const group = ["checks", "chips", "list", "grants", "winners"].includes(c.type);
    const d = { id, describedBy: describedBy(id, help, error, warning), invalid: Boolean(error) };
    let input: ReactNode;
    switch (c.type) {
      case "text":
        input = (
          <TextInput
            d={d}
            value={value}
            set={set}
            placeholder={c.placeholder}
            normalize={c.normalize}
            mono={c.mono}
            maxLength={b.maxLength}
          />
        );
        break;
      case "textarea":
        input = (
          <TextArea
            d={d}
            value={value}
            set={set}
            rows={c.rows}
            maxLength={b.maxLength}
            placeholder={c.placeholder}
          />
        );
        break;
      case "toggle":
        return (
          <FieldShell
            key={key}
            id={id}
            label={label}
            help={help}
            error={error}
            wide={spec.wide}
            bare
          >
            <Toggle d={d} label={label} value={value} set={set} />
          </FieldShell>
        );
      case "select":
        input = <Select d={d} value={value} set={set} options={c.options} />;
        break;
      case "availability": {
        const current = commandAvailability(data);
        input = (
          <Select
            d={d}
            value={current}
            options={availabilityOptions(current)}
            set={(choice) => {
              const next = availabilityFields(choice as Availability, data);
              update("condition", next.condition);
              update("streamOnly", next.streamOnly);
            }}
          />
        );
        break;
      }
      case "number":
        input = (
          <NumberInput d={d} value={value} set={set} bounds={b} suffix={c.suffix} step={c.step} />
        );
        break;
      case "duration":
        input = (
          <DurationInput d={d} label={label} value={value} set={set} base={c.base} bounds={b} />
        );
        break;
      case "datetime":
        input = <DateTimeInput d={d} label={label} value={value} set={set} optional={c.optional} />;
        break;
      case "chips":
        input = (
          <Chips
            d={d}
            label={label}
            value={value}
            set={set}
            item={c.item}
            placeholder={c.placeholder}
            normalize={c.normalize}
            schema={itemSchema(kind, key)}
            maxItems={b.maxItems}
            explain={(issue) => explainIssue(kind, { ...issue, path: [key] }, data)}
          />
        );
        break;
      case "list": {
        const item = itemSchema(kind, key) as unknown as { maxLength?: number } | undefined;
        input = (
          <ListInput
            d={d}
            value={value}
            set={set}
            item={c.item}
            addLabel={c.add}
            multiline={c.multiline}
            bounds={{ ...b, itemMax: item?.maxLength ?? undefined }}
            variables={
              c.variables === "command"
                ? commandVariables
                : c.variables === "timer"
                  ? timerVariables
                  : undefined
            }
          />
        );
        break;
      }
      case "template":
        input = (
          <TemplateInput
            d={d}
            value={value}
            set={set}
            event={String(data.event)}
            maxLength={b.maxLength}
          />
        );
        break;
      case "checks":
        input = <Checks name={id} value={value} set={set} options={c.options} />;
        break;
      case "timezone":
        input = <TimezoneSelect d={d} value={value} set={set} />;
        break;
      case "hour":
        input = <HourSelect d={d} value={value} set={set} />;
        break;
      case "volume":
        input = <Volume d={d} value={value} set={set} />;
        break;
      case "asset":
        input = (
          <AssetPicker
            d={d}
            label={label}
            value={value}
            set={set}
            accept={c.accept}
            snapshot={snapshot}
          />
        );
        break;
      case "target":
        input = (
          <TargetPicker
            d={d}
            value={value}
            set={set}
            type={String(data.type)}
            documents={snapshot?.documents}
          />
        );
        break;
      case "grants":
        input = <GrantRows d={d} value={value} set={set} noun={c.noun} />;
        break;
      case "viewer":
        input = <ViewerInput d={d} value={value} set={set} viewers={snapshot?.viewers} />;
        break;
      case "winners":
        input = <Winners value={value} viewers={snapshot?.viewers} />;
        break;
      case "json":
        input = <pre className="kf-json">{JSON.stringify(value, null, 2)}</pre>;
        break;
    }
    return (
      <FieldShell
        key={key}
        id={id}
        label={label}
        help={help}
        error={error}
        warning={warning}
        wide={spec.wide}
        group={group}
      >
        {input}
      </FieldShell>
    );
  }

  const extraSpec = (key: string): FieldSpec => {
    const value = data[key];
    const known = specFor(kind, key);
    if (known) return known;
    return {
      key,
      label: humanize(key),
      control:
        typeof value === "boolean"
          ? { type: "toggle" }
          : typeof value === "number" || (value === null && bounds(kind, key).max !== undefined)
            ? { type: "number" }
            : Array.isArray(value) && value.every((item) => typeof item === "string")
              ? { type: "chips", item: "value" }
              : typeof value === "string" || value === null
                ? { type: "text" }
                : { type: "json" },
      wide: Array.isArray(value),
    };
  };

  const channel = String(snapshot?.settings?.name ?? defaults.name);
  const hiddenErrors = errorKeys.filter((key) => {
    const spec = allSpecs.find((field) => field.key === key);
    return spec && !visibleSpec(spec);
  });

  return (
    <form
      className="editor kf"
      noValidate
      aria-labelledby={`${prefix}-title`}
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitted(true);
        setNotice("");
        if (ready !== data) setData(ready);
        if (errorKeys.length) {
          requestAnimationFrame(() => summary.current?.focus());
          return;
        }
        setBusy(true);
        setProblem(undefined);
        try {
          await save(ready, { version: base?.version });
        } catch (e) {
          setProblem(problemFromError(e, kind));
          requestAnimationFrame(() => summary.current?.focus());
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 id={`${prefix}-title`} ref={heading} tabIndex={-1}>
        {kind === "settings" ? "Instance settings" : `${document ? "Edit" : "New"} ${noun}`}
      </h3>
      {notice && (
        <p className="kf-notice" role="status">
          {notice}
        </p>
      )}
      {(problem || (submitted && errorKeys.length > 0)) && (
        <div className="kf-summary" role="alert" tabIndex={-1} ref={summary}>
          {problem ? (
            <>
              <p>{problem.summary}</p>
              {problem.conflict && (
                <button type="button" disabled={busy} onClick={() => void reload()}>
                  Reload latest values
                </button>
              )}
            </>
          ) : (
            <>
              <p>
                {errorKeys.length === 1 ? "Fix 1 problem" : `Fix ${errorKeys.length} problems`}{" "}
                before saving:
              </p>
              <ul>
                {errorKeys.map((key) => (
                  <li key={key}>
                    <a
                      href={`#${prefix}-${key}`}
                      onClick={(event) => {
                        const target = window.document.getElementById(`${prefix}-${key}`);
                        if (!target) return;
                        event.preventDefault();
                        target.focus();
                        target.scrollIntoView({ block: "center" });
                      }}
                    >
                      {labelFor(key)}
                    </a>
                    : {errors[key]}
                    {hiddenErrors.includes(key)
                      ? " (this field is hidden for the current choice)"
                      : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {sections.map((section) => {
        if (section.visible && !section.visible(data)) return null;
        const fields = section.fields.filter(visibleSpec);
        const description =
          typeof section.description === "function"
            ? section.description(data)
            : section.description;
        if (!fields.length && !description) return null;
        return (
          <fieldset key={`${revision}-${section.title}`} className="kf-section">
            <legend>{section.title}</legend>
            {description && <p className="kf-help">{description}</p>}
            <div className="kf-grid">{fields.map(control)}</div>
            {section.preview && (
              <TemplatePreview kind={section.preview} data={data} channel={channel} />
            )}
          </fieldset>
        );
      })}
      {extras.length > 0 && (
        <fieldset key={`${revision}-extras`} className="kf-section">
          <legend>Other settings</legend>
          <div className="kf-grid">{extras.map((key) => control(extraSpec(key)))}</div>
        </fieldset>
      )}
      <div className="actions kf-actions">
        <button disabled={busy}>{busy ? "Saving…" : `Save ${noun}`}</button>
        <button type="button" className="secondary" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function withSuffix(value: number, suffix?: string) {
  if (!suffix) return String(value);
  if (suffix === "%" || suffix === "px") return `${value}${suffix === "px" ? " px" : "%"}`;
  return `${value} ${value === 1 && suffix.endsWith("s") ? suffix.slice(0, -1) : suffix}`;
}

function humanize(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}
