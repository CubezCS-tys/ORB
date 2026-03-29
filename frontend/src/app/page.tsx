import Link from "next/link";

const pages = [
  {
    href: "/orb",
    title: "ORB Strategy",
    description: "Visualize Opening Range Breakout levels on random or real MNQ data. Run the breakout strategy with configurable contracts and account sizing.",
    status: "Live",
    color: "indigo",
  },
  {
    href: "/simulator",
    title: "Challenge Simulator",
    description: "Monte Carlo simulation of prop firm challenge phases. Model the challenge fee as an option premium and estimate pass rates.",
    status: "Live",
    color: "amber",
  },
  {
    href: "/practice",
    title: "Practice Arena",
    description: "Trade a random day with live-animated candles. Practice discretionary trading with real market data and track your P&L.",
    status: "Live",
    color: "indigo",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          ORB <span className="text-indigo-500">Lab</span>
        </h1>
        <p className="mt-2 text-zinc-500">
          Opening Range Breakout tools for MNQ futures
        </p>
      </div>

      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        {pages.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="group rounded-xl border p-6 transition-colors hover:border-indigo-500/50"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold group-hover:text-indigo-400 transition-colors">
                {page.title}
              </h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  page.status === "Live"
                    ? "bg-green-500/10 text-green-500"
                    : "bg-amber-500/10 text-amber-500"
                }`}
              >
                {page.status}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-zinc-500">
              {page.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
