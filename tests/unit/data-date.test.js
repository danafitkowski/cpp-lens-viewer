// ONE data date for the whole viewer (2026-11-07), src/sections/_shared/data-date.js.
//
// Sections used to read the FIRST PROJECT row's raw last_recalc_date each on
// its own, while DCMA Lite read it by CPP's DCMA definition (D0 picks the
// project, D14 reads its date as P6 does). On a file with a blank data date, or
// one before its planned start, the "Input file finding" card and DCMA check 9
// named different dates on the same page. These tests pin the shared rule.
import { describe, it, expect } from 'vitest';
import {
  resolveDataDate, dataDateOfProject, dataDateDisclosure, dataDateSource, selectScoredProject, instantOf, dayOf
} from '../../src/sections/_shared/data-date.js';
import { dataDateOf } from '../../src/sections/_shared/input-quality.js';

function model(projects, tasks = []) {
  return {
    tables: {
      PROJECT: { fields: ['proj_id', 'proj_short_name', 'last_recalc_date', 'plan_start_date'], records: projects },
      TASK: { fields: ['task_id', 'proj_id', 'task_code'], records: tasks }
    }
  };
}

function proj(proj_id, last_recalc_date, plan_start_date = '') {
  return { proj_id, proj_short_name: `P${proj_id}`, last_recalc_date, plan_start_date };
}

describe('D14: the data date of one project', () => {
  it('a filed data date on or after the planned start is used as filed, with nothing to disclose', () => {
    const dd = resolveDataDate(model([proj('1', '2026-06-01 08:00', '2026-05-04 08:00')]));
    expect(dd).toMatchObject({ instant: '2026-06-01 08:00', day: '2026-06-01', disclosure: null });
    expect(dd.project.proj_id).toBe('1');
    expect(dataDateDisclosure(dd)).toBe('');
    expect(dataDateSource(dd)).toBe('last_recalc_date');
  });

  it('blank: the planned start, disclosed', () => {
    const dd = resolveDataDate(model([proj('1', '', '2026-06-01 08:00')]));
    expect(dd).toMatchObject({ instant: '2026-06-01 08:00', day: '2026-06-01',
      disclosure: { filed: '', from: 'plan_start_date' } });
    expect(dataDateDisclosure(dd)).toBe("the file states no data date, so the project's planned start, 2026-06-01, is used, as P6 does");
    expect(dataDateSource(dd)).toBe('planned start: the file states no data date');
  });

  it('blank, and no planned start either: no data date at all', () => {
    const dd = resolveDataDate(model([proj('1', '  ', '')]));
    expect(dd).toMatchObject({ instant: '', day: '', disclosure: null });
    expect(dataDateDisclosure(dd)).toBe('');
    // A tile with no date never claims to show last_recalc_date.
    expect(dataDateSource(dd)).toBe('the file states no data date or planned start');
  });

  it('on a day before a later planned start: lifted to the planned start, disclosed', () => {
    const dd = resolveDataDate(model([proj('1', '2026-02-02 08:00', '2026-06-01 08:00')]));
    expect(dd).toMatchObject({ instant: '2026-06-01 08:00', day: '2026-06-01',
      disclosure: { filed: '2026-02-02 08:00', from: 'plan_start_date' } });
    expect(dataDateDisclosure(dd)).toBe(
      "the file's data date, 2026-02-02, is before the project's planned start, 2026-06-01, so the planned start is used, as P6 does");
    expect(dataDateSource(dd)).toBe('planned start: the data date in the file, 2026-02-02, is earlier');
  });

  it('earlier the same day as a later planned start: NOT lifted (the rule is by the day)', () => {
    const dd = resolveDataDate(model([proj('1', '2026-06-01 08:00', '2026-06-01 13:00')]));
    expect(dd).toMatchObject({ instant: '2026-06-01 08:00', day: '2026-06-01', disclosure: null });
  });

  it('a date with no time, or with a T, reads as an instant', () => {
    expect(instantOf('2026-06-01')).toBe('2026-06-01 00:00');
    expect(instantOf('2026-06-01T07:30:00')).toBe('2026-06-01 07:30');
    expect(instantOf('not a date')).toBe('');
    expect(dayOf(' 2026-06-01 08:00')).toBe('2026-06-01');
    expect(dataDateOfProject({ last_recalc_date: '2026-06-01', plan_start_date: '' }).instant).toBe('2026-06-01 00:00');
  });

  it('no model, or no PROJECT row: no data date', () => {
    expect(resolveDataDate(null)).toMatchObject({ instant: '', day: '', project: null, disclosure: null });
    expect(resolveDataDate(model([]))).toMatchObject({ instant: '', day: '', project: null, disclosure: null });
  });
});

describe('D0: a multi-project file is read on one project', () => {
  it('the latest data date, not the first PROJECT row', () => {
    const dd = resolveDataDate(model([proj('1', '2026-03-02 08:00'), proj('2', '2026-06-01 08:00')]));
    expect(dd.day).toBe('2026-06-01');
    expect(dd.project.proj_id).toBe('2');
  });

  it('ties go to the project with more TASK rows, then to file order', () => {
    const tasks = [{ task_id: '1', proj_id: '1' }, { task_id: '2', proj_id: '2' }, { task_id: '3', proj_id: '2' }];
    const p1 = proj('1', '2026-06-01 08:00');
    const p2 = proj('2', '2026-06-01 08:00');
    expect(resolveDataDate(model([p1, p2], tasks)).project.proj_id).toBe('2');
    expect(resolveDataDate(model([p1, p2], tasks.slice(0, 2))).project.proj_id).toBe('1');
    expect(resolveDataDate(model([p2, p1], tasks.slice(0, 2))).project.proj_id).toBe('2');
  });

  it('D14 applies to the project D0 picks', () => {
    // The chosen project's data date is before its own planned start: lifted.
    const dd = resolveDataDate(model([proj('1', '2026-01-05 08:00'), proj('2', '2026-02-02 08:00', '2026-06-01 08:00')]));
    expect(dd.project.proj_id).toBe('2');
    expect(dd.day).toBe('2026-06-01');
    expect(dd.disclosure).toEqual({ filed: '2026-02-02 08:00', from: 'plan_start_date' });
  });

  it('is the same choice DCMA Lite scores, and the date input-quality reads', () => {
    const m = model([proj('1', '2026-03-02 08:00'), proj('2', '', '2026-06-01 08:00'), proj('3', '2026-04-01 08:00')]);
    expect(selectScoredProject(m).project.proj_id).toBe('3');
    expect(resolveDataDate(m).project.proj_id).toBe('3');
    expect(dataDateOf(m)).toBe('2026-04-01');
  });
});
