import { buttonVariants } from "@/components/ui/button";
import { QuestionForm } from "../_components/QuestionForm";
import { DirtyProvider } from "../_components/DirtyProvider";
import { GuardedLink } from "../_components/GuardedLink";
import { createQuestionAction } from "@/lib/actions";
import { ArrowLeft } from "lucide-react";
import { requireContributor } from "@/lib/auth/session";
import { canPublishDirectly, selectableStatuts } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function NewQuestionPage() {
  const me = await requireContributor();
  // Publier à la création suppose une validation… qui ne peut pas encore
  // exister : réservé au superadmin.
  const statutOptions = selectableStatuts(me.role).filter((s) => s !== "publie" || canPublishDirectly(me.role));
  return (
    <DirtyProvider>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <GuardedLink
            href="/"
            aria-label="Retour à la liste"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </GuardedLink>
          <h1 className="text-2xl font-bold">Nouvelle question</h1>
        </div>
        <QuestionForm action={createQuestionAction} submitLabel="Créer la question" statutOptions={statutOptions} />
      </div>
    </DirtyProvider>
  );
}
