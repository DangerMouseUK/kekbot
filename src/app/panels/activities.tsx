"use client";
import { useState } from "react";
import { permitted } from "../ui";
import type { PanelProps } from "./types";

const durations = [2, 5, 10, 15, 30, 60];

export default function ActivitiesPanel({ snapshot: s, auth, run, busy }: PanelProps) {
  const [kind, setKind] = useState<"poll" | "raffle">("poll");
  const [options, setOptions] = useState(["", ""]);
  const open = s.documents.filter(
    (doc) => ["poll", "raffle"].includes(doc.kind) && doc.data.status === "open",
  );
  const canCreate = permitted(auth.actor, "configure");
  return (
    <>
      {open.length > 1 && (
        <p className="notice info">
          More than one poll or raffle is open. Chat commands use the newest open one, so close the
          others to avoid confusion.
        </p>
      )}
      {canCreate && (
        <section aria-labelledby="quick-start">
          <h2 id="quick-start">Quick start</h2>
          <fieldset className="segmented">
            <legend className="visually-hidden">What to start</legend>
            {(["poll", "raffle"] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="quick-kind"
                  checked={kind === value}
                  onChange={() => setKind(value)}
                />
                {value === "poll" ? "Poll" : "Raffle"}
              </label>
            ))}
          </fieldset>
          <form
            className="quick-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget,
                values = new FormData(form);
              const endsAt = Date.now() + Number(values.get("minutes")) * 60000;
              const data =
                kind === "poll"
                  ? {
                      name: String(values.get("name")).trim(),
                      enabled: true,
                      options: options.map((option) => option.trim()).filter(Boolean),
                      status: "open",
                      endsAt,
                      allowChange: values.get("allowChange") === "on",
                    }
                  : {
                      name: String(values.get("name")).trim(),
                      enabled: true,
                      status: "open",
                      endsAt,
                      roles: [],
                      minPoints: Number(values.get("minPoints") || 0),
                      winners: [],
                    };
              const result = await run(
                "config.save",
                { kind, data },
                {
                  success:
                    kind === "poll"
                      ? "Poll started. Tell chat to type !vote and an option number."
                      : "Raffle started. Tell chat to type !enter.",
                },
              );
              if (result) {
                form.reset();
                setOptions(["", ""]);
              }
            }}
          >
            <div className="fields">
              <label>
                {kind === "poll" ? "Question" : "Raffle name"}
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder={kind === "poll" ? "What should we play next?" : "Friday giveaway"}
                />
              </label>
              <label>
                Runs for
                <select name="minutes" defaultValue="5">
                  {durations.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes < 60 ? `${minutes} minutes` : "1 hour"}
                    </option>
                  ))}
                </select>
              </label>
              {kind === "raffle" && (
                <label>
                  Minimum points to enter
                  <input name="minPoints" type="number" min={0} step={1} defaultValue={0} />
                </label>
              )}
            </div>
            {kind === "poll" && (
              <fieldset className="options">
                <legend>Options (viewers type !vote 1, !vote 2 …)</legend>
                {options.map((option, index) => (
                  <div className="option-row" key={index}>
                    <label>
                      Option {index + 1}
                      <input
                        required={index < 2}
                        maxLength={80}
                        value={option}
                        onChange={(event) =>
                          setOptions(
                            options.map((value, i) => (i === index ? event.target.value : value)),
                          )
                        }
                      />
                    </label>
                    {options.length > 2 && (
                      <button
                        type="button"
                        className="secondary small"
                        onClick={() => setOptions(options.filter((_, i) => i !== index))}
                      >
                        Remove<span className="visually-hidden"> option {index + 1}</span>
                      </button>
                    )}
                  </div>
                ))}
                {options.length < 10 && (
                  <button
                    type="button"
                    className="secondary small"
                    onClick={() => setOptions([...options, ""])}
                  >
                    Add option
                  </button>
                )}
                <label className="check">
                  <input name="allowChange" type="checkbox" /> Let viewers change their vote
                </label>
              </fieldset>
            )}
            <button disabled={busy}>{kind === "poll" ? "Start poll" : "Start raffle"}</button>
          </form>
        </section>
      )}
      {!canCreate && (
        <p className="help">
          Viewers vote with !vote and a number, and enter raffles with !enter. You can close polls
          and draw raffle winners below; creating them needs configuration access.
        </p>
      )}
    </>
  );
}
