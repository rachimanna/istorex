"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/shared/client";

export function FavoriteButton({ appId, initial, signedIn }: { appId: string; initial: boolean; signedIn: boolean }) {
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button
      className="btn"
      aria-pressed={fav}
      aria-label={fav ? "Убрать из избранного" : "В избранное"}
      disabled={busy}
      onClick={async () => {
        if (!signedIn) return router.push("/login?next=" + encodeURIComponent(location.pathname));
        setBusy(true);
        try {
          await apiFetch(`/api/favorites/${appId}`, { method: fav ? "DELETE" : "POST" });
          setFav(!fav);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fav ? "♥" : "♡"}
    </button>
  );
}
