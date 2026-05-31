#!/usr/bin/env python3
"""Generate the bundled demo schedule for the viewer's one-click sample loader.

Synthesizes a coherent "Sample Commercial Office Fit-Out (Demo Data)" P6 XER:
WBS phases, ~30 activities with FS logic (incl. parallel MEP + finish branches),
a forward/backward CPM pass for early/late dates + total float (so the critical
path and float render), a realistic in-progress status mix vs a data date, and
resource assignments. Writes src/sample/sample-schedule.js (SAMPLE_XER string).

Run:  python scripts/generate-sample-schedule.py
Re-run any time to regenerate. All data is synthetic — no client/confidential info.
"""
import datetime as dt
import os

DATA_DATE = dt.date(2026, 1, 26)        # ~3 weeks of progress
PROJ_START = dt.date(2026, 1, 5)        # Monday

def is_wd(d): return d.weekday() < 5
def add_wd(d, n):
    while not is_wd(d): d += dt.timedelta(days=1)
    i = 0
    while i < n:
        d += dt.timedelta(days=1)
        if is_wd(d): i += 1
    return d
def sub_wd(d, n):
    while not is_wd(d): d -= dt.timedelta(days=1)
    i = 0
    while i < n:
        d -= dt.timedelta(days=1)
        if is_wd(d): i += 1
    return d
def next_wd(d):
    d += dt.timedelta(days=1)
    while not is_wd(d): d += dt.timedelta(days=1)
    return d
def prev_wd(d):
    d -= dt.timedelta(days=1)
    while not is_wd(d): d -= dt.timedelta(days=1)
    return d
def count_wd(a, b):   # workdays to advance from a to b (a<=b)
    if b <= a: return 0
    n, d = 0, a
    while d < b:
        d += dt.timedelta(days=1)
        if is_wd(d): n += 1
    return n

# (code, name, wbs, duration_workdays, [pred_codes], type)
TT_TASK, TT_MILE, TT_FIN = 'TT_Task', 'TT_Mile', 'TT_FinMile'
TASKS = [
    ('A1000','Notice to Proceed','W10',0,[],TT_MILE),
    ('A1010','Mobilize to Site','W10',2,['A1000'],TT_TASK),
    ('A1020','Building Permit Approval','W10',10,['A1000'],TT_TASK),
    ('A2000','Demo Interior Partitions','W20',5,['A1010','A1020'],TT_TASK),
    ('A2010','Remove Existing MEP','W20',4,['A2000'],TT_TASK),
    ('A2020','Haul Debris & Final Clean','W20',2,['A2010'],TT_TASK),
    ('A3000','Layout & Top Track','W30',3,['A2020'],TT_TASK),
    ('A3010','Metal Stud Framing','W30',8,['A3000'],TT_TASK),
    ('A3020','In-Wall Blocking & Backing','W30',3,['A3010'],TT_TASK),
    ('A4000','Electrical Rough-In','W40',10,['A3010'],TT_TASK),
    ('A4010','Plumbing Rough-In','W40',6,['A3010'],TT_TASK),
    ('A4020','HVAC Ductwork','W40',9,['A3010'],TT_TASK),
    ('A4030','Fire Protection Rough-In','W40',5,['A3010'],TT_TASK),
    ('A4040','MEP Rough-In Inspection','W40',2,['A4000','A4010','A4020','A4030'],TT_TASK),
    ('A5000','Hang Drywall','W50',7,['A4040','A3020'],TT_TASK),
    ('A5010','Tape & Finish','W50',6,['A5000'],TT_TASK),
    ('A5020','Prime & Paint','W50',5,['A5010'],TT_TASK),
    ('A6000','Ceiling Grid','W60',4,['A5010'],TT_TASK),
    ('A6010','Ceiling Tile','W60',3,['A6000','A5020'],TT_TASK),
    ('A6020','Flooring Installation','W60',8,['A5020'],TT_TASK),
    ('A7000','Light Fixtures & Devices','W70',5,['A6010','A4000'],TT_TASK),
    ('A7010','Plumbing Fixtures','W70',3,['A6020','A4010'],TT_TASK),
    ('A7020','HVAC Trim & Diffusers','W70',3,['A6010','A4020'],TT_TASK),
    ('A7030','Casework & Millwork','W70',6,['A6020'],TT_TASK),
    ('A7040','Doors & Hardware','W70',4,['A6020'],TT_TASK),
    ('A8000','MEP Commissioning','W80',5,['A7000','A7010','A7020'],TT_TASK),
    ('A8010','Punch List','W80',4,['A7030','A7040','A8000'],TT_TASK),
    ('A8020','Final Inspection','W80',2,['A8010'],TT_TASK),
    ('A8030','Substantial Completion','W80',0,['A8020'],TT_FIN),
]
WBS = [
    ('W1','','Sample Commercial Office Fit-Out (Demo Data)','FITOUT'),
    ('W10','W1','Mobilization & Permits','MOB'),
    ('W20','W1','Demolition','DEMO'),
    ('W30','W1','Framing & Rough Carpentry','FRAME'),
    ('W40','W1','MEP Rough-In','MEP'),
    ('W50','W1','Drywall & Paint','DRYWALL'),
    ('W60','W1','Flooring & Ceilings','FLOOR'),
    ('W70','W1','Fixtures & Finishes','FINISH'),
    ('W80','W1','Commissioning & Closeout','CLOSE'),
]
RSRC = [  # rsrc_id, name, short, type
    ('R1','Project Manager','PM','RT_Labor'),
    ('R2','Electrician','ELEC','RT_Labor'),
    ('R3','Plumber','PLUMB','RT_Labor'),
    ('R4','Carpenter','CARP','RT_Labor'),
    ('R5','HVAC Technician','HVAC','RT_Labor'),
    ('R6','General Laborer','LAB','RT_Labor'),
]
ASSIGN = {  # task_code -> (rsrc_id, rate $/hr)
    'A1010':('R6',55),'A2000':('R6',55),'A2010':('R3',95),'A2020':('R6',55),
    'A3000':('R4',85),'A3010':('R4',85),'A3020':('R4',85),
    'A4000':('R2',98),'A4010':('R3',95),'A4020':('R5',92),'A4030':('R2',98),
    'A5000':('R4',85),'A5010':('R6',55),'A5020':('R6',55),
    'A6000':('R4',85),'A6010':('R6',55),'A6020':('R6',55),
    'A7000':('R2',98),'A7010':('R3',95),'A7020':('R5',92),'A7030':('R4',85),'A7040':('R4',85),
    'A8000':('R5',92),'A8010':('R1',120),'A8020':('R1',120),
}

by_code = {t[0]: t for t in TASKS}
succs = {c: [] for c in by_code}
for c,_,_,_,preds,_ in TASKS:
    for p in preds: succs[p].append(c)

# forward pass (TASKS is in topological order)
es, ef = {}, {}
for code,_,_,dur,preds,_ in TASKS:
    s = PROJ_START if not preds else max(next_wd(ef[p]) for p in preds)
    es[code] = s
    ef[code] = s if dur == 0 else add_wd(s, dur-1)
proj_finish = max(ef.values())

# backward pass
ls, lf = {}, {}
for code,_,_,dur,preds,_ in reversed(TASKS):
    if not succs[code]:
        lf[code] = proj_finish
    else:
        lf[code] = min(prev_wd(ls[s]) for s in succs[code])
    ls[code] = lf[code] if dur == 0 else sub_wd(lf[code], dur-1)
tf = {c: count_wd(es[c], ls[c]) * 8 for c in by_code}

def fmt(d, t): return d.strftime('%Y-%m-%d') + ' ' + t
def status_for(code):
    if ef[code] < DATA_DATE: return 'TK_Complete'
    if es[code] < DATA_DATE: return 'TK_Active'
    return 'TK_NotStart'

rows = []
def T(name): rows.append('%T\t' + name)
def F(*f): rows.append('%F\t' + '\t'.join(f))
def R(*v): rows.append('%R\t' + '\t'.join('' if x is None else str(x) for x in v))

rows.append('\t'.join(['ERMHDR','24.12','2026-01-26','Project','admin','CPP Lens Demo','dbxDB','Project Management','USD']))
T('PROJECT'); F('proj_id','proj_short_name','proj_long_name','last_recalc_date','plan_start_date','plan_end_date','scd_end_date')
R(1,'FITOUT','Sample Commercial Office Fit-Out (Demo Data)',fmt(DATA_DATE,'08:00'),fmt(PROJ_START,'08:00'),fmt(proj_finish,'17:00'),fmt(proj_finish,'17:00'))
T('CALENDAR'); F('clndr_id','clndr_name','day_hr_cnt','week_hr_cnt'); R('C1','Standard 5-Day Workweek','8','40')
T('PROJWBS'); F('wbs_id','parent_wbs_id','wbs_name','wbs_short_name','proj_id')
for wid,par,nm,sh in WBS: R(wid,par,nm,sh,1)
T('RSRC'); F('rsrc_id','rsrc_name','rsrc_short_name','rsrc_type')
for rid,nm,sh,ty in RSRC: R(rid,nm,sh,ty)
T('TASK'); F('task_id','task_code','task_name','proj_id','wbs_id','clndr_id','status_code','task_type',
             'target_drtn_hr_cnt','target_start_date','target_end_date','act_start_date','act_end_date',
             'early_start_date','early_end_date','late_start_date','late_end_date',
             'total_float_hr_cnt','free_float_hr_cnt','driving_path_flag')
tid = {}
for i,(code,nm,wbs,dur,preds,ty) in enumerate(TASKS, start=1):
    tid[code] = i
    st = status_for(code)
    a_s = fmt(es[code],'08:00') if st in ('TK_Complete','TK_Active') else ''
    a_e = fmt(ef[code],'17:00') if st == 'TK_Complete' else ''
    R(i,code,nm,1,wbs,'C1',st,ty,dur*8,
      fmt(es[code],'08:00'),fmt(ef[code],'17:00'),a_s,a_e,
      fmt(es[code],'08:00'),fmt(ef[code],'17:00'),fmt(ls[code],'08:00'),fmt(lf[code],'17:00'),
      tf[code],tf[code],'Y' if tf[code]==0 else 'N')
T('TASKPRED'); F('task_pred_id','task_id','pred_task_id','pred_type','lag_hr_cnt')
pid = 0
for code,_,_,_,preds,_ in TASKS:
    for p in preds:
        pid += 1; R(pid,tid[code],tid[p],'PR_FS',0)
T('TASKRSRC'); F('taskrsrc_id','task_id','rsrc_id','proj_id','target_qty','target_cost')
aid = 0
for code,(rid,rate) in ASSIGN.items():
    aid += 1; qty = by_code[code][3]*8; R(aid,tid[code],rid,1,qty,qty*rate)
rows.append('%E')

xer = '\n'.join(rows) + '\n'
out = os.path.join(os.path.dirname(__file__), '..', 'src', 'sample', 'sample-schedule.js')
js = ('// Bundled synthetic "demo data" schedule for the one-click sample loader.\n'
      '// Sample Commercial Office Fit-Out — generated by scripts/generate-sample-schedule.py\n'
      '// (synthetic; no client/confidential data). Inlined so the viewer loads it client-side.\n'
      'export const SAMPLE_XER = String.raw`' + xer + '`;\n')
with open(os.path.abspath(out), 'w', encoding='utf-8', newline='\n') as f:
    f.write(js)

assert '`' not in xer and '${' not in xer, 'XER contains a char that breaks String.raw'
print(f'tasks={len(TASKS)} wbs={len(WBS)} preds={pid} rsrc={len(RSRC)} assigns={aid}')
print(f'proj_start={PROJ_START} proj_finish={proj_finish} critical={sum(1 for c in tf if tf[c]==0)}')
print('status:', {s: sum(1 for c in by_code if status_for(c)==s) for s in ('TK_Complete','TK_Active','TK_NotStart')})
print('wrote', os.path.abspath(out), f'({len(xer)} bytes XER)')
