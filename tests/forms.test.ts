import { describe, expect, it } from "vitest";
import {
  configSchemas,
  widgetAccents,
  widgetThemes,
  type Kind,
} from "../src/server/domain/catalog.ts";
import { renderTemplate as serverRender } from "../src/server/domain/presentation.ts";
import { examples } from "../src/app/forms/examples.ts";
import { describeServerError } from "../src/app/forms/errors.ts";
import { grantRowErrors, grantsToRows, rowsToGrants } from "../src/app/forms/grants.ts";
import { layouts, normalizeDomain, normalizeTrigger } from "../src/app/forms/layouts.ts";
import { bounds, crossChecks, validate } from "../src/app/forms/schema.ts";
import { commandSample, renderTemplate } from "../src/app/forms/template.ts";
import {
  allowedUnits,
  bestUnit,
  formatDuration,
  fromUnit,
  localInputToMs,
  msToLocalInput,
  toUnit,
} from "../src/app/forms/time.ts";

describe("date-time conversion", () => {
  it("round-trips local date-time input values through Unix milliseconds", () => {
    const ms = new Date(2030, 0, 15, 18, 45).getTime();
    expect(msToLocalInput(ms)).toBe("2030-01-15T18:45");
    expect(localInputToMs("2030-01-15T18:45")).toBe(ms);
    expect(localInputToMs(msToLocalInput(ms))).toBe(ms);
    // Across a month/year boundary and with optional seconds.
    expect(localInputToMs("2031-12-31T23:59:30")).toBe(
      new Date(2031, 11, 31, 23, 59, 30).getTime(),
    );
  });

  it("shows stored seconds at minute precision without changing the stored value", () => {
    const ms = new Date(2030, 5, 1, 9, 5, 42, 123).getTime();
    expect(msToLocalInput(ms)).toBe("2030-06-01T09:05");
  });

  it("treats blank, zero and malformed values as unset", () => {
    for (const value of [null, undefined, 0, -1, Number.NaN])
      expect(msToLocalInput(value)).toBe("");
    for (const value of ["", "tomorrow", "2030-02-31T10:00", "2030-01-01T25:00", "2030-01-01"])
      expect(localInputToMs(value)).toBeNull();
  });

  it("ignores the partial years Chromium reports while a year is typed digit by digit", () => {
    for (const year of ["0002", "0020", "0203", "1969"])
      expect(localInputToMs(`${year}-06-15T10:30`)).toBeNull();
    expect(localInputToMs("2031-06-15T10:30")).toBe(new Date(2031, 5, 15, 10, 30).getTime());
  });

  it("produces values the poll and rule schemas accept", () => {
    const endsAt = localInputToMs(msToLocalInput(Date.now() + 3600000))!;
    expect(configSchemas.poll.shape.endsAt.safeParse(endsAt).success).toBe(true);
    expect(configSchemas.rule.shape.startsAt.safeParse(localInputToMs("")).success).toBe(true);
  });
});

describe("duration units", () => {
  it("offers only units that fit the schema maximum", () => {
    expect(allowedUnits("seconds", 30)).toEqual(["seconds"]);
    expect(allowedUnits("seconds", 3600)).toEqual(["seconds", "minutes", "hours"]);
    expect(allowedUnits("seconds", 86400)).toEqual(["seconds", "minutes", "hours", "days"]);
    expect(allowedUnits("minutes", 10080)).toEqual(["minutes", "hours", "days"]);
  });

  it("picks the largest whole unit and converts back to whole stored units", () => {
    expect(bestUnit(300, "seconds", allowedUnits("seconds", 86400))).toBe("minutes");
    expect(bestUnit(90, "seconds", allowedUnits("seconds", 86400))).toBe("seconds");
    expect(bestUnit(3600, "seconds", allowedUnits("seconds", 3600))).toBe("hours");
    expect(bestUnit(1440, "minutes", allowedUnits("minutes", 10080))).toBe("days");
    expect(bestUnit(0, "seconds", allowedUnits("seconds", 3600))).toBe("seconds");
    expect(toUnit(300, "seconds", "minutes")).toBe(5);
    expect(fromUnit(1.5, "minutes", "seconds")).toBe(90);
    expect(fromUnit(2, "hours", "minutes")).toBe(120);
    expect(formatDuration(86400)).toBe("1 day");
    expect(formatDuration(10, "minutes")).toBe("10 minutes");
  });
});

describe("Discord grant rows", () => {
  let n = 0;
  const key = () => `row-${++n}`;

  it("round-trips grants and keeps 24-digit IDs exact as strings", () => {
    const grants = [
      { id: "123456789012345678901234", permission: "media" as const },
      { id: "300", permission: "operate" as const },
      { id: "300", permission: "engage" as const },
    ];
    const rows = grantsToRows(grants, key);
    expect(rows.map((row) => row.id)).toEqual(grants.map((grant) => grant.id));
    expect(rowsToGrants(rows)).toEqual(grants);
    const saved = configSchemas.guild.parse({
      name: "Route",
      guildId: "1",
      channelId: "2",
      roles: rowsToGrants(rows),
    });
    expect(saved.roles[0]!.id).toBe("123456789012345678901234");
  });

  it("drops blank rows, trims IDs and flags invalid or duplicate rows", () => {
    const rows = [
      { key: "a", id: " 42 ", permission: "media" as const },
      { key: "b", id: "", permission: "operate" as const },
      { key: "c", id: "@moderators", permission: "operate" as const },
      { key: "d", id: "42", permission: "media" as const },
    ];
    expect(rowsToGrants(rows)).toEqual([
      { id: "42", permission: "media" },
      { id: "@moderators", permission: "operate" },
      { id: "42", permission: "media" },
    ]);
    const errors = grantRowErrors(rows, "role");
    expect(Object.keys(errors)).toEqual(["c", "d"]);
    expect(errors.c).toMatch(/1–24 digits/);
    // The schema rejects the invalid ID too, so the editor blocks saving.
    expect(
      validate("guild", {
        ...examples.guild,
        guildId: "1",
        channelId: "2",
        roles: rowsToGrants(rows),
      }).roles,
    ).toMatch(/1–24 digits/);
  });

  it("keeps unknown permissions exactly as stored instead of converting them", () => {
    const stored = [
      { id: "300", permission: "admin" },
      { id: "", permission: 5 },
      { id: "301", permission: "media" },
    ];
    const rows = grantsToRows(stored, key);
    expect(rows.map((row) => row.permission)).toEqual(["admin", 5, "media"]);
    // Editing another row never rewrites the unknown ones, and blank-ID unknown rows are kept.
    const edited = rows.map((row) =>
      row.id === "301" ? { ...row, permission: "engage" as const } : row,
    );
    expect(rowsToGrants(edited)).toEqual([
      { id: "300", permission: "admin" },
      { id: "", permission: 5 },
      { id: "301", permission: "engage" },
    ]);
    const errors = grantRowErrors(rows, "role");
    expect(errors[rows[0]!.key]).toMatch(/does not recognise \(“admin”\)/);
    expect(errors[rows[1]!.key]).toMatch(/\(5\)/);
    expect(errors[rows[2]!.key]).toBeUndefined();
    // Saving stays blocked by the schema until the person removes the row.
    expect(
      validate("guild", {
        ...examples.guild,
        guildId: "1",
        channelId: "2",
        roles: rowsToGrants(rows),
      }).roles,
    ).toMatch(/does not recognise/);
  });
});

describe("schema-driven validation", () => {
  it("reads bounds from the catalog", () => {
    expect(bounds("command", "cooldown")).toMatchObject({ min: 0, max: 3600, int: true });
    expect(bounds("command", "aliases")).toMatchObject({ maxItems: 10 });
    expect(bounds("command", "responses")).toMatchObject({ minItems: 1, maxItems: 20 });
    expect(bounds("timer", "quietStart")).toMatchObject({ min: 0, max: 23, nullable: true });
    expect(bounds("alert", "volume")).toMatchObject({ min: 0, max: 1, int: false });
  });

  it("explains failures in plain English next to the right field", () => {
    const errors = validate("command", {
      ...examples.command,
      name: " ",
      trigger: "Welcome",
      cooldown: 99999,
      responses: ["ok", ""],
    });
    expect(errors.name).toBe("Required.");
    expect(errors.trigger).toMatch(/Start with !/);
    expect(errors.cooldown).toBe("Choose between 0 seconds and 1 hour.");
    expect(errors.responses).toBe("Response 2: Cannot be empty.");
    expect(validate("timer", { ...examples.timer, interval: 30 }).interval).toBe(
      "Choose between 1 minute and 1 day.",
    );
    expect(validate("timer", { ...examples.timer, timezone: "Mars/Base" }).timezone).toMatch(
      /timezone/,
    );
    expect(validate("poll", { ...examples.poll, endsAt: null }).endsAt).toBe(
      "Choose a date and time.",
    );
    expect(validate("poll", { ...examples.poll, endsAt: 1, options: ["Only one"] }).options).toBe(
      "Add at least 2 choices.",
    );
  });

  it("accepts every starting example once required identities are filled in", () => {
    const filled: Partial<Record<Kind, Record<string, unknown>>> = {
      poll: { endsAt: Date.now() + 1000 },
      raffle: { endsAt: Date.now() + 1000 },
      note: { viewer: "456", text: "Synthetic note" },
      guild: { guildId: "100", channelId: "200" },
    };
    for (const kind of Object.keys(examples) as Kind[])
      expect(validate(kind, { ...examples[kind], ...filled[kind] }), kind).toEqual({});
  });

  it("only lays out fields that exist in the schema", () => {
    for (const [kind, sections] of Object.entries(layouts)) {
      const keys = Object.keys(configSchemas[kind as Kind].shape);
      for (const field of sections.flatMap((section) => section.fields))
        expect(keys, kind).toContain(field.key);
    }
  });

  it("gives every widget field a control and shows type-specific options only where they apply", () => {
    const sections = layouts.widget;
    const fields = sections.flatMap((section) => section.fields);
    expect(fields.map((field) => field.key).sort()).toEqual(
      Object.keys(configSchemas.widget.shape).sort(),
    );
    const field = (key: string) => fields.find((spec) => spec.key === key)!;
    const shown = (key: string, type: string, extra: Record<string, unknown> = {}) => {
      const data = { ...examples.widget, type, ...extra };
      const section = sections.find((candidate) => candidate.fields.includes(field(key)))!;
      return (section.visible?.(data) ?? true) && (field(key).visible?.(data) ?? true);
    };
    const options = (key: string) => {
      const control = field(key).control;
      return control.type === "select" ? control.options.map((option) => option.value) : [];
    };
    expect(options("theme")).toEqual([...widgetThemes]);
    expect(options("accent")).toEqual([...widgetAccents]);
    for (const key of [
      "theme",
      "accent",
      "fontScale",
      "align",
      "backdrop",
      "layout",
      "reducedMotion",
    ])
      for (const type of ["alerts", "chat", "status", "socials"])
        expect(shown(key, type), `${key}/${type}`).toBe(true);
    expect(shown("shoutoutSeconds", "shoutout")).toBe(true);
    expect(shown("shoutoutSeconds", "alerts")).toBe(false);
    expect(shown("chatFadeSeconds", "chat")).toBe(true);
    expect(shown("chatFadeSeconds", "queue")).toBe(false);
    expect(shown("endText", "countdown")).toBe(true);
    expect(shown("endText", "counter")).toBe(false);
    for (const key of ["showUptime", "showViewers"]) {
      expect(shown(key, "status")).toBe(true);
      expect(shown(key, "chat")).toBe(false);
    }
    expect(shown("showEmpty", "queue")).toBe(true);
    expect(shown("showEmpty", "alerts")).toBe(false);
    expect(shown("showEmpty", "shoutout")).toBe(false);
    expect(shown("title", "queue")).toBe(true);
    expect(shown("title", "queue", { showTitle: false })).toBe(false);
    expect(shown("title", "chat")).toBe(false);
    expect(shown("showDetails", "counter")).toBe(false);
  });

  it("starts new widgets with friendlier values than the upgrade-safe schema defaults", () => {
    const defaults = configSchemas.widget.parse({ name: "Legacy", type: "shoutout" });
    expect(defaults).toMatchObject({ showEmpty: false, shoutoutSeconds: 0 });
    expect(examples.widget).toMatchObject({ showEmpty: true, shoutoutSeconds: 20 });
    expect(validate("widget", examples.widget)).toEqual({});
  });

  it("mirrors the server's trigger conflict rules", () => {
    const documents = [
      {
        id: "other",
        kind: "command" as const,
        version: 1,
        updatedAt: 0,
        data: { name: "Hello", trigger: "!hello", aliases: ["!hi"] },
      },
    ];
    expect(
      crossChecks("command", { ...examples.command, trigger: "!points" }, [], undefined).errors
        .trigger,
    ).toMatch(/built-in/);
    expect(
      crossChecks(
        "command",
        { ...examples.command, trigger: "!welcome", aliases: ["!hi"] },
        documents,
        undefined,
      ).errors.trigger,
    ).toMatch(/“Hello”/);
    expect(
      crossChecks("command", { ...examples.command, trigger: "!hello" }, documents, "other").errors,
    ).toEqual({});
    expect(
      crossChecks("command", { ...examples.command, aliases: ["!welcome"] }, [], undefined).errors
        .aliases,
    ).toMatch(/main trigger/);
  });

  it("normalises triggers and website names as people type them", () => {
    expect(normalizeTrigger(" Welcome Back")).toBe("!welcome_back");
    expect(normalizeTrigger("welcome ")).toBe("!welcome");
    expect(normalizeTrigger("  ")).toBe("");
    expect(normalizeTrigger("!hi")).toBe("!hi");
    expect(normalizeDomain("https://www.YouTube.com/watch?v=x")).toBe("youtube.com");
  });
});

describe("previews and server errors", () => {
  it("renders templates exactly like the server", () => {
    for (const template of [
      "Welcome, {user}! {args} · {channel} #{counter} ({points})",
      "{unknown} {User}",
      "x".repeat(600),
    ])
      expect(renderTemplate(template, commandSample("KekBot"))).toBe(
        serverRender(template, commandSample("KekBot")),
      );
  });

  it("maps AppError codes to readable messages and flags version conflicts", () => {
    const conflict = describeServerError("configuration_changed_reload", "command");
    expect(conflict.conflict).toBe(true);
    expect(conflict.summary).toMatch(/Reload the latest values/);
    expect(describeServerError("command_trigger_conflict", "command").fields.trigger).toBeTruthy();
    expect(describeServerError("invalid_input: trigger, aliases.1", "command").fields).toEqual({
      trigger: expect.any(String),
      aliases: expect.any(String),
    });
    expect(describeServerError("Session changed; result discarded", "command").summary).toBe(
      "Session changed; result discarded",
    );
    expect(describeServerError("something_new", "widget").summary).toBe(
      "Saving failed (something new).",
    );
  });
});
