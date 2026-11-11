"use client";
// Basic accessible form controls for the configuration editor. Every control gets a visible
// label, help/error text linked through aria-describedby, and works with the keyboard alone.
import { useRef, useState, type ReactNode } from "react";
import type { z } from "zod";
import type { Option } from "./layouts.ts";
import {
  allowedUnits,
  bestUnit,
  formatDateTime,
  formatDuration,
  fromUnit,
  hourLabel,
  localInputToMs,
  localTimezoneLabel,
  msToLocalInput,
  relativeTime,
  toUnit,
  type DurationUnit,
} from "./time.ts";
import type { Bounds } from "./schema.ts";
import type { Variable } from "./template.ts";

export type Described = { id: string; describedBy?: string; invalid: boolean };

export function FieldShell({
  id,
  label,
  help,
  error,
  warning,
  wide,
  group,
  bare,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  warning?: string;
  wide?: boolean;
  group?: boolean;
  /** The control renders its own label (checkbox toggles). */
  bare?: boolean;
  children: ReactNode;
}) {
  const notes = (
    <>
      {help && (
        <p className="kf-help" id={`${id}-help`}>
          {help}
        </p>
      )}
      {children}
      <LiveError id={`${id}-error`} message={error} />
      {!error && warning && (
        <p className="kf-warning" id={`${id}-warning`}>
          {warning}
        </p>
      )}
    </>
  );
  const className = `kf-field${wide ? " kf-wide" : ""}${error ? " kf-has-error" : ""}`;
  if (group)
    return (
      <fieldset
        className={className}
        id={id}
        tabIndex={-1}
        aria-describedby={describedBy(id, help, error, warning)}
      >
        <legend className="kf-label">{label}</legend>
        {notes}
      </fieldset>
    );
  if (bare)
    return (
      <div className={className}>
        {children}
        {help && (
          <p className="kf-help" id={`${id}-help`}>
            {help}
          </p>
        )}
        <LiveError id={`${id}-error`} message={error} />
      </div>
    );
  return (
    <div className={className}>
      <label className="kf-label" htmlFor={id}>
        {label}
      </label>
      {notes}
    </div>
  );
}

/**
 * An inline error inside a polite live region that is always rendered, so screen readers
 * announce a message when it appears or changes, not only when the field is revisited.
 */
export function LiveError({
  id,
  message,
  className,
  icon = true,
}: {
  id: string;
  message?: string;
  className?: string;
  icon?: boolean;
}) {
  return (
    <div className={`kf-live${className ? ` ${className}` : ""}`} aria-live="polite">
      {message && (
        <p className="kf-error" id={id}>
          {icon && <span aria-hidden="true">⚠ </span>}
          {message}
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, help?: string, error?: string, warning?: string) {
  const ids = [
    help ? `${id}-help` : "",
    error ? `${id}-error` : "",
    !error && warning ? `${id}-warning` : "",
  ].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

const aria = (d: Described) => ({
  id: d.id,
  "aria-describedby": d.describedBy,
  "aria-invalid": d.invalid || undefined,
});

export function TextInput({
  d,
  value,
  set,
  placeholder,
  normalize,
  mono,
  maxLength,
  list,
}: {
  d: Described;
  value: unknown;
  set: (value: string) => void;
  placeholder?: string;
  normalize?: (value: string) => string;
  mono?: boolean;
  maxLength?: number;
  list?: string;
}) {
  return (
    <input
      {...aria(d)}
      className={mono ? "kf-mono" : undefined}
      value={String(value ?? "")}
      placeholder={placeholder}
      maxLength={maxLength}
      list={list}
      autoComplete="off"
      spellCheck={mono ? false : undefined}
      // Normalise on blur; the editor also normalises before validating and saving, so
      // Enter-to-save never submits an unnormalised value.
      onChange={(event) => set(event.target.value)}
      onBlur={(event) => normalize && set(normalize(event.target.value))}
    />
  );
}

export function TextArea({
  d,
  value,
  set,
  rows,
  maxLength,
  placeholder,
}: {
  d: Described;
  value: unknown;
  set: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const text = String(value ?? "");
  return (
    <>
      <textarea
        {...aria(d)}
        rows={rows ?? 3}
        value={text}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => set(event.target.value)}
      />
      <Count length={text.length} max={maxLength} />
    </>
  );
}

function Count({ length, max }: { length: number; max?: number }) {
  if (!max || length < max * 0.8) return null;
  return (
    <p className="kf-count">
      {length} / {max} characters
    </p>
  );
}

export function Toggle({
  d,
  label,
  value,
  set,
}: {
  d: Described;
  label: string;
  value: unknown;
  set: (value: boolean) => void;
}) {
  return (
    <label className="kf-toggle">
      <input
        {...aria(d)}
        type="checkbox"
        checked={value === true}
        onChange={(event) => set(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function Select({
  d,
  value,
  set,
  options,
}: {
  d: Described;
  value: unknown;
  set: (value: string) => void;
  options: Option[];
}) {
  const current = String(value ?? "");
  const all = options.some((option) => option.value === current)
    ? options
    : [...options, { value: current, label: current || "Not set" }];
  return (
    <select {...aria(d)} value={current} onChange={(event) => set(event.target.value)}>
      {all.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function rangeText(b: Bounds, format: (value: number) => string = String) {
  if (b.min !== undefined && b.max !== undefined) return `${format(b.min)} – ${format(b.max)}`;
  if (b.min !== undefined) return `At least ${format(b.min)}`;
  if (b.max !== undefined) return `Up to ${format(b.max)}`;
  return "";
}

export function NumberInput({
  d,
  value,
  set,
  bounds,
  suffix,
  step,
}: {
  d: Described;
  value: unknown;
  set: (value: number | null) => void;
  bounds: Bounds;
  suffix?: string;
  step?: number;
}) {
  return (
    <div className="kf-inline">
      <input
        {...aria(d)}
        type="number"
        inputMode={bounds.int === false ? "decimal" : "numeric"}
        min={bounds.min}
        max={bounds.max}
        step={step ?? (bounds.int ? 1 : "any")}
        value={typeof value === "number" && Number.isFinite(value) ? value : ""}
        onChange={(event) => set(event.target.value === "" ? null : Number(event.target.value))}
      />
      {suffix && <span className="kf-suffix">{suffix}</span>}
    </div>
  );
}

export function DurationInput({
  d,
  label,
  value,
  set,
  base,
  bounds,
}: {
  d: Described;
  label: string;
  value: unknown;
  set: (value: number | null) => void;
  base: DurationUnit;
  bounds: Bounds;
}) {
  const units = allowedUnits(base, bounds.max ?? 86400 * 30);
  const stored = typeof value === "number" && Number.isFinite(value) ? value : null;
  const [unit, setUnit] = useState<DurationUnit>(() => bestUnit(stored ?? 0, base, units));
  const [text, setText] = useState(() =>
    stored === null ? "" : String(+toUnit(stored, base, unit).toFixed(4)),
  );
  const apply = (nextText: string, nextUnit: DurationUnit) => {
    setText(nextText);
    setUnit(nextUnit);
    const amount = Number(nextText);
    set(
      nextText.trim() === "" || !Number.isFinite(amount) ? null : fromUnit(amount, nextUnit, base),
    );
  };
  return (
    <>
      <div className="kf-inline">
        <input
          {...aria(d)}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={text}
          onChange={(event) => apply(event.target.value, unit)}
        />
        {units.length > 1 ? (
          <select
            aria-label={`${label} unit`}
            className="kf-unit"
            value={unit}
            onChange={(event) => apply(text, event.target.value as DurationUnit)}
          >
            {units.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <span className="kf-suffix">{unit}</span>
        )}
      </div>
      {stored !== null && unit !== base && (
        <p className="kf-count">Saved as {formatDuration(stored, base)}.</p>
      )}
    </>
  );
}

const presets: [string, number][] = [
  ["In 15 minutes", 15 * 60000],
  ["In 1 hour", 3600000],
  ["In 1 day", 86400000],
  ["In 1 week", 7 * 86400000],
];

export function DateTimeInput({
  d,
  label,
  value,
  set,
  optional,
}: {
  d: Described;
  label: string;
  value: unknown;
  set: (value: number | null) => void;
  optional: boolean;
}) {
  const ms = typeof value === "number" && value > 0 ? value : null;
  const [now] = useState(() => Date.now());
  // Keep the browser's raw text while someone types: Chromium reports intermediate years such
  // as 0002 → 0020 → 0202 while a year is typed, and rebuilding the value from milliseconds
  // would clear the field. Only a sensible complete date is committed.
  const [text, setText] = useState(() => msToLocalInput(ms));
  const [synced, setSynced] = useState(ms);
  if (ms !== synced) {
    // The stored value changed elsewhere (preset, Clear, reload, or our own commit).
    setSynced(ms);
    setText(msToLocalInput(ms));
  }
  const commit = (input: HTMLInputElement, final: boolean) => {
    const parsed = localInputToMs(input.value);
    if (parsed !== null) {
      if (parsed !== ms) set(parsed);
    } else if (input.value === "" && !input.validity.badInput) {
      // Every part was deleted: an intentional clear.
      if (ms !== null) set(null);
    } else if (final) setText(msToLocalInput(ms)); // incomplete on leaving: restore saved value
  };
  return (
    <>
      <input
        {...aria(d)}
        type="datetime-local"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          commit(event.target, false);
        }}
        onBlur={(event) => commit(event.target, true)}
      />
      <p className="kf-count">
        {ms ? `${formatDateTime(ms)} · ${relativeTime(ms, now)}` : optional ? "Not set" : ""}
        {ms || optional ? " · " : ""}
        Your timezone: {localTimezoneLabel(ms ?? now)}
      </p>
      <div className="kf-chips-actions">
        {presets.map(([text, offset]) => (
          <button
            key={text}
            type="button"
            className="secondary kf-small"
            aria-label={`${label}: ${text.toLowerCase()} from now`}
            onClick={() => set(Math.ceil((Date.now() + offset) / 60000) * 60000)}
          >
            {text}
          </button>
        ))}
        {optional && ms !== null && (
          <button
            type="button"
            className="secondary kf-small"
            aria-label={`Clear ${label}`}
            onClick={() => set(null)}
          >
            Clear
          </button>
        )}
      </div>
    </>
  );
}

export function HourSelect({
  d,
  value,
  set,
}: {
  d: Described;
  value: unknown;
  set: (value: number | null) => void;
}) {
  return (
    <select
      {...aria(d)}
      value={typeof value === "number" ? String(value) : ""}
      onChange={(event) => set(event.target.value === "" ? null : Number(event.target.value))}
    >
      <option value="">Not set</option>
      {Array.from({ length: 24 }, (_, hour) => (
        <option key={hour} value={hour}>
          {hourLabel(hour)}
        </option>
      ))}
    </select>
  );
}

export function Volume({
  d,
  value,
  set,
}: {
  d: Described;
  value: unknown;
  set: (value: number) => void;
}) {
  const percent = Math.round((typeof value === "number" ? value : 0.5) * 100);
  return (
    <div className="kf-inline">
      <input
        {...aria(d)}
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        aria-valuetext={`${percent}%`}
        onChange={(event) => set(Number(event.target.value) / 100)}
      />
      <output htmlFor={d.id} className="kf-suffix">
        {percent}%
      </output>
    </div>
  );
}

export function Checks({
  name,
  value,
  set,
  options,
}: {
  name: string;
  value: unknown;
  set: (value: string[]) => void;
  options: Option[];
}) {
  const selected = Array.isArray(value) ? value.map(String) : [];
  const extra = selected.filter((item) => !options.some((option) => option.value === item));
  return (
    <div className="kf-checks">
      {[...options, ...extra.map((item) => ({ value: item, label: item }))].map((option) => (
        <label key={option.value} className="kf-toggle">
          <input
            type="checkbox"
            name={name}
            checked={selected.includes(option.value)}
            onChange={(event) => {
              const next = event.target.checked
                ? [...selected, option.value]
                : selected.filter((item) => item !== option.value);
              // Keep the catalogue's option order so saved lists stay stable.
              const order = [...options.map((o) => o.value), ...extra];
              set(order.filter((item) => next.includes(item)));
            }}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

/** Tag input: type a value, press Enter (or Add) to add it; each chip has its own remove button. */
export function Chips({
  d,
  label,
  value,
  set,
  item,
  placeholder,
  normalize,
  schema,
  maxItems,
  explain,
}: {
  d: Described;
  label: string;
  value: unknown;
  set: (value: string[]) => void;
  item: string;
  placeholder?: string;
  normalize?: (value: string) => string;
  schema?: z.ZodType;
  maxItems?: number;
  explain: (issue: z.core.$ZodIssue) => string;
}) {
  const items = Array.isArray(value) ? value.map(String) : [];
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const full = maxItems !== undefined && items.length >= maxItems;
  /** Adds each candidate that passes the item schema; reports the first one skipped. */
  const addAll = (candidates: string[]) => {
    const added: string[] = [];
    let skipped = "";
    for (const candidate of candidates) {
      const next = (normalize ?? ((text: string) => text))(candidate.trim());
      if (!next) continue;
      let reason = "";
      if (items.includes(next) || added.includes(next)) reason = `${next} is already in the list.`;
      else if (maxItems !== undefined && items.length + added.length >= maxItems)
        reason = `Maximum of ${maxItems} reached; ${next} was not added.`;
      else {
        const checked = schema?.safeParse(next);
        if (checked && !checked.success) reason = explain(checked.error.issues[0]!);
      }
      if (reason) skipped ||= reason;
      else added.push(next);
    }
    if (added.length) set([...items, ...added]);
    setDraft(candidates.length === 1 && skipped ? candidates[0]! : "");
    setProblem(
      skipped && candidates.length > 1 && added.length
        ? `Added ${added.length}. Skipped: ${skipped}`
        : skipped,
    );
  };
  const add = () => addAll([draft]);
  const inputId = `${d.id}-new`;
  return (
    <>
      {items.length > 0 ? (
        <ul className="kf-chips" aria-label={`${label}: ${items.length} added`}>
          {items.map((chip, index) => (
            <li key={`${chip}-${index}`} className="kf-chip">
              <span>{chip}</span>
              <button
                type="button"
                className="kf-chip-remove"
                aria-label={`Remove ${chip}`}
                onClick={() => {
                  set(items.filter((_, i) => i !== index));
                  input.current?.focus();
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="kf-count">None added.</p>
      )}
      <div className="kf-inline">
        <input
          ref={input}
          id={inputId}
          aria-label={`Add ${item}`}
          aria-describedby={
            [d.describedBy, problem ? `${inputId}-problem` : ""].filter(Boolean).join(" ") ||
            undefined
          }
          aria-invalid={Boolean(problem) || undefined}
          value={draft}
          placeholder={placeholder}
          disabled={full}
          autoComplete="off"
          onChange={(event) => {
            setDraft(event.target.value);
            setProblem("");
          }}
          onKeyDown={(event) => {
            // Enter adds; commas are ordinary characters so phrases may contain them.
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (!/[\r\n]/.test(pasted)) return;
            // One tag per pasted line.
            event.preventDefault();
            addAll(
              pasted
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean),
            );
          }}
          onBlur={() => draft.trim() && add()}
        />
        <button type="button" className="secondary" disabled={full} onClick={add}>
          Add
        </button>
      </div>
      <LiveError id={`${inputId}-problem`} message={problem} icon={false} />
      {full && <p className="kf-count">Maximum of {maxItems} reached.</p>}
    </>
  );
}

/** Insert `{variable}` at the caret of the last focused text field. */
export function VariableButtons({
  variables,
  insert,
}: {
  variables: Variable[];
  insert: (token: string) => void;
}) {
  return (
    <div className="kf-variables">
      <span className="kf-count">Insert:</span>
      {variables.map((variable) => (
        <button
          key={variable.name}
          type="button"
          className="secondary kf-small kf-mono"
          title={variable.help}
          aria-label={`Insert {${variable.name}}: ${variable.help}`}
          onClick={() => insert(`{${variable.name}}`)}
        >
          {`{${variable.name}}`}
        </button>
      ))}
    </div>
  );
}

type Caret = { index: number; start: number; end: number };

export function insertAt(text: string, token: string, start: number, end: number) {
  return { text: text.slice(0, start) + token + text.slice(end), caret: start + token.length };
}

/** Ordered text rows (responses, timer messages, poll choices) with add/remove buttons. */
export function ListInput({
  d,
  value,
  set,
  item,
  addLabel,
  multiline,
  bounds,
  variables,
}: {
  d: Described;
  value: unknown;
  set: (value: string[]) => void;
  item: string;
  addLabel: string;
  multiline: boolean;
  bounds: Bounds & { itemMax?: number };
  variables?: Variable[];
}) {
  const rows = Array.isArray(value) ? value.map(String) : [];
  const refs = useRef<(HTMLInputElement | HTMLTextAreaElement | null)[]>([]);
  const caret = useRef<Caret>({ index: Math.max(0, rows.length - 1), start: -1, end: -1 });
  const min = bounds.minItems ?? 0,
    max = bounds.maxItems ?? 50;
  const focus = (index: number, position?: number) =>
    requestAnimationFrame(() => {
      const element = refs.current[index];
      element?.focus();
      if (element && position !== undefined) element.setSelectionRange(position, position);
    });
  const remember = (index: number, element: HTMLInputElement | HTMLTextAreaElement) => {
    caret.current = {
      index,
      start: element.selectionStart ?? element.value.length,
      end: element.selectionEnd ?? element.value.length,
    };
  };
  return (
    <>
      {variables && (
        <VariableButtons
          variables={variables}
          insert={(token) => {
            if (!rows.length) {
              set([token]);
              return focus(0, token.length);
            }
            const index = Math.min(caret.current.index, rows.length - 1);
            const text = rows[index] ?? "";
            const start = caret.current.start < 0 ? text.length : caret.current.start;
            const end = caret.current.end < 0 ? text.length : caret.current.end;
            const result = insertAt(text, token, start, end);
            set(rows.map((row, i) => (i === index ? result.text : row)));
            caret.current = { index, start: result.caret, end: result.caret };
            focus(index, result.caret);
          }}
        />
      )}
      <ol className="kf-list">
        {rows.map((row, index) => {
          const rowId = `${d.id}-${index}`;
          const props = {
            id: rowId,
            ref: (element: HTMLInputElement & HTMLTextAreaElement) => {
              refs.current[index] = element;
            },
            value: row,
            maxLength: bounds.itemMax,
            "aria-describedby": d.describedBy,
            "aria-invalid": (d.invalid && row.trim() === "") || undefined,
            onChange: (event: { target: HTMLInputElement | HTMLTextAreaElement }) => {
              set(rows.map((current, i) => (i === index ? event.target.value : current)));
              remember(index, event.target);
            },
            onSelect: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) =>
              remember(index, event.currentTarget),
            onFocus: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) =>
              remember(index, event.currentTarget),
          };
          return (
            <li key={index} className="kf-list-row">
              <label className="kf-row-label" htmlFor={rowId}>
                {item} {index + 1}
              </label>
              <div className="kf-inline kf-top">
                {multiline ? <textarea rows={2} {...props} /> : <input {...props} />}
                <button
                  type="button"
                  className="secondary kf-small"
                  aria-label={`Remove ${item.toLowerCase()} ${index + 1}`}
                  disabled={rows.length <= min}
                  onClick={() => {
                    set(rows.filter((_, i) => i !== index));
                    focus(Math.max(0, index - 1));
                  }}
                >
                  Remove
                </button>
              </div>
              <Count length={row.length} max={bounds.itemMax} />
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="secondary"
        disabled={rows.length >= max}
        onClick={() => {
          set([...rows, ""]);
          focus(rows.length);
        }}
      >
        {addLabel}
      </button>
      {rows.length >= max && <p className="kf-count">Maximum of {max} reached.</p>}
    </>
  );
}
