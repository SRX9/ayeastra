import { hasRoleAtLeast } from "@ayeastra/auth";
import { Avatar, Card, Chip, Separator } from "@heroui/react";

import { requireOrg } from "@/lib/auth";
import { getTeam, type TeamMember } from "@/lib/team";

import { InviteForm } from "./invite-form";
import { InvitationActions, MemberActions } from "./member-actions";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MemberAvatar({ member }: { member: TeamMember }) {
  const initials = (member.name ?? member.email).slice(0, 2).toUpperCase();

  return (
    <Avatar size="sm">
      {member.profilePictureUrl ? (
        <Avatar.Image alt="" src={member.profilePictureUrl} referrerPolicy="no-referrer" />
      ) : null}
      <Avatar.Fallback>{initials}</Avatar.Fallback>
    </Avatar>
  );
}

export default async function TeamPage() {
  const session = await requireOrg();
  const team = await getTeam(session.organizationId);
  const isAdmin = hasRoleAtLeast(session.role, "admin");

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-sm text-muted">
            {team.organizationName} · {team.plan} plan
          </p>
        </div>
        <p className="text-sm text-muted">
          {team.seatsUsed} of {team.seatLimit} seats used
        </p>
      </div>

      <Card className="mb-6">
        <Card.Header>
          <Card.Title>Members ({team.members.length})</Card.Title>
        </Card.Header>
        <Card.Content className="p-0">
          <ul>
            {team.members.map((member, index) => {
              const isSelf = member.userId === session.user.id;
              return (
                <li key={member.membershipId}>
                  {index > 0 && <Separator />}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <MemberAvatar member={member} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {member.name ?? member.email}
                        {isSelf && <span className="ml-1 text-xs text-muted">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {member.email} · joined {formatDate(member.joinedAt)}
                      </p>
                    </div>
                    {isAdmin && !isSelf ? (
                      <MemberActions
                        membershipId={member.membershipId}
                        role={member.role}
                        email={member.email}
                      />
                    ) : (
                      <Chip size="sm">{member.role}</Chip>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card.Content>
      </Card>

      {team.invitations.length > 0 && (
        <Card className="mb-6">
          <Card.Header>
            <Card.Title>Pending invitations ({team.invitations.length})</Card.Title>
          </Card.Header>
          <Card.Content className="p-0">
            <ul>
              {team.invitations.map((invitation, index) => (
                <li key={invitation.id}>
                  {index > 0 && <Separator />}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{invitation.email}</p>
                      <p className="text-xs text-muted">
                        expires {formatDate(invitation.expiresAt)}
                      </p>
                    </div>
                    {isAdmin && (
                      <InvitationActions invitationId={invitation.id} email={invitation.email} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card.Content>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <Card.Header>
            <Card.Title>Invite a teammate</Card.Title>
          </Card.Header>
          <Card.Content>
            {team.seatsUsed >= team.seatLimit ? (
              <p className="text-sm text-muted">
                All {team.seatLimit} seats are in use. Remove a member or revoke a pending
                invitation to free one up.
              </p>
            ) : (
              <InviteForm />
            )}
          </Card.Content>
        </Card>
      )}
    </div>
  );
}
