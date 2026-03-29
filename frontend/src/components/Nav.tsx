"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/orb", label: "ORB Strategy" },
  { href: "/simulator", label: "Challenge Simulator" },
  { href: "/practice", label: "Practice Arena" },
];

export default function Nav() {
  const pathname = usePathname();

  if (pathname === "/") return null;

  return (
    <nav
      className="flex items-center gap-1 border-b px-4 py-2"
      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
    >
      <Link
        href="/"
        className="mr-4 text-sm font-bold tracking-tight text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        ORB
      </Link>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded px-3 py-1 text-sm transition-colors ${
            pathname === link.href
              ? "bg-indigo-600/20 text-indigo-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
