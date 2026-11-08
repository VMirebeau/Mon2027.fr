"use client";

import { AppFooter } from "./app-nav";
import { DefiCreate, type DefiCreateProps } from "../screens/defi-create";
import type { NavTarget } from "@/lib/types";

/// Variante desktop du flow de création.
/// Layout pleine largeur (dt-page → dt-content) aligné sur le reste du
/// desktop. Le composant DefiCreate reçoit `large` pour basculer ses étapes
/// internes vers les grilles horizontales et les CTAs inline (plus de sticky
/// bottom bar mobile au milieu d'un grand écran).
export function DefiCreateDT(
  props: DefiCreateProps & { onNavigate?: (target: NavTarget) => void },
) {
  const { onNavigate, ...createProps } = props;
  return (
    <>
      <div className="dt-page" style={{ background: "var(--cream)" }}>
        <div
          className="dt-content"
          style={{
            paddingTop: 32,
            paddingBottom: 48,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <DefiCreate {...createProps} bare large />
        </div>
      </div>
      <AppFooter onNavigate={onNavigate} />
    </>
  );
}
