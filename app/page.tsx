import { redirect } from "next/navigation";

export default function Home() {
  // Authenticated users land on the dashboard; the proxy redirects everyone
  // else to /login before this renders.
  redirect("/dashboard");
}
