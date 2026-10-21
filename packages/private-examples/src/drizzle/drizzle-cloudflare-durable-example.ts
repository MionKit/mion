import {drizzle} from 'drizzle-orm/durable-sqlite';
import type {DrizzleSqliteDODatabase} from 'drizzle-orm/durable-sqlite';
import {toDrizzle} from '@mionjs/drizzle-orm-sqlite-core/drizzle';
import {
  notes,
  type Note,
  type NewNote,
} from './drizzle-proxy-sqlite-example.ts';

const notesDb = toDrizzle(notes);

// storage needed by Drizzle
interface Storage {
  sql: {exec(query: string, ...bindings: unknown[]): unknown};
}

export class NotesObject {
  private readonly db: DrizzleSqliteDODatabase;

  constructor(storage: Storage) {
    this.db = drizzle(storage as never);
  }

  // models, validators and table work across databases
  async addNote(note: NewNote): Promise<Note> {
    const [row] = await this.db.insert(notesDb).values(note).returning();
    return row;
  }
}
