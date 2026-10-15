"use client";

/** The Clients page's calls to the Worker. Each change returns the page's new state. */

import { apiCall } from "@/lib/workspace/client";
import { portalPath, type ReportCadence } from "./rules";
import type { ClientsView } from "./types";

type ViewResult = { view: ClientsView };
const pick = (r: ViewResult) => r.view;

export interface ClientFields {
  name: string;
  website: string;
  contactEmail: string;
}

export const getClients = () => apiCall<ClientsView>("GET", "/api/clients/");
export const addClient = (fields: ClientFields) => apiCall<ViewResult & { id: string }>("POST", "/api/clients/", fields);
export const editClient = (id: string, fields: Partial<ClientFields>) =>
  apiCall<ViewResult>("PATCH", `/api/clients/${encodeURIComponent(id)}/`, fields).then(pick);
export const removeClient = (id: string) => apiCall<ViewResult>("DELETE", `/api/clients/${encodeURIComponent(id)}/`).then(pick);
export const turnOnClientPage = (id: string) => apiCall<ViewResult>("POST", `/api/clients/${encodeURIComponent(id)}/portal/`).then(pick);
export const turnOffClientPage = (id: string) => apiCall<ViewResult>("DELETE", `/api/clients/${encodeURIComponent(id)}/portal/`).then(pick);
export const setReportCadence = (id: string, reportCadence: ReportCadence) =>
  apiCall<ViewResult>("PATCH", `/api/clients/${encodeURIComponent(id)}/`, { reportCadence }).then(pick);
export const addReportRecipient = (id: string, email: string) =>
  apiCall<ViewResult>("POST", `/api/clients/${encodeURIComponent(id)}/recipients/`, { email }).then(pick);
export const removeReportRecipient = (id: string, recipientId: string) =>
  apiCall<ViewResult>("DELETE", `/api/clients/${encodeURIComponent(id)}/recipients/${encodeURIComponent(recipientId)}/`).then(pick);
export const sendReportTest = (id: string) => apiCall<{ to: string }>("POST", `/api/clients/${encodeURIComponent(id)}/report-test/`);
export const moveSite = (siteId: string, clientId: string | null) =>
  apiCall<ViewResult>("PUT", `/api/sites/${encodeURIComponent(siteId)}/client/`, { clientId }).then(pick);
export const saveBrand = (patch: { name?: string; color?: string; url?: string; whiteLabel?: boolean }) =>
  apiCall<ViewResult>("PATCH", "/api/workspace/brand/", patch).then(pick);
export const uploadLogo = (file: Blob) => apiCall<ViewResult>("POST", "/api/workspace/brand/logo/", file).then(pick);
export const removeLogo = () => apiCall<ViewResult>("DELETE", "/api/workspace/brand/logo/").then(pick);

/** The full address of a client's page, for copying. */
export function clientPageUrl(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://olmene.com";
  return `${origin}${portalPath(slug)}`;
}
