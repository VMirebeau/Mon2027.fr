/// Registre des formats à « Réponse attendue » saisie dans PayloadEditor :
/// lecture, écriture, validation et champs conservés, par format.

import type { FormatValue } from "@/lib/constants";
import { parseCat, preservedCat, serializeCatState, validateCatState, type CatState } from "./categorisation";
import { parseCl, preservedCl, serializeCl, validateCl, type ClState } from "./classement";
import { parseCm, preservedCm, serializeCm, validateCm, type CmState } from "./curseur-multi";
import { parsePd, preservedPd, serializePd, validatePd, type PdState } from "./pondere";
import { parsePayload, type Issue, type Obj } from "./shared";
import {
  parseAb,
  parseQcm,
  parseVf,
  preservedAb,
  preservedQcm,
  preservedVf,
  serializeAb,
  serializeQcm,
  serializeVf,
  validateAb,
  validateQcm,
  validateVf,
  type AbState,
  type QcmState,
  type VfState,
} from "./simple";
import { parseVfm, preservedVfm, serializeVfm, validateVfm, type VfmState } from "./vraifaux-multi";

export type PayloadFormat = Exclude<FormatValue, "estimation_numerique">;

export type Model<S> = {
  parse: (obj: Obj | null) => S;
  serialize: (s: S) => Obj;
  validate: (s: S) => Issue[];
  preserved: (s: S) => string[];
};

export const MODELS: {
  vrai_faux: Model<VfState>;
  ab: Model<AbState>;
  qcm: Model<QcmState>;
  classement: Model<ClState>;
  vraifaux_multi: Model<VfmState>;
  curseur_multi: Model<CmState>;
  categorisation: Model<CatState>;
  pondere: Model<PdState>;
} = {
  vrai_faux: { parse: parseVf, serialize: serializeVf, validate: validateVf, preserved: preservedVf },
  ab: { parse: parseAb, serialize: serializeAb, validate: validateAb, preserved: preservedAb },
  qcm: { parse: parseQcm, serialize: serializeQcm, validate: validateQcm, preserved: preservedQcm },
  classement: { parse: parseCl, serialize: serializeCl, validate: validateCl, preserved: preservedCl },
  vraifaux_multi: { parse: parseVfm, serialize: serializeVfm, validate: validateVfm, preserved: preservedVfm },
  curseur_multi: { parse: parseCm, serialize: serializeCm, validate: validateCm, preserved: preservedCm },
  categorisation: {
    parse: parseCat,
    serialize: serializeCatState,
    validate: validateCatState,
    preserved: preservedCat,
  },
  pondere: { parse: parsePd, serialize: serializePd, validate: validatePd, preserved: preservedPd },
};

/// JSON enregistré → éditeur (sans modification) → JSON envoyé.
export function roundTrip(format: PayloadFormat, payload: string | null): string {
  const parsed = parsePayload(payload);
  const model = MODELS[format] as Model<unknown>;
  return JSON.stringify(model.serialize(model.parse(parsed.obj)));
}

/// Problèmes signalés par l'éditeur pour un JSON enregistré.
export function issuesOf(format: PayloadFormat, payload: string | null): Issue[] {
  const model = MODELS[format] as Model<unknown>;
  return model.validate(model.parse(parsePayload(payload).obj));
}
