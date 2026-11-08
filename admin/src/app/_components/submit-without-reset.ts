import { startTransition, type FormEvent } from "react";

/// Soumet un formulaire à son action (useActionState) SANS la réinitialisation
/// automatique de React 19.
///
/// Avec `<form action={fn}>`, React appelle requestFormReset juste avant
/// l'action (startHostTransition dans react-dom 19.2) : à la fin de la
/// transition, tous les champs non contrôlés (defaultValue) reprennent leur
/// valeur initiale — y compris quand l'action renvoie une erreur. Le travail
/// saisi était effacé à chaque enregistrement refusé.
///
/// En annulant l'événement et en lançant nous-mêmes la transition, React voit
/// `defaultPrevented` : il appelle startHostTransition avec une action nulle
/// (simple signal « envoi en cours » pour useFormStatus) et ne programme
/// aucune réinitialisation. Garder aussi `action={formAction}` sur le <form> :
/// avant l'hydratation l'envoi reste possible (amélioration progressive), et
/// ne part jamais en GET avec les champs — mot de passe compris — dans l'URL.
///
/// Conséquence : vider le formulaire après un succès est désormais à la charge
/// du composant (cf. CommentForm).
export function submitWithoutReset(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}
