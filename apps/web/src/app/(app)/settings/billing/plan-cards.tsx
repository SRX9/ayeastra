"use client";

import { Alert, Button, Card, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useActionState, useState } from "react";

import { startCheckoutAction, type BillingActionState } from "./actions";

export interface PlanOffer {
  lookupKey: string;
  /** Preformatted server-side (e.g. "$699/month") to keep this component dumb. */
  priceLabel: string;
}

export interface PlanCardData {
  name: string;
  seats: number;
  entities: number;
  monthly: PlanOffer | null;
  annual: PlanOffer | null;
}

const initialState: BillingActionState = {};

export function PlanCards({ plans }: { plans: PlanCardData[] }) {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [state, formAction, pending] = useActionState(startCheckoutAction, initialState);

  return (
    <div className="grid gap-4">
      <ToggleButtonGroup
        selectionMode="single"
        selectedKeys={[interval]}
        disallowEmptySelection
        fullWidth
        aria-label="Billing interval"
        onSelectionChange={(keys) => {
          const selected = [...keys][0];
          if (selected === "monthly" || selected === "annual") setInterval(selected);
        }}
      >
        <ToggleButton id="monthly">Monthly</ToggleButton>
        <ToggleButton id="annual">
          <ToggleButtonGroup.Separator />
          Annual
        </ToggleButton>
      </ToggleButtonGroup>

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const offer = plan[interval];
          return (
            <Card key={plan.name}>
              <Card.Header>
                <Card.Title>{plan.name}</Card.Title>
                <Card.Description>{offer?.priceLabel ?? "—"}</Card.Description>
              </Card.Header>
              <Card.Content>
                <ul className="text-sm text-muted">
                  <li>{plan.seats} seats</li>
                  <li>{plan.entities} tracked entities</li>
                </ul>
              </Card.Content>
              <Card.Footer>
                <form action={formAction} className="w-full">
                  <input type="hidden" name="priceLookupKey" value={offer?.lookupKey ?? ""} />
                  <Button type="submit" isDisabled={pending || !offer} fullWidth>
                    {pending ? "Redirecting…" : `Choose ${plan.name}`}
                  </Button>
                </form>
              </Card.Footer>
            </Card>
          );
        })}
      </div>

      {state.error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{state.error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
