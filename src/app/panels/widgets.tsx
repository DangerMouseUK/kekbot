"use client";
import { relative, text } from "../ui";
import { widgetTypes as typeOptions } from "../forms/layouts";
import { scopes, widgetTypes } from "./cards";
import type { PanelProps } from "./types";

export default function WidgetsPanel({ snapshot: s, auth, run, busy, confirm }: PanelProps) {
  const owner = auth.actor?.role === "owner";
  const widgets = new Set(s.documents.filter((doc) => doc.kind === "widget").map((doc) => doc.id));
  // Tokens whose widget was deleted still exist until revoked.
  const orphans = (s.tokens ?? []).filter((token) => {
    const scope = scopes(token).find((value) => value.startsWith("widget:"));
    return scope && !widgets.has(scope.slice(7));
  });
  return (
    <>
      <section aria-labelledby="obs-guide">
        <h2 id="obs-guide">How to add a widget to OBS</h2>
        <ol className="steps">
          <li>
            Select <strong>Add widget</strong>, choose a type and theme, and save it.
          </li>
          <li>
            {owner ? (
              <>
                On its card, select <strong>Create OBS source URL</strong> and copy the URL. It is
                shown only once.
              </>
            ) : (
              "Ask the owner to create its private source URL. Only the owner can issue one."
            )}
          </li>
          <li>
            In OBS, open the scene, select <strong>+</strong> under Sources, choose{" "}
            <strong>Browser</strong>, and name the source.
          </li>
          <li>
            Paste the URL into the <strong>URL</strong> field and set <strong>Width</strong> and{" "}
            <strong>Height</strong> to the size shown on the card. Select OK.
          </li>
          <li>
            Media player: keep its source visible while you stream. After a restart, press Resume in
            Media.
          </li>
        </ol>
        <p className="help">
          Each URL contains a private token. Treat it like a password: do not show it on stream. If
          one leaks, revoke it on the widget card and create a new one.
        </p>
      </section>
      <section aria-labelledby="widget-types">
        <h2 id="widget-types">Widget types</h2>
        <dl className="type-list">
          {Object.entries(widgetTypes).map(([type, description]) => (
            <div key={type}>
              {/* The same names as the editor's "What it shows" list. */}
              <dt>{typeOptions.find((option) => option.value === type)?.label ?? type}</dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </section>
      {owner && orphans.length > 0 && (
        <section aria-labelledby="orphan-tokens">
          <h2 id="orphan-tokens">Source URLs for deleted widgets</h2>
          <p className="help">
            These widgets were deleted, but their URLs still exist. Revoke them.
          </p>
          <ul className="token-list">
            {orphans.map((token) => (
              <li key={String(token.id)}>
                <span>
                  {/* Older URLs were named "… read" / "… player". */}
                  {text(token.name)
                    .replace(/ read$/, " display URL")
                    .replace(/ player$/, " playback credential")}{" "}
                  · created {relative(Number(token.created_at))}
                </span>
                <button
                  className="secondary small"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Revoke this source URL?",
                        body: <p>Its widget no longer exists. This cannot be undone.</p>,
                        confirm: "Revoke",
                        danger: true,
                      })
                    )
                      void run("token.revoke", { id: token.id });
                  }}
                >
                  Revoke<span className="visually-hidden"> {text(token.name)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
