"use client";

import { Avatar, Button, Dropdown, Label, Separator, Skeleton } from "@heroui/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function UserMenu() {
  const { user, organizationId, loading, signOut } = useAuth();
  const router = useRouter();

  if (loading) return <Skeleton className="h-8 w-8 rounded-full" />;

  if (!user) {
    return (
      <Link href="/login" className="link text-sm underline-offset-4">
        Sign in
      </Link>
    );
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

  const handleAction = (key: React.Key) => {
    switch (key) {
      case "dashboard":
        router.push("/dashboard");
        break;
      case "team":
        router.push("/settings/team");
        break;
      case "onboarding":
        router.push("/onboarding");
        break;
      case "signout":
        void signOut({ returnTo: "/" });
        break;
    }
  };

  return (
    <Dropdown>
      <Button variant="ghost" isIconOnly aria-label="Account menu" className="rounded-full p-0">
        <Avatar size="sm">
          {user.profilePictureUrl ? (
            <Avatar.Image
              alt=""
              src={user.profilePictureUrl}
              referrerPolicy="no-referrer"
            />
          ) : null}
          <Avatar.Fallback>{(name || user.email).slice(0, 2).toUpperCase()}</Avatar.Fallback>
        </Avatar>
      </Button>
      <Dropdown.Popover className="w-56">
        <div className="px-2 py-1.5">
          {name && <p className="truncate text-sm font-medium">{name}</p>}
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <Separator />
        <Dropdown.Menu onAction={handleAction}>
          {organizationId ? (
            <>
              <Dropdown.Item id="dashboard" textValue="Dashboard">
                <Label>Dashboard</Label>
              </Dropdown.Item>
              <Dropdown.Item id="team" textValue="Team">
                <Label>Team</Label>
              </Dropdown.Item>
            </>
          ) : (
            <Dropdown.Item id="onboarding" textValue="Create organization">
              <Label>Create organization</Label>
            </Dropdown.Item>
          )}
          <Dropdown.Item id="signout" textValue="Sign out">
            <Label>Sign out</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
