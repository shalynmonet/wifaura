// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";

let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const drop = "00000000-0000-4000-8000-000000000004";
const payer = "0x" + "1".repeat(40),
  reserve = "0x" + "2".repeat(40),
  router = "0x" + "3".repeat(40),
  treasury = "0x" + "4".repeat(40);
let q: { id: string };
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`);
  for (const f of readdirSync("drizzle/migrations")
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort())
    await db.exec(readFileSync(`drizzle/migrations/${f}`, "utf8"));
  await db.exec(readFileSync("database/wifaura.sql", "utf8"));
  await db.exec(`INSERT INTO auth.users(id,email) VALUES('${user}','w@test.invalid'),('${other}','o@test.invalid');
 INSERT INTO daily_drops(id,entity_id,number,clue,sigil,starts_at,ends_at) SELECT '${drop}',id,999,'test','test',now()-interval '1 hour',now()+interval '1 hour' FROM entities LIMIT 1;
 INSERT INTO wif_wallet_links VALUES('${user}','payer','${payer}'),('${user}','reserve','${reserve}');`);
}, 60_000);
afterAll(async () => {
  await db?.close();
});
it("denies public/collector access to private WIF evidence and service-only issuance", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await expect(db.query("SELECT * FROM wif_quotes")).rejects.toThrow(/permission denied/);
      await expect(
        db.query(
          `SELECT wif_fulfill('${user}','${user}','0x${"a".repeat(64)}','1','0x${"b".repeat(64)}')`,
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(db.query("SELECT * FROM wif_wallet_challenges")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec("RESET ROLE");
    }
  }
  expect(
    (
      await db.query<{ ok: boolean }>(
        `SELECT has_function_privilege('authenticated','public.simulate_paid_unseal(uuid,text,bigint,jsonb,text,numeric)','execute') ok`,
      )
    ).rows[0]!.ok,
  ).toBe(false);
});
it("creates one durable quote, snapshots Reserve, then fulfills exactly once under retries", async () => {
  await db.exec("SET ROLE service_role");
  try {
    const sql = `SELECT wif_create_quote('${user}','${drop}','become',1,'{}','${router}','${treasury}','1000',18,'0x${"c".repeat(64)}','100','0.001255','https://api.dexscreener.com',now()) q`;
    const rows = await Promise.all(
      [1, 2, 3].map(() =>
        db.query<{ q: { id: string; quote_key: string; expires_at: string } }>(sql),
      ),
    );
    expect(new Set(rows.map((r) => r.rows[0]!.q.id)).size).toBe(1);
    q = rows[0]!.rows[0]!.q;
    const quoted = rows[0]!.rows[0]!.q;
    expect(BigInt(quoted.quote_key.slice(0, 18))).toBe(
      BigInt(Math.floor(Date.parse(quoted.expires_at) / 1000)),
    );
    await db.exec(
      `UPDATE wif_wallet_links SET address='${treasury}' WHERE user_id='${user}' AND purpose='reserve'; UPDATE wif_quotes SET status='pending' WHERE id='${q.id}'`,
    );
    const fulfill = `SELECT wif_fulfill('${q.id}','${user}','0x${"a".repeat(64)}','200','0x${"b".repeat(64)}') q`;
    const results = await Promise.all(
      [1, 2, 3].map(() => db.query<{ q: { manifestation_id: string; reserve: string } }>(fulfill)),
    );
    expect(new Set(results.map((r) => r.rows[0]!.q.manifestation_id)).size).toBe(1);
    expect(results[0]!.rows[0]!.q.reserve).toBe(reserve);
    await expect(
      db.query(
        `SELECT wif_fulfill('${q.id}','${other}','0x${"a".repeat(64)}','200','0x${"b".repeat(64)}')`,
      ),
    ).rejects.toThrow(/not found/);
    await expect(
      db.query(
        `SELECT wif_fulfill('${q.id}','${user}','0x${"d".repeat(64)}','200','0x${"b".repeat(64)}')`,
      ),
    ).rejects.toThrow(/Hash mismatch/);
  } finally {
    await db.exec("RESET ROLE");
  }
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT count(*)::int n FROM collective_contributions WHERE deployment='wifaura'`,
      )
    ).rows[0]!.n,
  ).toBe(1);
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT count(*)::int n FROM collective_contributions WHERE deployment='nimiq'`,
      )
    ).rows[0]!.n,
  ).toBe(0);
});
it("counts free and paid once per person/drop and hides locked entity content", async () => {
  await db.exec(
    `SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;`,
  );
  try {
    await db.query(`SELECT unseal_with_credit('${drop}','become',1,'{}')`);
  } finally {
    await db.exec("RESET ROLE");
  }
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT count(*)::int n FROM collective_contributions WHERE deployment='wifaura'`,
      )
    ).rows[0]!.n,
  ).toBe(1);
  await db.exec("SET ROLE anon");
  try {
    const state = (
      await db.query<{
        s: { total: number; milestones: { name: string | null; threshold: number }[] };
      }>(`SELECT collective_state('wifaura') s`)
    ).rows[0]!.s;
    expect(state.total).toBe(1);
    expect(state.milestones.map((x) => x.threshold)).toEqual([
      100, 250, 500, 1000, 2500, 5000, 10000,
    ]);
    expect(state.milestones.every((x) => x.name === null)).toBe(true);
  } finally {
    await db.exec("RESET ROLE");
  }
});
it("consumes a challenge once and never permits expired challenge replay", async () => {
  await db.exec(
    `INSERT INTO wif_wallet_challenges VALUES('${other}','${other}','${reserve}','reserve','message',now()+interval '1 minute',NULL),('${drop}','${other}','${reserve}','reserve','expired',now()-interval '1 minute',NULL); SET ROLE service_role;`,
  );
  try {
    await db.query(`SELECT wif_consume_challenge('${other}','${other}')`);
    await expect(db.query(`SELECT wif_consume_challenge('${other}','${other}')`)).rejects.toThrow(
      /unavailable/,
    );
    await expect(db.query(`SELECT wif_consume_challenge('${drop}','${other}')`)).rejects.toThrow(
      /unavailable/,
    );
  } finally {
    await db.exec("RESET ROLE");
  }
});
it("does not count simulated art and awakens the first milestone exactly at 100", async () => {
  const sim = await db.query<{ id: string }>(
    `INSERT INTO manifestations(user_id,drop_id,entity_id,intention,seed,config,source) SELECT '${other}','${drop}',entity_id,'become',1,'{}','simulated' FROM daily_drops WHERE id='${drop}' RETURNING id`,
  );
  await db.query(`SELECT collective_count('${sim.rows[0]!.id}')`);
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT count(*)::int n FROM collective_contributions WHERE deployment='wifaura'`,
      )
    ).rows[0]!.n,
  ).toBe(1);
  // Synthetic history fixture puts the count at 99; the 100th contribution below
  // travels through the actual authenticated credit redemption trigger.
  await db.exec(`WITH fixture AS (
 INSERT INTO manifestations(user_id,drop_id,entity_id,intention,seed,config,source)
 SELECT gen_random_uuid(),'${drop}',d.entity_id,'become',g,'{}','complimentary'
 FROM daily_drops d CROSS JOIN generate_series(1,98) g WHERE d.id='${drop}' RETURNING id,user_id,drop_id)
 INSERT INTO collective_contributions(deployment,manifestation_id,user_id,drop_id)
 SELECT 'wifaura',id,user_id,drop_id FROM fixture;`);
  expect(
    (
      await db.query<{ s: { milestones: { name: string | null }[] } }>(
        `SELECT collective_state('wifaura') s`,
      )
    ).rows[0]!.s.milestones[0]!.name,
  ).toBeNull();
  await db.exec(
    `SELECT set_config('request.jwt.claim.sub','${other}',false); SET ROLE authenticated`,
  );
  try {
    await db.query(`SELECT unseal_with_credit('${drop}','receive',2,'{}')`);
  } finally {
    await db.exec("RESET ROLE");
  }
  const state = (
    await db.query<{
      s: { total: number; milestones: { name: string | null; unlocked_at: string | null }[] };
    }>(`SELECT collective_state('wifaura') s`)
  ).rows[0]!.s;
  expect(state.total).toBe(100);
  expect(state.milestones[0]!.name).toBe("The Lantern Lattice");
  expect(state.milestones[0]!.unlocked_at).not.toBeNull();
  expect(state.milestones[1]!.name).toBeNull();
});
