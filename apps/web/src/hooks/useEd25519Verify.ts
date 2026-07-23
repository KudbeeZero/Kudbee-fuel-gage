import { useState, useCallback, useRef } from 'react';
import * as ed from '@noble/ed25519';

interface VerifyState {
  verifying: string | null;
  proven: Set<string>;
  failed: Set<string>;
}

export function useEd25519Verify() {
  const [state, setState] = useState<VerifyState>({
    verifying: null,
    proven: new Set(),
    failed: new Set()
  });
  const _mountedRef = useRef(true);

  const verifySignature = useCallback(
    async (
      id: string,
      publicKeyHex: string,
      payload: string,
      signatureHex: string
    ): Promise<boolean> => {
      setState((prev) => ({ ...prev, verifying: id }));

      try {
        const pubKey = hexToBytes(publicKeyHex);
        const sig = hexToBytes(signatureHex);
        const msg = new TextEncoder().encode(payload);

        const isValid = await ed.verifyAsync(sig, msg, pubKey);

        if (!_mountedRef.current) return false;

        setState((prev) => {
          const nextProven = new Set(prev.proven);
          const nextFailed = new Set(prev.failed);
          if (isValid) {
            nextProven.add(id);
            nextFailed.delete(id);
          } else {
            nextFailed.add(id);
            nextProven.delete(id);
          }
          return { verifying: null, proven: nextProven, failed: nextFailed };
        });

        return isValid;
      } catch {
        if (!_mountedRef.current) return false;
        setState((prev) => {
          const nextFailed = new Set(prev.failed);
          const nextProven = new Set(prev.proven);
          nextFailed.add(id);
          nextProven.delete(id);
          return { verifying: null, proven: nextProven, failed: nextFailed };
        });
        return false;
      }
    },
    []
  );

  const isProven = useCallback((id: string) => state.proven.has(id), [state.proven]);
  const isFailed = useCallback((id: string) => state.failed.has(id), [state.failed]);

  return {
    verifying: state.verifying,
    isProven,
    isFailed,
    verifySignature,
    _mountedRef
  };
}

function hexToBytes(hex: string): Uint8Array {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(stripped.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
