// A command stores "when it works" in two schema fields that the runtime applies together
// (automation.ts): `streamOnly` (the older "Require a live stream" switch) and `condition`.
// Both use the same observed live state, so the editor shows one choice and maps it back.
// Existing documents keep their behaviour: streamOnly + "always"/"live" reads as "live", and
// streamOnly + "offline" (which can never run) is shown as "never" until someone changes it.
import type { Option } from "./layouts.ts";

export type Availability = "always" | "live" | "offline" | "never";

type Data = Record<string, unknown>;

/** The single choice equivalent to a command's stored `condition` and `streamOnly`. */
export function commandAvailability(data: Data): Availability {
  const condition =
    data.condition === "live" || data.condition === "offline" ? data.condition : "always";
  if (data.streamOnly !== true) return condition;
  return condition === "offline" ? "never" : "live";
}

/**
 * The stored fields for a choice. Choosing "never" keeps the stored pair as it is: the option is
 * only offered so the current (contradictory) value can be displayed.
 */
export function availabilityFields(
  choice: Availability,
  data: Data,
): { condition: string; streamOnly: boolean } {
  if (choice === "never")
    return { condition: String(data.condition ?? "always"), streamOnly: data.streamOnly === true };
  return { condition: choice, streamOnly: false };
}

export const availabilityOptions = (current: Availability): Option[] => [
  { value: "always", label: "Any time" },
  { value: "live", label: "Only while live" },
  { value: "offline", label: "Only while offline" },
  ...(current === "never" ? [{ value: "never", label: "Never (live and offline at once)" }] : []),
];

/** Short phrase for card summaries; empty when the command works any time. */
export const availabilityPhrase: Record<Availability, string> = {
  always: "",
  live: "only while live",
  offline: "only while offline",
  never: "never runs: needs live and offline at once",
};
