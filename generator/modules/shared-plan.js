import { validateTrip } from './config.js';
import { normalizeState } from './state.js';

export class PlanError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'PlanError';
    this.code = code;
  }
}
export function createSharedPlan({ auth, trip }) {
  // Snapshot the configuration so later application changes cannot bypass validation.
  const config = validateTrip(structuredClone(trip));
  const fields = 'project_id,revision,payload';
  function payloadFor(plan) {
    if (!Array.isArray(plan) || plan.length > 5000)
      throw new PlanError('invalid_plan', 'Plan ungültig oder zu gross');
    const normalized = normalizeState({ version: 1, favorites: [], plan }, config).plan;
    if (JSON.stringify(normalized) !== JSON.stringify(plan))
      throw new PlanError(
        'invalid_plan',
        'Plan enthält unbekannte Orte, falsche Tage oder doppelte Einträge',
      );
    return { version: 1, tripId: config.id, plan: normalized };
  }
  function snapshot(row, member) {
    if (!row)
      return Object.freeze({
        projectId: auth.projectId,
        tripId: config.id,
        userId: member.userId,
        generation: member.generation,
        revision: null,
        plan: Object.freeze([]),
      });
    if (
      row.project_id !== auth.projectId ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1 ||
      row.revision >= Number.MAX_SAFE_INTEGER ||
      row.payload?.version !== 1 ||
      row.payload.tripId !== config.id
    )
      throw new PlanError('invalid_response', 'Gemeinsamer Plan hat ein ungültiges Format');
    const plan = payloadFor(row.payload.plan).plan;
    return Object.freeze({
      projectId: auth.projectId,
      tripId: config.id,
      userId: member.userId,
      generation: member.generation,
      revision: row.revision,
      plan: Object.freeze(plan.map((entry) => Object.freeze(entry))),
    });
  }
  async function load() {
    const member = await auth.requireMember();
    const { data, error } = await auth.client
      .from('travel_project_plans')
      .select(fields)
      .eq('project_id', auth.projectId)
      .maybeSingle();
    auth.assertCurrent(member);
    if (error)
      throw new PlanError('load_failed', 'Gemeinsamer Plan konnte nicht geladen werden', error);
    return snapshot(data, member);
  }
  async function save(previous, plan) {
    const payload = payloadFor(plan);
    const member = await auth.requireMember(true);
    if (
      !previous ||
      previous.projectId !== auth.projectId ||
      previous.tripId !== config.id ||
      previous.userId !== member.userId ||
      previous.generation !== member.generation
    )
      throw new PlanError('stale_session', 'Bitte den gemeinsamen Plan für dieses Konto neu laden');
    auth.assertCurrent(previous);
    if (
      previous.revision !== null &&
      (!Number.isSafeInteger(previous.revision) ||
        previous.revision < 1 ||
        previous.revision >= Number.MAX_SAFE_INTEGER - 1)
    )
      throw new PlanError('invalid_revision', 'Planversion ungültig');
    let query;
    if (previous.revision === null) {
      query = auth.client
        .from('travel_project_plans')
        .insert({ project_id: auth.projectId, revision: 1, payload });
    } else {
      query = auth.client
        .from('travel_project_plans')
        .update({ revision: previous.revision + 1, payload })
        .eq('project_id', auth.projectId)
        .eq('revision', previous.revision);
    }
    const { data, error } = await query.select(fields).maybeSingle();
    auth.assertCurrent(member);
    if (error?.code === '23505' || (!error && !data))
      throw new PlanError(
        'conflict',
        'Der Plan wurde inzwischen geändert oder der Zugriff entzogen. Bitte neu laden und Änderungen vergleichen.',
        error,
      );
    if (error)
      throw new PlanError(
        'save_failed',
        'Speichern nicht bestätigt. Bitte neu laden und vergleichen, bevor du erneut speicherst.',
        error,
      );
    if (data.revision !== (previous.revision === null ? 1 : previous.revision + 1))
      throw new PlanError('invalid_response', 'Der Server hat keine neue Planversion bestätigt');
    return snapshot(data, member);
  }
  return Object.freeze({ load, save });
}
