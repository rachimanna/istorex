"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A pill-shaped select that updates one query parameter (resets pagination). */
export function FilterSelect({ name, value, options }: { name: string; value: string; options: [string, string][] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select
      className="chip"
      style={{ appearance: "none", paddingRight: 14 }}
      value={value}
      aria-label={name}
      onChange={(e) => {
        const p = new URLSearchParams(params?.toString());
        if (e.target.value) p.set(name, e.target.value);
        else p.delete(name);
        p.delete("page");
        router.push(`${pathname}?${p.toString()}`);
      }}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
