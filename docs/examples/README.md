# Configuration examples

These are synthetic **document data** examples for [the field reference](../CONFIGURATION_FIELDS.md). They contain no credentials or installation-specific values. CI parses every file against the current strict schema. They are not complete backup/import bundles and are not automatically installed.

| Kind | Example | Notes |
| --- | --- | --- |
| command | [Welcome](command.json) | Preview-safe custom response |
| timer | [Reminder](timer.json) | Disabled until deliberately enabled |
| alert | [Manual alert](alert.json) | No asset dependencies |
| widget | [Alert source](widget.json) | Access URL must be created separately |
| rule | [Phrase warning](rule.json) | Disabled; safe-test before enabling |
| goal | [Manual goal](goal.json) | No event history invented |
| reward | [Manual reward](reward.json) | Points must be enabled before redemption |
| poll | [Two-option poll](poll.json) | Replace fixed illustrative deadline |
| raffle | [Open raffle](raffle.json) | Replace fixed illustrative deadline |
| note | [Synthetic viewer note](note.json) | Moderator-only private state in real use |
| guild | [Notification route](guild.json) | Synthetic IDs; no control grants |
| settings | [Conservative instance defaults](settings.json) | Media/points remain disabled |

To use an example in the dashboard, enter its fields in the matching editor. To use the API, place the object inside `input.data` of `config.save` and set `input.kind` to the filename's kind. Updates also need the saved document ID/version. Settings/guild writes are owner-session operations, not integration API operations. See [API examples](../API.md#examples).
