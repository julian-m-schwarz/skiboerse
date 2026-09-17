import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';

/**
 * Whether items may still be flagged as handed in. An admin closes this once
 * the major sellers have delivered; everything still pending from then on
 * counts as never delivered.
 */
export default function useMajorAcceptance() {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/major-acceptance/status/');
      if (res.ok) {
        const data = await res.json();
        setOpen(data.open);
      }
    } catch {
      // Keep the last known state; the server rejects accepting either way.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { open, loading, setOpen, refresh };
}
