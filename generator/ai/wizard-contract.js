import { makeSiteFromBrief, validatePlannerFields, validateSite } from '../admin/site-schema.js';

export function applyWizardProposal(proposal, draft) {
  const fields = validatePlannerFields(proposal.fields);
  if (proposal.brief) {
    if (draft) throw Error('Dieser Vorschlag würde den bestehenden Entwurf ersetzen.');
    const { title, purpose, audience, mode, plannerProfile } = proposal.brief;
    return makeSiteFromBrief({ title, purpose, audience, mode, plannerProfile, plannerFields: fields });
  }
  if (!draft?.mode || !fields.length) throw Error('Für Zusatzfelder ist ein bestehender Planer nötig.');
  const current = validateSite(draft);
  const merged = new Map((current.plannerFields ?? []).map(field => [field.id, field]));
  for (const field of fields) {
    const previous = merged.get(field.id);
    if (previous && previous.type !== field.type) throw Error('Der Feldtyp eines bestehenden Felds bleibt erhalten.');
    merged.set(field.id, field);
  }
  return validateSite({ ...current, plannerFields: [...merged.values()] });
}
