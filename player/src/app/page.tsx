import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DossierPrefetch } from "@/components/dossier-prefetch";
import { withoutDossier } from "@/lib/question-dossier";
import {
  loadDevSamples,
  loadHomeContent,
  loadPublishedQuestions,
} from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function Page() {
  // On charge les questions UNE seule fois et on les passe à loadHomeContent
  // pour éviter le double findMany (jointure sources = requête lourde).
  const [questions, devSamples] = await Promise.all([
    loadPublishedQuestions(),
    loadDevSamples(),
  ]);
  const home = await loadHomeContent(new Date(), questions);
  // Catalogue envoyé SANS les dossiers (explications, sources : ~70 % du
  // poids) : ils sont chargés à part, en tâche de fond, et gardés en cache
  // par le navigateur (cf. lib/question-dossier.ts, DossierPrefetch).
  const lite = questions.map(withoutDossier);
  const daily = home.dailyQuestion ? withoutDossier(home.dailyQuestion) : null;

  // AuthProvider + ProgressProvider sont fournis au root layout
  // (cf. app/layout.tsx) pour que toutes les routes y aient accès.
  // useSearchParams (utilisé par AppShell) est Suspense-bound dans Next.js :
  // sans cette frontière, le prerender du segment échoue.
  return (
    <Suspense fallback={null}>
      <DossierPrefetch />
      <AppShell
        content={{
          questions: lite,
          themes: home.themes,
          totalQuestions: home.totalQuestions,
          totalOrgs: home.totalOrgs,
          totalSources: home.totalSources,
          dailyQuestion: daily,
          devSamples,
        }}
      />
    </Suspense>
  );
}
