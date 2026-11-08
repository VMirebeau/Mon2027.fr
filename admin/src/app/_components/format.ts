/// Dates affichées dans l'espace contributeurs (fuseau de Paris, quel que
/// soit le fuseau du serveur).
const DATE_TIME = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});
const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });

export function formatDateTime(d: Date): string {
  return DATE_TIME.format(d);
}

export function formatDate(d: Date): string {
  return DATE.format(d);
}

/// Valeur d'historique lisible et tronquée.
export function previewValue(v: unknown, max = 160): string {
  if (v === null || v === undefined || v === "") return "∅";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/// Lien saisi par un joueur (source proposée) : cliquable seulement en
/// http(s). Un `javascript:` ou `data:` dans un <a href> s'exécuterait avec
/// la session du contributeur qui clique.
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim());
}
