/** Shapes the workspace API returns (shared by the Worker routes and the browser). */

import type { InvitableRole, WorkspaceRole } from "./roles";

export type WorkspaceKind = "company" | "agency";

/** A workspace you can switch to: your own account, or one you were invited to. */
export interface WorkspaceSummary {
  ownerId: string;
  name: string;
  kind: WorkspaceKind;
  role: WorkspaceRole;
  own: boolean;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
}

export interface WorkspaceMember {
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: string | null;
  you: boolean;
}

export interface WorkspaceInvite {
  id: string;
  email: string;
  role: InvitableRole;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

/** The Team page in one call. Invites are only listed for admins and the owner. */
export interface WorkspaceView {
  ownerId: string;
  name: string;
  kind: WorkspaceKind;
  role: WorkspaceRole;
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
  seats: { used: number; limit: number; plan: string | null };
}

/** What an invitation link shows before it's accepted. */
export interface InvitePreview {
  workspace: string;
  inviter: string | null;
  role: InvitableRole;
  email: string;
  state: "open" | "used" | "expired";
}
