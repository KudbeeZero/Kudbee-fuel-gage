import { describe, expect, test } from 'bun:test';
import {
  completeConvoy,
  createConvoy,
  dispatchConvoy,
  startConvoy,
  updateTaskStatus,
} from '../gastown-convoy.ts';

describe('Gastown convoy lifecycle', () => {
  test('requires work and follows the guarded lifecycle', () => {
    expect(() => createConvoy({ title: 'empty', description: 'invalid', tasks: [] })).toThrow();

    const convoy = createConvoy({
      title: 'verified work',
      description: 'lifecycle regression',
      tasks: [{ agent: 'polecat', role: 'worker', prompt: 'run safely' }],
    });

    expect(startConvoy(convoy.id)).toBeNull();
    expect(dispatchConvoy(convoy.id)?.status).toBe('DISPATCHED');
    expect(startConvoy(convoy.id)?.status).toBe('IN_FLIGHT');

    const taskId = convoy.tasks[0]!.id;
    expect(updateTaskStatus(convoy.id, taskId, 'completed')).toBeNull();
    expect(updateTaskStatus(convoy.id, taskId, 'running')?.status).toBe('IN_FLIGHT');
    expect(updateTaskStatus(convoy.id, taskId, 'completed')?.status).toBe('REFINING');
    expect(completeConvoy(convoy.id, 'reviewed')?.status).toBe('MERGED');
  });
});
