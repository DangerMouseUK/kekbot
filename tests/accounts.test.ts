import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { AuthService, authorize } from "../src/server/auth.ts";
import { environment, repository } from "./helpers.ts";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); });
function setup() {
  const env = environment();
  cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
  const repo = repository(env.config);
  cleanup.push(() => repo.store.close());
  return { ...env, repo, auth: new AuthService(repo), token: readFileSync(env.config.setupTokenFile, "utf8").trim() };
}
describe("local accounts", () => {
  it("claims exactly once, hashes passwords, revokes disabled sessions and consumes invitations once", async () => {
    const { auth, repo, token } = setup();
    const outcomes = await Promise.allSettled([auth.setup(token, { username: "owner1", password: "a strong test password" }), auth.setup(token, { username: "owner2", password: "another strong password" })]);
    expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
    const session = outcomes.find(x => x.status === "fulfilled")! as PromiseFulfilledResult<Awaited<ReturnType<typeof auth.setup>>>;
    const owner = auth.session(session.value.token);
    expect((repo.store.sqlite.prepare("SELECT password FROM accounts").get() as { password: string }).password).toMatch(/^\$argon2id\$/);
    const invitation = auth.invite(owner, "readonly");
    const member = await auth.acceptInvite(invitation.token, { username: "member", password: "a read only password" });
    expect(() => authorize(auth.session(member.token), "configure")).toThrow("permission_denied");
    await expect(auth.acceptInvite(invitation.token, { username: "reused", password: "a reused password here" })).rejects.toThrow("invitation_invalid_or_expired");
    auth.disable(owner, auth.session(member.token).id, true);
    expect(() => auth.session(member.token)).toThrow("login_required");
    const admin = await auth.acceptInvite(auth.invite(owner, "admin", ["configure", "accounts"]).token, { username: "admin", password: "an admin test password" });
    expect(() => authorize(auth.session(admin.token), "accounts")).toThrow("owner_required");
    expect(() => authorize(auth.session(admin.token), "configure")).not.toThrow();
  });
  it("rejects expired setup and invalid login; password changes revoke all sessions", async () => {
    const { auth, repo, token } = setup();
    repo.set("setup_expires", "1");
    await expect(auth.setup(token, { username: "owner", password: "a strong test password" })).rejects.toThrow("setup_token_invalid_or_expired");
    repo.set("setup_expires", String(Date.now() + 60000));
    const session = await auth.setup(token, { username: "owner", password: "a strong test password" });
    await expect(auth.login({ username: "owner", password: "a different password" })).rejects.toThrow("invalid_credentials");
    await auth.changePassword(auth.session(session.token), "a strong test password", "a replacement password");
    expect(() => auth.session(session.token)).toThrow("login_required");
    expect((await auth.login({ username: "owner", password: "a replacement password" })).token).toBeTruthy();
  });
  it("permits owner-granted admin invitations without expanding authority and rechecks grants at acceptance", async () => {
    const { auth, repo, token } = setup();
    const login = await auth.setup(token, { username: "owner", password: "a strong test password" }), owner = auth.session(login.token);
    const limited = await auth.acceptInvite(auth.invite(owner, "admin", ["invite", "configure"]).token, { username: "admin", password: "a strong admin password" });
    const admin = auth.session(limited.token);
    expect(() => auth.invite(admin, "admin", ["moderate"])).toThrow("invitation_exceeds_admin_grant");
    expect(() => auth.invite(admin, "admin", ["invite"])).toThrow("invitation_exceeds_admin_grant");
    expect(() => auth.invite(admin, "moderator")).toThrow("invitation_exceeds_admin_grant");
    expect(() => auth.invite(admin, "owner")).toThrow();
    const reader = auth.invite(admin, "readonly");
    await expect(auth.acceptInvite(reader.token, { username: "reader", password: "a strong reader password" })).resolves.toHaveProperty("token");
    const narrower = auth.invite(admin, "admin", ["configure"]);
    repo.store.sqlite.prepare("UPDATE accounts SET permissions='[]' WHERE id=?").run(admin.id);
    await expect(auth.acceptInvite(narrower.token, { username: "narrower", password: "a strong invited password" })).rejects.toThrow("permission_denied");
    expect(() => auth.invite(admin, "readonly")).toThrow("permission_denied");
    repo.store.sqlite.prepare("UPDATE accounts SET permissions=? WHERE id=?").run(JSON.stringify(["invite", "operate", "moderate", "media", "engage"]), admin.id);
    const moderator = auth.invite(auth.session(limited.token), "moderator");
    auth.disable(owner, admin.id, true);
    await expect(auth.acceptInvite(moderator.token, { username: "moderator", password: "a strong moderator password" })).rejects.toThrow("invitation_creator_unavailable");
  });
});
