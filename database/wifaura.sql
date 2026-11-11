-- WIFAURA ONLY. Apply after inherited migrations, to a NEW EMPTY backend.
-- Never run this on NIMAURA. This intentionally disables legacy payment functions.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles) OR EXISTS(SELECT 1 FROM public.manifestations)
 OR EXISTS(SELECT 1 FROM public.collective_contributions) THEN
 RAISE EXCEPTION 'WIFAURA bootstrap requires an empty new backend. Never apply to NIMAURA or a copied live database.';
 END IF;
END $$;
CREATE TABLE public.wif_wallet_challenges (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users, address text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('payer','reserve')), message text NOT NULL,
 expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE public.wif_wallet_links (
 user_id uuid NOT NULL REFERENCES auth.users, purpose text NOT NULL CHECK(purpose IN ('payer','reserve')),
 address text NOT NULL CHECK(address ~ '^0x[0-9a-fA-F]{40}$'), PRIMARY KEY(user_id,purpose)
);
CREATE UNIQUE INDEX wif_payer_unique ON public.wif_wallet_links(lower(address)) WHERE purpose='payer';
CREATE TABLE public.wif_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users,
 drop_id uuid NOT NULL REFERENCES public.daily_drops, intention text NOT NULL,
 seed bigint NOT NULL, config jsonb NOT NULL, quote_key text NOT NULL UNIQUE,
 sender text NOT NULL, reserve text NOT NULL, router text NOT NULL, treasury text NOT NULL,
 amount text NOT NULL CHECK(amount ~ '^[1-9][0-9]*$' AND amount::numeric % 2 = 0),
 decimals int NOT NULL CHECK(decimals BETWEEN 0 AND 255), start_block text NOT NULL,
 usd_price text NOT NULL DEFAULT '1.00' CHECK(usd_price='1.00'),
 wif_usd_rate text NOT NULL CHECK(wif_usd_rate ~ '^[0-9]+(\.[0-9]+)?$' AND wif_usd_rate::numeric>0),
 rate_source text NOT NULL, rate_observed_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'quoted' CHECK(status IN ('quoted','pending','fulfilled','expired')),
 tx_hash text UNIQUE, verified_block text, verified_block_hash text, verified_at timestamptz,
 manifestation_id uuid UNIQUE REFERENCES public.manifestations
);
CREATE UNIQUE INDEX wif_one_pending ON public.wif_quotes(user_id) WHERE status='pending';
ALTER TABLE public.wif_wallet_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wif_wallet_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wif_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wif_wallet_challenges, public.wif_wallet_links, public.wif_quotes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wif_wallet_challenges, public.wif_wallet_links, public.wif_quotes TO service_role;

CREATE FUNCTION public.wif_consume_challenge(_id uuid,_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c wif_wallet_challenges;
BEGIN
 SELECT * INTO c FROM wif_wallet_challenges WHERE id=_id AND user_id=_user FOR UPDATE;
 IF NOT FOUND OR c.consumed_at IS NOT NULL OR c.expires_at<=now() THEN RAISE EXCEPTION 'Challenge unavailable'; END IF;
 INSERT INTO wif_wallet_links VALUES(c.user_id,c.purpose,c.address)
 ON CONFLICT(user_id,purpose) DO UPDATE SET address=excluded.address;
 UPDATE wif_wallet_challenges SET consumed_at=now() WHERE id=_id;
END $$;

CREATE FUNCTION public.wif_create_quote(_user uuid,_drop uuid,_intention text,_seed bigint,_config jsonb,
 _router text,_treasury text,_amount text,_decimals int,_key text,_start_block text,
 _rate text,_rate_source text,_rate_observed_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE q wif_quotes; d daily_drops; payer text; reserve_wallet text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('wif:quote:'||_user));
 SELECT * INTO q FROM wif_quotes WHERE user_id=_user AND (status='pending' OR (status='quoted' AND expires_at>now())) ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN
  IF q.drop_id<>_drop OR q.intention<>_intention THEN RAISE EXCEPTION 'Resolve the existing purchase first'; END IF;
  RETURN to_jsonb(q);
 END IF;
 SELECT * INTO d FROM daily_drops WHERE id=_drop AND starts_at<=now() AND ends_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Drop is closed'; END IF;
 IF _intention NOT IN ('become','release','receive','remember') THEN RAISE EXCEPTION 'Invalid intention'; END IF;
 IF _rate_observed_at < now()-interval '60 seconds' OR _rate_observed_at > now()+interval '5 seconds' THEN RAISE EXCEPTION 'Fresh live WIF price required'; END IF;
 SELECT address INTO payer FROM wif_wallet_links WHERE user_id=_user AND purpose='payer';
 SELECT address INTO reserve_wallet FROM wif_wallet_links WHERE user_id=_user AND purpose='reserve';
 IF payer IS NULL OR reserve_wallet IS NULL OR lower(reserve_wallet)=lower(_treasury) OR lower(payer)=lower(_treasury) OR lower(payer)=lower(reserve_wallet) THEN RAISE EXCEPTION 'Verify payer and a separate Reserve wallet first'; END IF;
 INSERT INTO wif_quotes(user_id,drop_id,intention,seed,config,quote_key,sender,reserve,router,treasury,amount,decimals,expires_at,start_block,wif_usd_rate,rate_source,rate_observed_at)
 VALUES(_user,_drop,_intention,_seed,_config,
 '0x'||lpad(to_hex(floor(extract(epoch from least(now()+interval '2 minutes',_rate_observed_at+interval '2 minutes',d.ends_at)))::bigint),16,'0')||substr(_key,19),
 payer,reserve_wallet,_router,_treasury,_amount,_decimals,
 least(now()+interval '2 minutes',_rate_observed_at+interval '2 minutes',d.ends_at),_start_block,_rate,_rate_source,_rate_observed_at) RETURNING * INTO q;
 RETURN to_jsonb(q);
END $$;

-- One database per product. Replace the inherited count function so free credits
-- also contribute to WIFAURA, while preserving the privacy-safe public projection.
CREATE OR REPLACE FUNCTION public.collective_count(_manifestation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m record; total int;
BEGIN
 SELECT id,user_id,drop_id INTO m FROM manifestations WHERE id=_manifestation;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM credit_redemptions WHERE manifestation_id=m.id)
 AND NOT EXISTS(SELECT 1 FROM wif_quotes WHERE manifestation_id=m.id AND status='fulfilled' AND verified_at IS NOT NULL AND tx_hash IS NOT NULL)
 THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('collective:wifaura'));
 INSERT INTO collective_contributions(deployment,manifestation_id,user_id,drop_id)
 VALUES('wifaura',m.id,m.user_id,m.drop_id) ON CONFLICT DO NOTHING;
 SELECT count(*) INTO total FROM collective_contributions WHERE deployment='wifaura';
 UPDATE collective_milestones SET unlocked_at=now() WHERE deployment='wifaura' AND unlocked_at IS NULL AND threshold<=total;
END $$;
INSERT INTO collective_milestones(deployment,ordinal,threshold,name,designation,symbolism,reflection,veiled_hint)
SELECT 'wifaura',ordinal,threshold,name,designation,symbolism,reflection,veiled_hint
FROM collective_milestones WHERE deployment='nimiq';

CREATE FUNCTION public.wif_fulfill(_id uuid,_user uuid,_hash text,_block text,_block_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE q wif_quotes; entity uuid; manifestation uuid;
BEGIN
 SELECT * INTO q FROM wif_quotes WHERE id=_id AND user_id=_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found'; END IF;
 IF _hash !~ '^0x[0-9a-f]{64}$' OR _block_hash !~ '^0x[0-9a-fA-F]{64}$' OR _block !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid proof'; END IF;
 IF q.status='fulfilled' THEN
  IF q.tx_hash<>_hash THEN RAISE EXCEPTION 'Hash mismatch'; END IF;
  RETURN to_jsonb(q);
 END IF;
 IF q.status<>'pending' THEN RAISE EXCEPTION 'Pending quote required'; END IF;
 SELECT entity_id INTO entity FROM daily_drops WHERE id=q.drop_id;
 INSERT INTO manifestations(user_id,drop_id,entity_id,intention,seed,config,source)
 VALUES(q.user_id,q.drop_id,entity,q.intention,q.seed,q.config,'paid') RETURNING id INTO manifestation;
 UPDATE wif_quotes SET status='fulfilled',tx_hash=_hash,verified_block=_block,verified_block_hash=_block_hash,
 verified_at=now(),manifestation_id=manifestation WHERE id=q.id RETURNING * INTO q;
 PERFORM collective_count(manifestation);
 RETURN to_jsonb(q);
END $$;
REVOKE ALL ON FUNCTION public.wif_consume_challenge(uuid,uuid),
 public.wif_create_quote(uuid,uuid,text,bigint,jsonb,text,text,text,int,text,text,text,text,timestamptz),
 public.wif_fulfill(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wif_consume_challenge(uuid,uuid),
 public.wif_create_quote(uuid,uuid,text,bigint,jsonb,text,text,text,int,text,text,text,text,timestamptz),
 public.wif_fulfill(uuid,uuid,text,text,text) TO service_role;
-- Do not leave inherited simulated/Nimiq fulfillment as an alternate issuance path.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname LIKE '%nimiq%' OR p.proname LIKE '%testnet%'
 OR p.proname LIKE '%mainnet%' OR p.proname='simulate_paid_unseal') LOOP
 EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.collective_count(uuid) TO service_role;
COMMIT;
