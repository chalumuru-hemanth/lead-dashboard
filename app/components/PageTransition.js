"use client";

import { usePathname } from "next/navigation";

// Lightweight route-change animation: remounting a keyed wrapper on every
// pathname change re-triggers the CSS "route-fade" keyframe (fade + rise),
// giving page navigation a smooth, app-like feel without extra dependencies.
export default function PageTransition({ children }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="route-fade">
      {children}
    </div>
  );
}
