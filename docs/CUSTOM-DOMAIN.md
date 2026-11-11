# WIFAURA subdomain with Squarespace DNS

Target: `https://wifaura.sha-i.com`.

Keep the domain registered at Squarespace and keep its current nameservers.
No other subdomain, root website or email record needs to change.

WIFAURA now builds for Cloudflare Pages (`cloudflare_pages` Nitro preset),
which supports custom subdomains using external DNS. The old Worker remains
available as a fallback; it is not the CNAME target.

After the Pages project is deployed and its custom domain is associated,
add this one record in Squarespace's DNS settings for `sha-i.com`:

| Field | Value |
| --- | --- |
| Type | CNAME |
| Host / Name | `wifaura` |
| Data / Target | `wifaura.pages.dev` |
| TTL | Default |

If a `wifaura` record already exists, review it before changing it. Do not
delete other records. Cloudflare's pending onboarding for the parent domain
does not activate unless its nameservers are selected at the registrar;
leave that whole-domain setup unused.

Cloudflare verifies the CNAME and issues HTTPS for the custom hostname.
Only after it is active should Supabase Site URL and allowed redirects,
Google's authorized JavaScript origin and WIFAURA's configured origin switch
to `https://wifaura.sha-i.com`. Google's callback URI stays
`https://bvnjosopyjblugshdbwd.supabase.co/auth/v1/callback`.

Sources: [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
and [Nitro Cloudflare Pages](https://nitro.build/deploy/providers/cloudflare).
