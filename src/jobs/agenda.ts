import Agenda from 'agenda';

import { appConfig } from '../config/env';
import { logger } from '../utils/logger';
import { defineScrapeCrawlJob } from './handlers/scrapeCrawl';
import { defineEnrichContactsJob } from './handlers/enrichContacts';
import { setAgendaReady } from '../utils/metrics';

let agendaInstance: Agenda | null = null;

export async function initAgenda(): Promise<Agenda> {
  if (agendaInstance) {
    return agendaInstance;
  }

  const agenda = new Agenda({
    db: { address: appConfig.mongoUrl, collection: appConfig.agendaCollection },
    processEvery: '30 seconds',
    defaultLockLifetime: 5 * 60 * 1000,
  });

  agenda.on('ready', () => logger.info('Agenda connected'));
  agenda.on('error', (error) => logger.error({ err: error }, 'Agenda connection error'));
  agenda.on('start', (job) => logger.debug({ name: job.attrs.name }, 'Agenda job started'));
  agenda.on('success', (job) => logger.debug({ name: job.attrs.name }, 'Agenda job completed'));
  agenda.on('fail', (error, job) =>
    logger.error({ err: error, name: job.attrs.name }, 'Agenda job failed'),
  );

  defineScrapeCrawlJob(agenda);
  defineEnrichContactsJob(agenda);

  await agenda.start();
  setAgendaReady(true);

  agendaInstance = agenda;
  return agendaInstance;
}

export function getAgenda(): Agenda {
  if (!agendaInstance) {
    throw new Error('Agenda not initialized yet.');
  }
  return agendaInstance;
}

export async function stopAgenda(): Promise<void> {
  if (!agendaInstance) {
    return;
  }
  await agendaInstance.stop();
  setAgendaReady(false);
}
