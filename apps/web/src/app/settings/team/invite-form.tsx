"use client";

import { ASSIGNABLE_ROLES } from "@ayeastra/auth";
import {
  Alert,
  Button,
  Input,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import { useActionState } from "react";

import { inviteMemberAction, type InviteState } from "./actions";

const initialState: InviteState = {};

export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteMemberAction, initialState);

  return (
    <form action={formAction} className="grid gap-3">
      <div className="flex gap-2">
        <TextField
          name="email"
          type="email"
          isRequired
          fullWidth
          defaultValue={state.email}
          aria-label="Email address to invite"
        >
          <Input placeholder="teammate@company.com" />
        </TextField>
        <Select name="role" defaultValue={state.role ?? "member"} className="w-32" aria-label="Role for the new member">
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {ASSIGNABLE_ROLES.map((role) => (
                <ListBox.Item key={role} id={role} textValue={role}>
                  {role}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Button type="submit" isDisabled={pending}>
          {pending ? "Inviting…" : "Invite"}
        </Button>
      </div>
      {state.error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{state.error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {state.success && (
        <Alert status="success">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{state.success}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </form>
  );
}
