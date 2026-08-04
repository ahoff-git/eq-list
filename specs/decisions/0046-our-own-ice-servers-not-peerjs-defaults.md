# 0046: We name our own ICE servers, because PeerJS's defaults are not ours to trust

## Status

Accepted

## Context

Every WebRTC connection needs ICE servers — STUN to discover how the peer looks from outside
its NAT, TURN to relay when the two peers can't reach each other directly. Until now we passed
none, so PeerJS's built-in list applied: Google's STUN plus PeerJS's own public cloud TURN
(`eu-0.turn.peerjs.com` and siblings).

`@awari/transport-peerjs` documents that default as the thing to override, and is specific
about why: those TURN hosts are flaky and, in Electron or restricted-DNS runtimes, fail to even
resolve — `net::ERR_NAME_NOT_RESOLVED` in the WebRTC log. We ship Electron. Checking the host
now, `eu-0.turn.peerjs.com` resolves to a Comcast residential prefix with an EUI-64 suffix,
which does not look like managed relay infrastructure.

That default is also simply not a dependency we chose. It's third-party infrastructure, free and
unannounced, that can change or vanish without it being anybody's fault — and when it does, the
symptom reaching us is "peer sharing doesn't work", one layer below anything
[ADR 0028](./0028-peer-networking-verified-and-repaired.md) could see.

The constraint that shapes the answer: `config.iceServers` **replaces** PeerJS's list rather
than merging into it. Any override has to be self-sufficient, which makes "just add Google STUN"
a decision about TURN whether or not we meant it to be.

## Decision

**We pass an explicit ICE list, built from awari's shipped presets** (`ICE_SERVERS`), not from
URLs copied into this repo — their upkeep stays theirs.

**The list is `google` + `open-relay`: Google's STUN, and Open Relay's TURN.** STUN alone
covers same-machine, LAN, and non-symmetric-NAT peers; peers behind symmetric NAT need a relay.
Since replacing the list drops PeerJS's TURN, a STUN-only override would trade "flaky" for
"never connects" for exactly those players. Open Relay keeps a relay path.

**The choice is one constant.** `ICE_PROVIDERS` in `src/lib/awari/net.ts` is a list of preset
keys; an empty list means we pass no `peerOptions` at all and PeerJS's defaults apply again.
Reverting is editing one array, not unpicking a design.

## Consequences

The `ERR_NAME_NOT_RESOLVED` class of failure goes away, and connectivity no longer depends on
infrastructure we never named.

**Open Relay is better-than-nothing, not solved.** It's a free community TURN on shared public
credentials — rate-limited, best-effort, and flagged by awari as not production-grade. We have
swapped an unreliable relay we didn't choose for an unreliable relay we did, which is an
improvement in that we now know it's there and it currently resolves. The real fix is our own
TURN via awari's `selfHostedTurn({...})`; the shape of that swap is this same constant plus
credentials, deliberately.

**Nothing here is covered by a test, and can't be.** ICE only means anything against real
WebRTC between two real peers, which the unit suite has no way to provide — the same limit
[ADR 0028](./0028-peer-networking-verified-and-repaired.md) records for the rest of peer
networking. Typecheck, lint, and the 369-test suite pass, which establishes only that the
option reaches the transport in the right shape. Whether symmetric-NAT peers now connect wants
the two-client manual run ADR 0028 describes, and has not been done.

The debug line naming the providers in use is deliberate: when peer sharing next fails, which
ICE list was live is the first thing worth knowing and the hardest to reconstruct afterwards.
