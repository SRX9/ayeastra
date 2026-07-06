"use client";

import { ASSIGNABLE_ROLES, isRole } from "@ayeastra/auth";
import {
  AlertDialog,
  Button,
  Chip,
  ListBox,
  Select,
  toast,
} from "@heroui/react";
import { useTransition } from "react";

import { removeMemberAction, revokeInvitationAction, updateMemberRoleAction } from "./actions";

function RoleSelect({
  membershipId,
  role,
  email,
  pending,
  startTransition,
}: {
  membershipId: string;
  role: string;
  email: string;
  pending: boolean;
  startTransition: (callback: () => Promise<void>) => void;
}) {
  return (
    <Select
      value={role}
      isDisabled={pending}
      className="w-28"
      aria-label={`Role for ${email}`}
      onChange={(next) => {
        if (typeof next !== "string") return;
        startTransition(async () => {
          const result = await updateMemberRoleAction(membershipId, next);
          if (result.error) toast.danger(result.error);
        });
      }}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {ASSIGNABLE_ROLES.map((option) => (
            <ListBox.Item key={option} id={option} textValue={option}>
              {option}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function MemberActions({
  membershipId,
  role,
  email,
}: {
  membershipId: string;
  role: string;
  email: string;
}) {
  const [pending, startTransition] = useTransition();
  const assignable = isRole(role) && (ASSIGNABLE_ROLES as readonly string[]).includes(role);

  return (
    <div className="flex items-center gap-2">
      {assignable ? (
        <RoleSelect
          membershipId={membershipId}
          role={role}
          email={email}
          pending={pending}
          startTransition={startTransition}
        />
      ) : (
        <Chip size="sm">{role}</Chip>
      )}
      <AlertDialog>
        <Button variant="ghost" size="sm" isDisabled={pending}>
          Remove
        </Button>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>Remove team member?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>
                  Remove <strong>{email}</strong> from the organization? They will lose access
                  immediately.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  Cancel
                </Button>
                <Button
                  slot="close"
                  variant="danger"
                  isDisabled={pending}
                  onPress={() => {
                    startTransition(async () => {
                      const result = await removeMemberAction(membershipId);
                      if (result.error) toast.danger(result.error);
                    });
                  }}
                >
                  Remove
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}

export function InvitationActions({ invitationId, email }: { invitationId: string; email: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <Button variant="ghost" size="sm" isDisabled={pending}>
        Revoke
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Revoke invitation?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                Revoke the invitation for <strong>{email}</strong>? They will no longer be able to
                join using that link.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Cancel
              </Button>
              <Button
                slot="close"
                variant="danger"
                isDisabled={pending}
                onPress={() => {
                  startTransition(async () => {
                    const result = await revokeInvitationAction(invitationId);
                    if (result.error) toast.danger(result.error);
                  });
                }}
              >
                Revoke
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
