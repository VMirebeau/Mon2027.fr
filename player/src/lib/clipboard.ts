/// Copie un texte dans le presse-papier avec fallback pour contextes non
/// sécurisés (HTTP en dev sur LAN, par ex. `http://10.5.0.2:2028`).
///
/// `navigator.clipboard.writeText` n'est dispo qu'en "secure context"
/// (HTTPS ou localhost) — sur n'importe quelle autre origine, l'API est
/// soit `undefined` soit jette `NotAllowedError`. Le fallback historique
/// `document.execCommand("copy")` via un `<textarea>` temporaire continue
/// de marcher partout (déprécié mais maintenu par tous les navigateurs
/// pour compat). On essaie la moderne d'abord, on retombe sur l'ancienne
/// si nécessaire.
///
/// Retourne `true` si la copie a réussi, `false` sinon (perms refusées,
/// SSR, etc.). Le caller affiche une confirmation ou un fallback UI
/// approprié.
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. API moderne (HTTPS / localhost). Très simple et préférée quand
  //    disponible — pas de manipulation DOM.
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through au legacy : permissions refusées ou API bloquée */
    }
  }

  // 2. Legacy fallback `document.execCommand("copy")`. Fonctionne en HTTP
  //    en dev (LAN), Safari iOS sans focus prérequis, etc. La technique :
  //    on crée un `<textarea>` invisible avec le texte, on select(), on
  //    exec("copy"), on remove. `position: fixed` + `opacity: 0` pour
  //    qu'il ne scrolle pas la page ni clignote.
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  // Évite que le textarea déclenche un scroll horizontal sur iOS Safari
  // (qui calque la position de la sélection sur le viewport).
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.width = "1px";
  ta.style.height = "1px";
  ta.style.padding = "0";
  ta.style.border = "0";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  ta.setAttribute("readonly", "");
  document.body.appendChild(ta);

  // iOS Safari requiert un range explicite ; .select() seul ne suffit
  // pas toujours. On combine les deux.
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
