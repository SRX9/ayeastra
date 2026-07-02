"use client";

import { Alert, Button } from "@heroui/react";
import { useActionState } from "react";

import { openBillingPortalAction, type BillingActionState } from "./actions";

const initialState: BillingActionState = {};

/** Opens the Stripe Customer Portal — plan switches, payment method, invoices, cancellation all live there. */
export function ManageBillingButton() {
  const [state, formAction, pending] = useActionState(openBillingPortalAction, initialState);

  return (
    <form action={formAction} className="grid justify-items-end gap-2">
      <Button type="submit" isDisabled={pending}>
        {pending ? "Opening…" : "Manage billing"}
      </Button>
      {state.error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{state.error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </form>
  );
}
