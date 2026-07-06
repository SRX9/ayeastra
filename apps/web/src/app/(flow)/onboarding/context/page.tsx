import { redirect } from "next/navigation";

/** Folded into the full-screen wizard — old links and the dashboard guard
 * still point here, so keep the route as a redirect. */
export default function OnboardingContextPage() {
  redirect("/onboarding");
}
