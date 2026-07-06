/** Flow surfaces (onboarding) own the whole viewport — no OS chrome. */
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
