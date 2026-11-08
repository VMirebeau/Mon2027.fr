"use client";

/// Étape A1 du flow Défier — Source.
/// L'utilisateur choisit entre "Sur tes favoris" et "Sur un thème".
/// Click direct = action (pas de paradigme select-then-confirm).
///
/// Ordre vertical (haut → bas) :
///   1. Question + 2 cartes "Sur quoi veux-tu défier" (action principale)
///   2. Défis envoyés (les défis que TU as créés ; cap 4 → "Voir les N autres →")
///   3. Défis reçus (les défis joués reçus d'autres ; cap 4 → idem)
/// Cet ordre place l'action en tête (intent principal de la page), et
/// rejette l'historique en fin (référence, accessible mais pas prioritaire).

import { DI, SourceRadio } from "../../defi-bits";
import { MyDefisList } from "../../my-defis-list";
import { ReceivedDefisList } from "../../received-defis-list";
import { useProgress } from "@/lib/use-progress";
import { favoritesCount } from "@/lib/progress";
import type { NavTarget, Theme } from "@/lib/types";
import type { Source } from "./shared";

/// Nb d'entrées montrées dans chacune des listes (envoyés / reçus) avant
/// d'afficher "Voir les N autres →" qui ouvre la scène `defis-history`.
const LIST_PREVIEW_CAP = 4;

export function StepA1Body({
  onPickSource,
  large,
  themes,
  onNavigate,
}: {
  onPickSource: (s: Source) => void;
  large?: boolean;
  /// Catalogue des thèmes — utilisé par les listes envoyés/reçus pour
  /// résoudre `themeId` → couleur de pastille. Si absent, fallback neutre.
  themes?: Theme[];
  /// Branche le bouton "Voir les autres" des deux listes vers la scène
  /// `defis-history`. Sans ce callback, les listes sont silencieusement
  /// tronquées au cap.
  onNavigate?: (target: NavTarget) => void;
}) {
  // Compteur favoris live depuis la progression. Disponible dès qu'il y a
  // au moins 1 favori — pour un défi hand-picked, 1 question intentionnelle
  // suffit largement.
  const { progress, hydrated } = useProgress();
  const favCount = hydrated ? favoritesCount(progress) : 0;
  const enoughFav = favCount >= 1;

  const goHistory = onNavigate
    ? () => onNavigate("defis-history")
    : undefined;

  return (
    <div
      style={{
        padding: large ? "8px 0 0" : "4px 18px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 1. Action principale : question + cartes "Sur quoi veux-tu défier".
          Placée en tête pour matérialiser l'intent primaire de la page
          (créer un défi). L'historique vient ensuite, comme référence. */}
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: large ? 40 : 24,
          lineHeight: large ? 1.05 : 1.1,
          letterSpacing: large ? "-0.03em" : "-0.025em",
          textWrap: "balance",
          maxWidth: large ? 720 : undefined,
        }}
      >
        Sur quoi veux-tu défier{" "}
        <span style={{ color: "var(--coral)" }}>ton ami·e</span> ?
      </div>
      <div
        style={{
          marginTop: large ? 14 : 8,
          fontSize: large ? 16 : 13.5,
          color: "var(--ink-soft)",
          lineHeight: 1.5,
          maxWidth: large ? 640 : undefined,
        }}
      >
        On tirera 5 questions, et tu commenceras par y répondre toi-même :
        ton score servira de référence à ton ami·e.
      </div>

      <div
        style={{
          marginTop: large ? 40 : 24,
          marginBottom: large ? 40 : 28,
          display: "grid",
          // Mobile : 1 colonne. Desktop : 2 colonnes côte à côte.
          gridTemplateColumns: large ? "1fr 1fr" : "1fr",
          gap: large ? 16 : 10,
        }}
      >
        <SourceRadio
          disabled={!enoughFav}
          onPick={() => enoughFav && onPickSource("favoris")}
          icon={<DI.Star size={20} />}
          color="var(--yellow)"
          label="Sur tes favoris"
          sub={
            enoughFav
              ? favCount === 1
                ? "Tu as 1 question favorite. Tu peux défier dessus directement."
                : `Tu as ${favCount} questions favorites. Tu en choisiras 1 à 10.`
              : "Tu n'as pas encore de favori. Ajoute-en en jouant et marque les questions qui te marquent."
          }
          extraLink={!enoughFav ? "Comment créer des favoris ?" : undefined}
        />
        <SourceRadio
          onPick={() => onPickSource("theme")}
          icon={<DI.Tag size={20} />}
          color="var(--teal)"
          label="Sur un thème"
          sub="On te propose les thèmes disponibles : 5 questions tirées au hasard."
        />
      </div>

      {/* 2. Défis envoyés — ne rend rien si vide (cf. MyDefisList). */}
      <MyDefisList
        themes={themes ?? []}
        large={large}
        cap={LIST_PREVIEW_CAP}
        onSeeMore={goHistory}
      />

      {/* 3. Défis reçus — symétrique, idem rend rien si vide. */}
      <ReceivedDefisList
        themes={themes ?? []}
        large={large}
        cap={LIST_PREVIEW_CAP}
        onSeeMore={goHistory}
      />
    </div>
  );
}
