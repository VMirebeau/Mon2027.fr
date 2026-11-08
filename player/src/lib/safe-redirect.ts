/// Validation d'un paramètre `next=` pour redirection post-login/signup.
///
/// Sans validation, un attaquant pourrait fabriquer un lien
/// `/?s=account&next=//evil.com` : après login, le router push enverrait
/// l'utilisateur sur un site externe (open redirect) qui peut imiter Mon2027
/// pour phisher. Voir OWASP "Unvalidated Redirects and Forwards".
///
/// Règles :
///   - doit commencer par `/`
///   - ne doit PAS commencer par `//` (URL protocol-relative → externe)
///   - ne doit pas contenir de CR/LF (anti header-injection si jamais le path
///     finit dans un header HTTP)
///   - ne doit pas contenir `:` avant le premier `/` (protection contre
///     `javascript:` ou `data:` qui ne devraient pas pouvoir arriver après
///     un parse URL mais on garde la ceinture)
///
/// Renvoie le chemin tel quel s'il est sûr, sinon `null`.
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > 2048) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (/[\r\n]/.test(raw)) return null;
  // Pas de scheme avant le premier `/`. `/foo:bar` est OK (`:` est dans le path,
  // pas un scheme). `javascript:/foo` est bloqué par startsWith("/") déjà, mais
  // on vérifie aussi qu'un user-fabriqué tordu type `/\\evil.com` ne passe pas.
  if (raw.startsWith("/\\")) return null;
  return raw;
}
