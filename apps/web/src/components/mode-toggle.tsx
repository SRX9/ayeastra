"use client";

import { Button, Dropdown, Label } from "@heroui/react";
import { useTheme } from "next-themes";

export function ModeToggle() {
  const { setTheme } = useTheme();

  return (
    <Dropdown>
      <Button variant="outline" isIconOnly aria-label="Toggle theme">
        <span aria-hidden className="text-sm dark:hidden">
          ☀
        </span>
        <span aria-hidden className="hidden text-sm dark:inline">
          ☾
        </span>
        <span className="sr-only">Toggle theme</span>
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu onAction={(key) => setTheme(String(key))}>
          <Dropdown.Item id="light" textValue="Light">
            <Label>Light</Label>
          </Dropdown.Item>
          <Dropdown.Item id="dark" textValue="Dark">
            <Label>Dark</Label>
          </Dropdown.Item>
          <Dropdown.Item id="system" textValue="System">
            <Label>System</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
