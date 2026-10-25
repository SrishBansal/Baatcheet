/**
 * Maps the app job model to the shape expected by baatcheet-engine.
 * Job model: { title, description, skills:[{id,name,priority}], questions:[{text,relatedSkills:[skillId]}] }
 * Engine shape: { title, company, summary, responsibilities, requirements:[{name,kind}], questions:[{text,requirementName}] }
 */

/**
 * @param {object} job - app job object (from store)
 * @returns {object} engine job payload
 */
export function toEngineJob(job) {
  const skills = Array.isArray(job.skills)
    ? job.skills
    : Array.isArray(job.requirements)
      ? job.requirements
      : [];
  const skillById = new Map(skills.map((s) => [s.id, s]));

  const requirements = skills.map((s) => ({
    name: String(s.name || ''),
    kind: (s.priority === 'preferred' || s.kind === 'preferred') ? 'preferred' : 'required',
  }));

  const questions = (Array.isArray(job.questions) ? job.questions : [])
    .filter((q) => String(q.text || '').trim().length > 0)
    .map((q) => {
      const linked = Array.isArray(q.relatedSkills)
        ? q.relatedSkills
        : Array.isArray(q.requirementIds)
          ? q.requirementIds
          : [];
      const firstSkill = linked.length ? skillById.get(linked[0]) : null;
      return {
        text: String(q.text).trim(),
        requirementName: q.requirementName || (firstSkill ? firstSkill.name : ''),
      };
    });

  return {
    title: String(job.title || ''),
    company: String(job.company || ''),
    summary: String(job.summary || ''),
    responsibilities: Array.isArray(job.responsibilities) ? job.responsibilities : [],
    requirements,
    questions,
  };
}
