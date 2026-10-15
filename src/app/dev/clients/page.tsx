import { notFound } from "next/navigation";
import { ClientsPreview } from "./preview";

export const metadata = { title: "clients states", robots: { index: false } };

/** Dev-only: the Clients page against an in-memory API, with example data. 404 in production. */
export default function DevClientsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ClientsPreview />;
}
