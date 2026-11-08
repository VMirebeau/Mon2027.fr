"use client";

import Link, { type LinkProps } from "next/link";
import { type AnchorHTMLAttributes, type ReactNode } from "react";
import { useDirty } from "./DirtyProvider";

type Props = Omit<LinkProps, "href"> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
    children: ReactNode;
  };

/** Link that prompts the user before navigating when the form is dirty. */
export function GuardedLink({ href, children, onClick, ...rest }: Props) {
  const { requestLeave } = useDirty();
  return (
    <Link
      href={href}
      onClick={(e) => {
        // Laisser l'utilisateur ouvrir dans un nouvel onglet sans confirmation
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.(e);
        requestLeave(href);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
