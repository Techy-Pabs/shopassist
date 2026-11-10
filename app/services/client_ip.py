"""The visitor's IP address, for rate limits. Never stored in the database.

On Render, a request reaches the API through Cloudflare and then Render's
load balancer, so the connection itself always comes from Render's proxy on
its private network. The visitor's address arrives in headers:

- X-Forwarded-For can't be trusted. Cloudflare and Render's proxy add to the
  list a client sends instead of replacing it, so the leftmost entry is
  whatever the client wrote. (This is why Uvicorn's own proxy support, which
  only reads X-Forwarded-For, is turned off in scripts/start.sh.)
- CF-Connecting-IP can be trusted. Cloudflare sets it on every request to a
  Render web service and overwrites any value the client sent.

So CF-Connecting-IP is used only when the connection comes from a network
in TRUSTED_PROXY_NETWORKS (Render's proxy). Any other connection, such as a
local one or one in a test, is identified by its own address, and a
CF-Connecting-IP header on it is ignored.
"""
import logging
from ipaddress import ip_address

from fastapi import Request

from app.core.config import settings

logger = logging.getLogger(__name__)

FORWARDED_HEADER = "cf-connecting-ip"

_warned_missing_header = False


def _is_trusted_proxy(host: str | None) -> bool:
    try:
        address = ip_address(host or "")
    except ValueError:
        return False
    return any(address in network for network in settings.trusted_proxy_network_list)


def client_ip(request: Request) -> str:
    global _warned_missing_header
    peer = request.client.host if request.client else "unknown"
    if not _is_trusted_proxy(peer):
        return peer
    forwarded = request.headers.get(FORWARDED_HEADER, "").strip()
    try:
        return str(ip_address(forwarded))
    except ValueError:
        if not _warned_missing_header:
            # On Render every request should carry it; without it, every
            # visitor would share the proxy's address and one rate limit
            logger.warning(
                "A request from %s (in TRUSTED_PROXY_NETWORKS) had no valid CF-Connecting-IP header, so the guest "
                "creation limit uses that address. Expected when running locally; on Render, check the setting.",
                peer,
            )
            _warned_missing_header = True
        return peer
