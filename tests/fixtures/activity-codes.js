/**
 * activity-codes.js — give an XER fixture the tables Narrative Flip actually reads.
 *
 * WHY THIS EXISTS
 * ---------------
 * Narrative Flip compares ACTIVITY-CODE assignments (TASKACTV joined through
 * ACTVCODE and ACTVTYPE). SAMPLE_XER carries none of those three tables, so a
 * fixture built from it renders "0 flips" no matter what the section does with
 * identity. The structural guard in no-surrogate-indexing.test.js rendered every
 * section against a re-export and compared the text — and for Narrative Flip it
 * was comparing "0 flips" with "0 flips". That layer proved nothing.
 *
 * withActivityCodes() appends real ACTVTYPE / ACTVCODE / TASKACTV tables to an
 * XER string, keyed on the TASK rows already in it, so the comparison has
 * something to move. Every activity gets a Phase code and every second one an
 * Area code, which is enough for a per-type flip to be visible.
 *
 * TASKACTV.task_id is a surrogate reference, so reexport() renumbers it along
 * with everything else — which is exactly the condition that broke Narrative
 * Flip in production (410 flips / 0 unchanged on a pair that is really 313 / 5).
 */

/** Code types and values appended to every fixture. Two types, two values each. */
const ACTV_TABLES = [
  '%T\tACTVTYPE',
  '%F\tactv_code_type_id\tactv_code_type\tactv_short_len\tproj_id',
  '%R\tAT1\tPhase\t10\t1',
  '%R\tAT2\tArea\t10\t1',
  '%T\tACTVCODE',
  '%F\tactv_code_id\tactv_code_type_id\tshort_name\tactv_code_name\tseq_num',
  '%R\tAC1\tAT1\tCIVIL\tCivil Works\t10',
  '%R\tAC2\tAT1\tELEC\tElectrical\t20',
  '%R\tAC3\tAT2\tNORTH\tNorth Zone\t10',
  '%R\tAC4\tAT2\tSOUTH\tSouth Zone\t20'
];

/**
 * Read the task_id column out of an XER string's TASK table.
 *
 * @param {string} xerText
 * @returns {string[]} task_id values in file order
 */
export function taskIdsIn(xerText) {
  const lines = String(xerText).split(/\r?\n/);
  let inTask = false;
  let idCol = -1;
  const ids = [];
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols[0] === '%T') {
      inTask = cols[1] === 'TASK';
      idCol = -1;
      continue;
    }
    if (!inTask) continue;
    if (cols[0] === '%F') {
      // %F and %R share a column layout: the tag sits at index 0 in both, so
      // the index of a field name on the %F line is its index on every %R line.
      idCol = cols.indexOf('task_id');
      continue;
    }
    if (cols[0] === '%R' && idCol > 0) {
      const v = cols[idCol];
      if (v != null && v !== '') ids.push(v);
    }
  }
  return ids;
}

/**
 * Return a copy of an XER string carrying real activity-code tables.
 *
 * Assignment is deterministic so a re-export of the same file produces the same
 * codes for the same Activity ID: index 0, 2, 4 … get Phase=CIVIL, 1, 3, 5 … get
 * Phase=ELEC, and every second activity also gets an Area code.
 *
 * @param {string} xerText - an XER string with a TASK table
 * @returns {string} the same XER with ACTVTYPE / ACTVCODE / TASKACTV appended
 */
export function withActivityCodes(xerText) {
  const ids = taskIdsIn(xerText);
  if (ids.length === 0) {
    throw new Error('withActivityCodes: the XER text has no TASK rows to assign codes to');
  }

  const taskactv = ['%T\tTASKACTV', '%F\ttask_id\tactv_code_type_id\tactv_code_id'];
  ids.forEach((id, i) => {
    taskactv.push(`%R\t${id}\tAT1\t${i % 2 === 0 ? 'AC1' : 'AC2'}`);
    if (i % 2 === 0) taskactv.push(`%R\t${id}\tAT2\t${i % 4 === 0 ? 'AC3' : 'AC4'}`);
  });

  const block = [...ACTV_TABLES, ...taskactv].join('\n');

  // Insert ahead of the %E terminator when there is one, else append.
  const lines = String(xerText).replace(/\s*$/, '').split(/\r?\n/);
  const endIdx = lines.findIndex(l => l.split('\t')[0] === '%E');
  if (endIdx === -1) return `${lines.join('\n')}\n${block}\n%E\n`;
  lines.splice(endIdx, 0, ...block.split('\n'));
  return `${lines.join('\n')}\n`;
}
