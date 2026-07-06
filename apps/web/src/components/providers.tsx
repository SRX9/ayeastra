"use client";

import { Toast } from "@heroui/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toast.Provider />
    </>
  );
}
