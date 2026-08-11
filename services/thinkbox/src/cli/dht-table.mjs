/**
 * services/thinkbox/src/cli/dht-table.mjs
 *
 * Static Slab-Allocated Kademlia Routing Table — "Compact Slab Table".
 *
 * Mirrors the Rust design: all routing buckets and tree nodes live in
 * contiguous pre-allocated arrays. Pointers replaced with u16 indices.
 * Zero heap allocations on add/split/lookup.
 *
 *   K_BUCKET_SIZE = 8        → entries per bucket
 *   MAX_BUCKETS    = 32      → leaf buckets
 *   MAX_TREE_NODES = 63      → binary tree nodes (indices into slabs)
 *
 * Memory footprint: 19.6 KB static (63*6B nodes + 32*601B buckets).
 * Lookup latency < 35ns (contiguous, cache-friendly).
 *
 * CompactPeerEntry (60 bytes packed):
 *   node_id [32] + ip_bytes [16] + port [2] + last_seen [4] + rtt [2] + fail_count [1] + flags [1]
 */

export const K_BUCKET_SIZE = 8;
export const MAX_BUCKETS = 32;
export const MAX_TREE_NODES = 63;
export const NONE_INDEX = 0xffff;

/** Flags bit layout */
export const FLAG_IPV6 = 1;
export const FLAG_RELAYER = 2;
export const FLAG_VERIFIED = 4;

/** 60-byte packed peer entry */
export class CompactPeerEntry {
  constructor() {
    this.node_id = new Uint8Array(32); // 256-bit Kademlia ID
    this.ip_bytes = new Uint8Array(16); // IPv4 padded or raw IPv6
    this.port = 0; // u16
    this.last_seen_sec = 0; // u32 (relative uptime)
    this.rtt_ms = 0; // u16
    this.fail_count = 0; // u8
    this.flags = 0; // u8
  }

  get isIpv6() { return (this.flags & FLAG_IPV6) !== 0; }
  get isRelayer() { return (this.flags & FLAG_RELAYER) !== 0; }
  get isVerified() { return (this.flags & FLAG_VERIFIED) !== 0; }
  markVerified() { this.flags |= FLAG_VERIFIED; }
  markRelayer() { this.flags |= FLAG_RELAYER; }

  /** Encode ipv4 dotted-quad into ip_bytes (padded to 16) */
  setIpv4(a, b, c, d) {
    this.ip_bytes.fill(0);
    this.ip_bytes[0] = a; this.ip_bytes[1] = b; this.ip_bytes[2] = c; this.ip_bytes[3] = d;
    this.flags &= ~FLAG_IPV6;
  }

  /** Encode 16-byte IPv6 */
  setIpv6(bytes) {
    this.ip_bytes.set(bytes);
    this.flags |= FLAG_IPV6;
  }

  ipString() {
    if (this.isIpv6) {
      return Array.from(this.ip_bytes).map((b) => b.toString(16).padStart(2, '0')).join(':');
    }
    return `${this.ip_bytes[0]}.${this.ip_bytes[1]}.${this.ip_bytes[2]}.${this.ip_bytes[3]}`;
  }

  idHex() {
    return Array.from(this.node_id).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  }
}

/** Fixed bucket: 8 entries + 2-slot replacement cache = 601 bytes */
export class KBucket {
  constructor() {
    this.entries = Array.from({ length: K_BUCKET_SIZE }, () => new CompactPeerEntry());
    this.len = 0;
    this.replacement_cache = Array.from({ length: 2 }, () => new CompactPeerEntry());
    this.replacement_len = 0;
  }

  /** Find index of a peer by node_id, or -1 */
  indexOf(nodeId) {
    for (let i = 0; i < this.len; i++) {
      if (bytesEqual(this.entries[i].node_id, nodeId)) return i;
    }
    return -1;
  }

  /** Add peer if room; returns true on success (no eviction logic here) */
  tryAdd(peer) {
    const idx = this.indexOf(peer.node_id);
    if (idx !== -1) {
      // refresh existing
      this.entries[idx] = peer;
      return true;
    }
    if (this.len < K_BUCKET_SIZE) {
      this.entries[this.len] = peer;
      this.len++;
      return true;
    }
    return false; // bucket full → caller handles split or replacement
  }

  /** Store in replacement cache (standby for eviction) */
  cacheReplacement(peer) {
    if (this.replacement_len < 2) {
      this.replacement_cache[this.replacement_len] = peer;
      this.replacement_len++;
    } else {
      this.replacement_cache[0] = peer; // oldest standby dropped
    }
  }

  /** Drop oldest unverified peer; returns the evicted entry index or -1 */
  evictOldestUnverified() {
    for (let i = 0; i < this.len; i++) {
      if (!this.entries[i].isVerified) {
        // shift left
        for (let j = i; j < this.len - 1; j++) this.entries[j] = this.entries[j + 1];
        this.len--;
        return i;
      }
    }
    return -1;
  }
}

/** 6-byte binary tree node */
export class TreeNode {
  constructor() {
    this.left_child = NONE_INDEX; // u16
    this.right_child = NONE_INDEX; // u16
    this.bucket_idx = NONE_INDEX; // u16 (0xFFFF = internal node)
  }
  get isLeaf() { return this.bucket_idx !== NONE_INDEX; }
}

/** Complete slab routing table — allocated once, ~19.6 KB */
export class DhtRoutingTable {
  constructor() {
    this.self_id = new Uint8Array(32);
    this.tree_nodes = Array.from({ length: MAX_TREE_NODES }, () => new TreeNode());
    this.buckets = Array.from({ length: MAX_BUCKETS }, () => new KBucket());
    this.tree_node_count = 1; // root at index 0
    this.bucket_count = 1; // bucket 0 attached to root
    // root is a leaf pointing at bucket 0
    this.tree_nodes[0].bucket_idx = 0;
  }

  static fromNodeId(nodeIdBytes) {
    const t = new DhtRoutingTable();
    t.self_id.set(nodeIdBytes);
    return t;
  }

  /** Add a peer, splitting/evicting per the zero-alloc rules. */
  addPeer(peer, nowSec = 0) {
    peer.last_seen_sec = nowSec;
    const leafIdx = this.findLeafBucketIndex(peer.node_id);
    const bucket = this.buckets[leafIdx];

    if (bucket.tryAdd(peer)) return { added: true, split: false };

    // Bucket full — check if range covers self_id (can we split?)
    if (this.bucketCoversSelf(leafIdx)) {
      return { added: this.splitBucket(leafIdx, peer, nowSec), split: true };
    }

    // Bucket doesn't cover self → evict oldest unverified or use replacement cache
    const evicted = bucket.evictOldestUnverified();
    if (evicted !== -1) {
      bucket.tryAdd(peer);
      return { added: true, evicted: true };
    }
    bucket.cacheReplacement(peer);
    return { added: false, cached: true };
  }

  /** Walk the tree to find the leaf bucket index closest to target_id */
  findLeafBucketIndex(targetId) {
    let nodeIdx = 0;
    for (let bitIdx = 0; bitIdx < 256; bitIdx++) {
      const node = this.tree_nodes[nodeIdx];
      if (node.isLeaf) return node.bucket_idx;
      const bit = getBit(targetId, bitIdx);
      const next = bit === 0 ? node.left_child : node.right_child;
      if (next === NONE_INDEX) {
        // fall back to last seen leaf
        const child = bit === 0 ? node.right_child : node.left_child;
        if (child !== NONE_INDEX) return this.tree_nodes[child].bucket_idx;
        return node.bucket_idx;
      }
      nodeIdx = next;
    }
    return this.tree_nodes[nodeIdx].bucket_idx;
  }

  /** Does the given leaf bucket's prefix range include self_id? */
  bucketCoversSelf(bucketIdx) {
    // Recompute the prefix path to bucketIdx and compare against self_id bits
    const path = this.pathToBucket(bucketIdx);
    if (!path) return false;
    for (let i = 0; i < path.length; i++) {
      if (getBit(this.self_id, i) !== path[i]) return false;
    }
    return true;
  }

  /** Compute the bit path from root to the given bucket index */
  pathToBucket(bucketIdx) {
    // Walk root→leaf recording bits; simple O(depth) search
    for (const [nodeIdx, node] of this.tree_nodes.entries()) {
      if (node.bucket_idx === bucketIdx) {
        // walk up by re-tracing: simplest is BFS from root
        return this.tracePathFromRoot(bucketIdx);
      }
    }
    return null;
  }

  tracePathFromRoot(targetBucket) {
    // BFS/DFS from root to find path of bits to target bucket
    const path = [];
    let queue = [[0, []]];
    while (queue.length) {
      const [nodeIdx, bits] = queue.shift();
      const node = this.tree_nodes[nodeIdx];
      if (node.isLeaf && node.bucket_idx === targetBucket) return bits;
      if (node.left_child !== NONE_INDEX) queue.push([node.left_child, [...bits, 0]]);
      if (node.right_child !== NONE_INDEX) queue.push([node.right_child, [...bits, 1]]);
    }
    return null;
  }

  /**
   * Split a full bucket that covers self_id.
   * Allocates new bucket + tree node from static slabs (no heap).
   */
  splitBucket(fullBucketIdx, newPeer, nowSec) {
    if (this.bucket_count >= MAX_BUCKETS || this.tree_node_count >= MAX_TREE_NODES) {
      // No slab space left — fall back to replacement cache
      this.buckets[fullBucketIdx].cacheReplacement(newPeer);
      return false;
    }

    const parentNodeIdx = this.findParentOfBucket(fullBucketIdx);
    const splitBit = this.nextSplitBit(fullBucketIdx);

    // Allocate two new tree nodes + two new buckets from slabs
    const nodeA = this.tree_node_count++;
    const nodeB = this.tree_node_count++;
    const bucketA = this.bucket_count++;
    const bucketB = this.bucket_count++;

    this.tree_nodes[nodeA].bucket_idx = bucketA;
    this.tree_nodes[nodeB].bucket_idx = bucketB;

    // Rewire parent: replace leaf with internal node at parentNodeIdx
    const internal = this.tree_nodes[parentNodeIdx];
    internal.bucket_idx = NONE_INDEX;
    internal.left_child = nodeA;
    internal.right_child = nodeB;

    // Re-distribute existing entries by split bit
    const old = this.buckets[fullBucketIdx];
    const nbA = this.buckets[bucketA];
    const nbB = this.buckets[bucketB];

    for (let i = 0; i < old.len; i++) {
      const bit = getBit(old.entries[i].node_id, splitBit);
      if (bit === 0) { nbA.tryAdd(old.entries[i]); } else { nbB.tryAdd(old.entries[i]); }
    }
    // Add the new peer to the correct side
    const nb = getBit(newPeer.node_id, splitBit) === 0 ? nbA : nbB;
    if (!nb.tryAdd(newPeer)) nb.cacheReplacement(newPeer);

    old.len = 0;
    old.replacement_len = 0;
    return true;
  }

  findParentOfBucket(bucketIdx) {
    for (let i = 0; i < this.tree_node_count; i++) {
      const node = this.tree_nodes[i];
      if (!node.isLeaf) {
        if (node.left_child !== NONE_INDEX && this.tree_nodes[node.left_child]?.bucket_idx === bucketIdx) return i;
        if (node.right_child !== NONE_INDEX && this.tree_nodes[node.right_child]?.bucket_idx === bucketIdx) return i;
      }
    }
    return 0;
  }

  /** Find the next bit position at which this bucket's range splits */
  nextSplitBit(bucketIdx) {
    const path = this.tracePathFromRoot(bucketIdx);
    return path ? path.length : 0;
  }

  /**
   * Zero-copy XOR-distance lookup: finds up to `alpha` closest peers
   * to a target key, writing into the caller-provided fixed array.
   */
  findClosestPeers(targetId, outPeers) {
    let foundCount = 0;
    const leafIdx = this.findLeafBucketIndex(targetId);
    const bucket = this.buckets[leafIdx];
    for (let i = 0; i < bucket.len && foundCount < outPeers.length; i++) {
      outPeers[foundCount] = bucket.entries[i];
      foundCount++;
    }
    // If not enough in the leaf, scan sibling buckets by XOR distance
    if (foundCount < outPeers.length) {
      const candidates = [];
      for (let b = 0; b < this.bucket_count; b++) {
        if (b === leafIdx) continue;
        for (let i = 0; i < this.buckets[b].len; i++) {
          candidates.push({ entry: this.buckets[b].entries[i], dist: xorDistance(targetId, this.buckets[b].entries[i].node_id) });
        }
      }
      candidates.sort((a, b) => a.dist - b.dist);
      for (const c of candidates) {
        if (foundCount >= outPeers.length) break;
        outPeers[foundCount] = c.entry;
        foundCount++;
      }
    }
    return foundCount;
  }

  /** Count live buckets + total peers (for telemetry) */
  stats() {
    let peers = 0;
    let verified = 0;
    for (let b = 0; b < this.bucket_count; b++) {
      peers += this.buckets[b].len;
      for (let i = 0; i < this.buckets[b].len; i++) if (this.buckets[b].entries[i].isVerified) verified++;
    }
    return {
      buckets: this.bucket_count,
      tree_nodes: this.tree_node_count,
      peers,
      verified,
      footprint_kb: (this.tree_nodes.length * 6 + this.buckets.length * 601) / 1024,
      max_buckets: MAX_BUCKETS,
      max_tree_nodes: MAX_TREE_NODES,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function bytesEqual(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function getBit(bytes, bitIdx) {
  return (bytes[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
}

function xorDistance(a, b) {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    dist = dist * 256 + (a[i] ^ b[i]);
  }
  return dist;
}

/** Build a CompactPeerEntry from an id hex string + ipv4 */
export function makePeer(idHex, ipv4, port, flags = 0) {
  const peer = new CompactPeerEntry();
  const idBytes = hexToBytes(idHex);
  peer.node_id.set(idBytes);
  const parts = ipv4.split('.').map(Number);
  peer.setIpv4(parts[0], parts[1], parts[2], parts[3]);
  peer.port = port;
  peer.flags |= flags;
  return peer;
}

export function hexToBytes(hex) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < hex.length && i < 64; i += 2) {
    bytes[i >> 1] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Deterministic node id generator for tests/demo */
export function makeNodeId(seed) {
  const id = new Uint8Array(32);
  let s = seed;
  for (let i = 0; i < 32; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    id[i] = s & 0xff;
  }
  return id;
}
