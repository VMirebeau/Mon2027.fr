"use client";

import { Logo } from "../ui-bits";
import { EmailLink } from "../email-link";

export function APropos({ onHome }: { onHome: () => void }) {
  return (
    <div
      className="scroll"
      style={{
        background: "var(--cream)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "32px 24px 24px" }}>
        <button
          onClick={onHome}
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
          }}
          aria-label="Retour à l'accueil"
        >
          <Logo />
        </button>
      </div>

      <div style={{ padding: "0 24px 32px", flex: 1 }}>
        <div
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-mute)",
            marginBottom: 12,
          }}
        >
          À propos
        </div>
        <h1
          className="display"
          style={{
            fontWeight: 700,
            fontSize: 36,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            margin: 0,
            textWrap: "balance",
          }}
        >
          Une app civique pour{" "}
          <span style={{ color: "var(--coral)" }}>préparer 2027</span>.
        </h1>
        <p
          style={{
            marginTop: 16,
            fontSize: 16,
            lineHeight: 1.5,
            color: "var(--ink-soft)",
          }}
        >
          Mon2027 te montre, en 3 minutes, ce que les chiffres publics disent
          vraiment de la France, et ce que l&apos;intuition collective rate.
        </p>

        <Section title="Pourquoi cette app">
          <p>
            Le débat public se tient de plus en plus sur des ressentis. Sur
            l&apos;immigration, l&apos;économie, la sécurité, le climat&nbsp;: les
            Français interrogés croient des choses qui s&apos;écartent des
            données publiques. Ça vaut pour tous les électorats.
          </p>
          <p>
            Avant de voter, c&apos;est utile de tester son intuition contre les
            chiffres. Pas pour avoir une <em>bonne réponse politique</em>, mais
            pour savoir d&apos;où on part.
          </p>
        </Section>

        <Section title="Pour qui">
          <p>
            Pour toute personne qui va voter en 2027. Pas besoin d&apos;être à
            l&apos;aise avec les statistiques&nbsp;: les questions sont en
            français courant.
          </p>
          <p>
            Si tu es militant·e, peu importe la couleur, c&apos;est aussi un
            kit d&apos;auto-vérification avant de citer un chiffre en
            discussion.
          </p>
        </Section>

        <Section title="Qui est derrière">
          <p>
            Projet personnel de <strong>Vivien Mirebeau</strong>. Bénévole, sans
            structure juridique, sans financement politique ni publicitaire.
          </p>
          <p>
            Le créateur a ses convictions personnelles (c&apos;est documenté,
            pas masqué), mais l&apos;app applique un protocole éditorial
            explicite (voir la page Méthode) pour empêcher ces convictions de
            fausser les questions.
          </p>
        </Section>

        <Section title="Ce qu'on ne fait pas">
          <Bullets
            items={[
              ["Pas de tracking", "aucun cookie publicitaire, pas d'analytics tiers"],
              ["Compte optionnel, sans email", "tu peux jouer en local, ou créer un compte pseudo+pass pour retrouver tes données ailleurs"],
              [
                "Pas de recommandation de vote",
                "les chiffres ne disent jamais pour qui voter",
              ],
              ["Pas de publicité", "ni partis, ni marques"],
            ]}
          />
        </Section>

        <Section title="Contribuer">
          <Bullets
            items={[
              [
                "Signaler une erreur",
                "chiffre faux, source périmée, formulation biaisée",
              ],
              ["Proposer une question", "un sujet, un chiffre, une source"],
              [
                "Partager l'app",
                "surtout aux gens qui ne pensent pas comme toi",
              ],
            ]}
          />
          <p style={{ marginTop: 14 }}>
            Tout passe par{" "}
            <EmailLink
              style={{
                color: "var(--ink)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            />
            .
          </p>
        </Section>

        <Section title="Calendrier">
          <p>
            Présidentielle prévue en <strong>avril–mai 2027</strong>. D&apos;ici
            là, nouvelles questions chaque semaine, chiffres mis à jour au fil
            des publications INSEE/Eurostat.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2
        className="display"
        style={{
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-soft)" }}>
        {children}
      </div>
    </section>
  );
}

function Bullets({ items }: { items: [string, string][] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map(([label, desc]) => (
        <li
          key={label}
          style={{
            padding: "10px 0 10px 18px",
            position: "relative",
            borderBottom: "1px solid var(--rule-soft)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 16,
              width: 7,
              height: 7,
              borderRadius: 2,
              background: "var(--coral)",
            }}
          />
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
            {label}
          </strong>{" "}
          : {desc}
        </li>
      ))}
    </ul>
  );
}
