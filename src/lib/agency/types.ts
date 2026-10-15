/** Shapes the agency API returns (shared by the Worker routes and the browser). */

import type { SiteProgress } from "@/lib/account/progress";
import type { ReportCadence } from "./rules";
import type { WorkspaceRole } from "@/lib/workspace/roles";
import type { WorkspaceKind } from "@/lib/workspace/types";

/** How pages the agency's clients see look. */
export interface Brand {
  /** Shown as "Prepared by …"; null = not set up yet. */
  name: string | null;
  /** #rrggbb accent for client pages. */
  color: string | null;
  /** The agency's own website (https). */
  url: string | null;
  logoUrl: string | null;
  /** Hide "Measured with Olmene" on client pages (plans that include it). */
  whiteLabel: boolean;
}

export interface ClientSite {
  id: string;
  host: string;
  url: string;
  lastScore: number | null;
}

export interface ClientRecipient {
  id: string;
  email: string;
  /** Set when they used the link in a report; they stay listed so they can't be added back. */
  unsubscribedAt: string | null;
  createdAt: string;
}

/** The client's emailed report: how often, when, and to whom. */
export interface ClientReport {
  cadence: ReportCadence;
  /** When the next one goes out (null when off). */
  nextAt: string | null;
  /** When the last one went out. */
  sentAt: string | null;
  recipients: ClientRecipient[];
}

export interface Client {
  id: string;
  name: string;
  website: string | null;
  contactEmail: string | null;
  createdAt: string;
  sites: ClientSite[];
  portal: { slug: string; views: number; createdAt: string } | null;
  report: ClientReport;
}

/** The Clients page in one call. */
export interface ClientsView {
  kind: WorkspaceKind;
  /** Your role here: viewers look, members manage clients and links, admins also branding and removing clients. */
  role: WorkspaceRole;
  brand: Brand;
  /** Whether the plan includes hiding Olmene's name on client pages. */
  whiteLabelAvailable: boolean;
  clients: Client[];
  /** Sites not yet given to a client. */
  unassigned: ClientSite[];
}

/** /c/[slug]/: everything a client's page shows. */
export interface PortalView {
  client: { name: string };
  brand: Brand;
  sites: SiteProgress[];
}

/** /unsubscribe/?t=…: stopping one client's emailed report. */
export interface UnsubscribeView {
  client: string;
  email: string;
  brand: Brand;
  unsubscribed: boolean;
}
