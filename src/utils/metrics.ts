import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'crawlee_server_' });

export const jobCounter = new Counter({
  name: 'crawlee_server_jobs_total',
  help: 'Total Agenda jobs processed',
  labelNames: ['job', 'status'],
  registers: [registry],
});

export const crawlErrorsCounter = new Counter({
  name: 'crawlee_server_crawl_errors_total',
  help: 'Total crawl errors encountered',
  labelNames: ['strategy'],
  registers: [registry],
});

export const dedupeCounter = new Counter({
  name: 'crawlee_server_dedupe_total',
  help: 'Lead dedupe results by outcome',
  labelNames: ['result'],
  registers: [registry],
});

export const jobLatencyHistogram = new Histogram({
  name: 'crawlee_server_job_duration_seconds',
  help: 'Duration of jobs in seconds',
  labelNames: ['job'],
  buckets: [5, 15, 30, 60, 120, 300, 600],
  registers: [registry],
});

const readiness = {
  mongo: false,
  agenda: false,
};

export function setMongoReady(value: boolean): void {
  readiness.mongo = value;
}

export function setAgendaReady(value: boolean): void {
  readiness.agenda = value;
}

export function isReady(): boolean {
  return readiness.mongo && readiness.agenda;
}

export function getMetricsRegistry(): Registry {
  return registry;
}
