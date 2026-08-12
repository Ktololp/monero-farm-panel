import { db } from '../database/index.js';

let ioRef = null;
export function setJobsIO(io) { ioRef = io; }

export function createJob(type, title) {
  const info = db.prepare(`INSERT INTO jobs(type,state,title,progress,details,created_at) VALUES(?,?,?,?,?,?)`).run(type,'queued',title,0,'',Date.now());
  const job = getJob(info.lastInsertRowid);
  ioRef?.emit('job:update', job);
  return job;
}

export function getJob(id) {
  const row = db.prepare(`SELECT j.*,s.name AS current_server_name FROM jobs j LEFT JOIN servers s ON s.id=j.current_server_id WHERE j.id=?`).get(Number(id));
  if (!row) return null;
  let result = null;
  try { result = row.result_json ? JSON.parse(row.result_json) : null; } catch {}
  return { ...row, result };
}

export function listJobs(limit = 30) {
  return db.prepare(`SELECT j.*,s.name AS current_server_name FROM jobs j LEFT JOIN servers s ON s.id=j.current_server_id ORDER BY j.created_at DESC LIMIT ?`).all(Math.max(1,Math.min(200,Number(limit)||30))).map(row=>{
    let result=null; try{result=row.result_json?JSON.parse(row.result_json):null;}catch{}
    return {...row,result};
  });
}

export function updateJob(id, patch = {}) {
  const current = getJob(id);
  if (!current) return null;
  const state = patch.state ?? current.state;
  const progress = Math.max(0,Math.min(100,Number(patch.progress ?? current.progress) || 0));
  const serverId = patch.currentServerId === undefined ? current.current_server_id : patch.currentServerId;
  const details = patch.details === undefined ? current.details : String(patch.details || '').slice(-10000);
  const started = patch.startedAt === undefined ? current.started_at : patch.startedAt;
  const finished = patch.finishedAt === undefined ? current.finished_at : patch.finishedAt;
  const resultJson = patch.result === undefined ? current.result_json : JSON.stringify(patch.result ?? null);
  db.prepare(`UPDATE jobs SET state=?,progress=?,current_server_id=?,details=?,started_at=?,finished_at=?,result_json=? WHERE id=?`).run(state,progress,serverId,details,started,finished,resultJson,id);
  const job = getJob(id); ioRef?.emit('job:update',job); return job;
}

export function runJob(job, runner) {
  setImmediate(async()=>{
    updateJob(job.id,{state:'running',startedAt:Date.now(),progress:1});
    try {
      const result=await runner((patch)=>updateJob(job.id,patch));
      updateJob(job.id,{state:'done',progress:100,currentServerId:null,finishedAt:Date.now(),result});
    } catch(e) {
      updateJob(job.id,{state:'failed',currentServerId:null,finishedAt:Date.now(),details:e.message,result:{error:e.message}});
    }
  });
  return job;
}
