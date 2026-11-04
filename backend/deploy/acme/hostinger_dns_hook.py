#!/usr/bin/env python3
"""certbot --manual DNS-01 hook for domains whose DNS is hosted at Hostinger.

    certbot certonly --manual --preferred-challenges dns \
      --manual-auth-hook "/acme/hostinger_dns_hook.py auth" \
      --manual-cleanup-hook "/acme/hostinger_dns_hook.py cleanup" -d api.example.com

Environment:
  HOSTINGER_API_TOKEN   Hostinger API token of the account that owns the domain (never logged)
  HOSTINGER_DNS_ZONE    the zone, e.g. example.com (defaults to the last two labels of CERTBOT_DOMAIN)
  CERTBOT_DOMAIN, CERTBOT_VALIDATION   set by certbot

`auth` writes `_acme-challenge.<host>` TXT = CERTBOT_VALIDATION, then waits until public resolvers return it;
`cleanup` deletes that TXT record. Only the challenge record is ever touched (overwrite is scoped to name+type).
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://developers.hostinger.com/api/dns/v1/zones/"
PROPAGATION_TIMEOUT_S = 600
POLL_INTERVAL_S = 15


def fail(message: str) -> "None":
    print(f"hostinger-dns-hook: {message}", file=sys.stderr)
    sys.exit(1)


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        fail(f"{name} is not set")
    return value


def zone_and_name(domain: str) -> "tuple[str, str]":
    zone = os.environ.get("HOSTINGER_DNS_ZONE", "").strip().rstrip(".") or ".".join(domain.split(".")[-2:])
    if domain != zone and not domain.endswith("." + zone):
        fail(f"{domain} is not inside zone {zone}")
    host = domain[: -len(zone)].rstrip(".")
    return zone, f"_acme-challenge.{host}" if host else "_acme-challenge"


def call(method: str, zone: str, body: dict) -> None:
    request = urllib.request.Request(
        API + urllib.parse.quote(zone),
        data=json.dumps(body).encode(),
        method=method,
        headers={
            "Authorization": f"Bearer {env('HOSTINGER_API_TOKEN')}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "remi-certbot-hook",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:300]
        fail(f"Hostinger API {method} {zone} -> HTTP {error.code}: {detail}")
    except urllib.error.URLError as error:
        fail(f"Hostinger API unreachable: {error.reason}")


def public_txt(fqdn: str) -> "set[str]":
    """TXT values that BOTH public resolvers (Google and Cloudflare DNS-over-HTTPS) return."""
    seen: "list[set[str]]" = []
    for resolver in ("https://dns.google/resolve", "https://cloudflare-dns.com/dns-query"):
        url = f"{resolver}?name={urllib.parse.quote(fqdn)}&type=TXT"
        request = urllib.request.Request(url, headers={"Accept": "application/dns-json"})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                answers = json.load(response).get("Answer", [])
        except (urllib.error.URLError, ValueError):
            return set()
        seen.append({a.get("data", "").strip('"') for a in answers if a.get("type") == 16})
    return set.intersection(*seen)


def auth() -> None:
    domain, token = env("CERTBOT_DOMAIN"), env("CERTBOT_VALIDATION")
    zone, name = zone_and_name(domain)
    call("PUT", zone, {"overwrite": True, "zone": [{"name": name, "type": "TXT", "ttl": 60, "records": [{"content": token}]}]})
    fqdn = f"{name}.{zone}"
    print(f"hostinger-dns-hook: set TXT {fqdn}; waiting for public DNS")
    deadline = time.monotonic() + PROPAGATION_TIMEOUT_S
    while time.monotonic() < deadline:
        if token in public_txt(fqdn):
            time.sleep(20)  # let the remaining authoritative servers catch up
            print(f"hostinger-dns-hook: TXT {fqdn} is visible")
            return
        time.sleep(POLL_INTERVAL_S)
    fail(f"TXT {fqdn} did not become visible within {PROPAGATION_TIMEOUT_S}s")


def cleanup() -> None:
    zone, name = zone_and_name(env("CERTBOT_DOMAIN"))
    call("DELETE", zone, {"filters": [{"name": name, "type": "TXT"}]})
    print(f"hostinger-dns-hook: removed TXT {name}.{zone}")


if __name__ == "__main__":
    actions = {"auth": auth, "cleanup": cleanup}
    if len(sys.argv) != 2 or sys.argv[1] not in actions:
        fail("usage: hostinger_dns_hook.py auth|cleanup")
    actions[sys.argv[1]]()
