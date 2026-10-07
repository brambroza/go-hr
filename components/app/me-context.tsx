"use client";
import { createContext, useContext, type ReactNode } from "react";
import { can as canFn, type Action, type Me, type MenuKey } from "@/lib/permissions";

const MeContext = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me | null; children: ReactNode }) {
  return <MeContext value={me}>{children}</MeContext>;
}

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe() outside MeProvider");
  return me;
}

export function useMaybeMe(): Me | null {
  return useContext(MeContext);
}

export function useCan() {
  const me = useContext(MeContext);
  return (menu: MenuKey, action: Action = "view") => canFn(me, menu, action);
}
