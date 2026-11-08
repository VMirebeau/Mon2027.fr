"use client";

import Link from "next/link";
import { AppFooter } from "./app-nav";
import { EmailAddress, EmailLink } from "../email-link";
import type { NavTarget } from "@/lib/types";

export function AProposDT({
  onNavigate,
}: {
  onNavigate?: (target: NavTarget) => void;
}) {
  return (
    <>
      <div className="dt-page">
        <div className="dt-content">
          <div className="dt-doc">
            <div>
              <header className="dt-doc-hero">
                <div className="dt-doc-eyebrow">À propos · Mission · Contact</div>
                <h1>
                  Une app civique pour{" "}
                  <span style={{ color: "var(--coral)" }}>préparer 2027</span>.
                </h1>
                <p className="dt-doc-lede">
                  Mon2027 est un quiz qui te montre, en 3 minutes, ce que les
                  chiffres publics disent vraiment de la France, et ce que
                  l&apos;intuition collective rate, à droite comme à gauche.
                </p>
              </header>

              <section className="dt-doc-section">
                <h2>Pourquoi cette app</h2>
                <p>
                  Le débat public se tient de plus en plus sur des ressentis.
                  Sur l&apos;immigration, l&apos;économie, la sécurité, le
                  climat, les Français interrogés <em>croient</em> majoritairement
                  des choses qui s&apos;écartent largement des données publiques,
                  et ça vaut pour tous les électorats.
                </p>
                <p>
                  Mon2027 part d&apos;un postulat simple&nbsp;: avant de voter,
                  c&apos;est utile de tester sa propre intuition contre les
                  chiffres. Pas pour donner une <em>bonne réponse politique</em>,
                  mais pour savoir d&apos;où on part. Les conclusions, on les
                  tire ensuite, et ce ne sont pas les mêmes selon les valeurs
                  qu&apos;on défend, c&apos;est normal.
                </p>
              </section>

              <section className="dt-doc-section">
                <h2>Pour qui</h2>
                <p>
                  Pour toute personne qui va voter en 2027 et qui veut une base
                  factuelle solide. Tu n&apos;as pas besoin d&apos;être à
                  l&apos;aise avec les statistiques&nbsp;: les questions sont
                  rédigées en français courant, les réponses expliquent ce qui
                  est mesuré et comment.
                </p>
                <p>
                  Et si tu es militant·e, peu importe la couleur, l&apos;app
                  te sert aussi de <strong>kit d&apos;auto-vérification</strong>
                  &nbsp;: avant de citer un chiffre dans une discussion, mieux
                  vaut savoir s&apos;il tient debout.
                </p>
              </section>

              <section className="dt-doc-section">
                <h2>Qui est derrière</h2>
                <p>
                  L&apos;app est portée à titre individuel par{" "}
                  <strong>Vivien Mirebeau</strong>, contact unique pour les
                  corrections et les questions éditoriales. Le projet
                  n&apos;est financé par aucun parti, aucune fondation, aucun
                  annonceur. Il n&apos;y a pas de salarié, pas de structure
                  juridique dédiée. Tout le code et le contenu sont produits
                  bénévolement.
                </p>
                <p>
                  Le créateur a ses convictions politiques personnelles (c&apos;est
                  documenté publiquement, pas masqué), mais l&apos;app applique
                  un protocole éditorial explicite pour empêcher ces convictions
                  de fausser les questions (voir la{" "}
                  <Link href="/?s=methode">page Méthode</Link>).
                </p>
              </section>

              <section className="dt-doc-section">
                <h2>Ce qu&apos;on ne fait pas</h2>
                <ul>
                  <li>
                    <strong>Pas de tracking.</strong> Aucun cookie publicitaire,
                    aucun script tiers d&apos;analytics. Le navigateur stocke
                    juste ta progression locale.
                  </li>
                  <li>
                    <strong>Compte optionnel, sans email.</strong> Tu peux
                    jouer sans compte : ta progression reste sur ton appareil.
                    Si tu veux la retrouver ailleurs, tu peux créer un compte
                    avec juste un pseudo et un mot de passe&nbsp;: aucun email
                    demandé, ce qui évite tout problème RGPD.
                  </li>
                  <li>
                    <strong>Pas de recommandation de vote.</strong> Aucune
                    question ne te dit pour qui voter. Les chiffres ne disent
                    jamais ça tout seuls.
                  </li>
                  <li>
                    <strong>Pas de publicité.</strong> Ni partis, ni marques.
                  </li>
                </ul>
              </section>

              <section className="dt-doc-section">
                <h2>Contribuer</h2>
                <p>
                  Trois manières d&apos;aider&nbsp;:
                </p>
                <ul>
                  <li>
                    <strong>Signaler une erreur</strong>&nbsp;: un chiffre faux,
                    une source périmée, une formulation biaisée. Mail à{" "}
                    <EmailLink />.
                  </li>
                  <li>
                    <strong>Proposer une question</strong>&nbsp;: un sujet, un
                    chiffre, une source. Même mail.
                  </li>
                  <li>
                    <strong>Partager l&apos;app</strong>&nbsp;: autour de toi,
                    surtout aux gens qui ne sont pas politiquement du même côté
                    que toi. C&apos;est là que ça sert le plus.
                  </li>
                </ul>
              </section>

              <section className="dt-doc-section">
                <h2>Calendrier</h2>
                <p>
                  L&apos;élection présidentielle est prévue en{" "}
                  <strong>avril–mai 2027</strong>. D&apos;ici là, on publie de
                  nouvelles questions chaque semaine, et on met à jour les
                  chiffres au fil des publications INSEE / Eurostat.
                </p>
              </section>
            </div>

            <aside className="dt-doc-aside">
              <h3>Contact</h3>
              <ul>
                <li>
                  <strong>Email</strong>
                  <EmailAddress />
                </li>
                <li>
                  <strong>Statut</strong>
                  Projet personnel, bénévole, sans structure
                </li>
                <li>
                  <strong>Affiliations</strong>
                  Aucune (parti, fondation, annonceur)
                </li>
                <li>
                  <strong>Données</strong>
                  Compte optionnel sans email, pas de tracking
                </li>
              </ul>
              <EmailLink>Écrire un mail →</EmailLink>
            </aside>
          </div>
        </div>
      </div>
      <AppFooter onNavigate={onNavigate} />
    </>
  );
}
