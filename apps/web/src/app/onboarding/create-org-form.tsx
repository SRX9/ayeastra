"use client";

import { Alert, Button, Input, Label, TextField } from "@heroui/react";
import { useActionState } from "react";

import { createOrganizationAction, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

export function CreateOrgForm() {
  const [state, formAction, pending] = useActionState(createOrganizationAction, initialState);

  return (
    <form action={formAction} className="grid gap-4">
      <TextField name="name" isRequired minLength={2} maxLength={64} fullWidth>
        <Label>Organization name</Label>
        <Input autoFocus placeholder="Acme Inc." />
      </TextField>
      {state.error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{state.error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <Button type="submit" isDisabled={pending}>
        {pending ? "Creating…" : "Create organization"}
      </Button>
    </form>
  );
}
