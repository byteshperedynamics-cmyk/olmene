import { notFound } from "next/navigation";
import { ComponentGallery } from "./gallery";

export const metadata = { title: "v2 components", robots: { index: false } };

/** Dev-only gallery of every v2 component in every state. 404 in production. */
export default function DevComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ComponentGallery />;
}
