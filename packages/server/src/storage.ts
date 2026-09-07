import type { Command } from '@boomtown/engine';

/**
 * The slice of PartyKit's `room.storage` the room uses, narrowed so the room
 * logic can be exercised with an in-memory fake. PartyKit's real storage is an
 * async key-value store; each value is capped at 128 KiB and it is not
 * transactional (KTD13).
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
  delete(key: string): Promise<void>;
}

const SEQ_KEY = 'seq';
const CONFIG_KEY = 'config';
const CMD_PREFIX = 'cmd:';

/** Zero-pad so `list({ prefix })` returns keys in application order. */
function cmdKey(seq: number): string {
  return `${CMD_PREFIX}${String(seq).padStart(9, '0')}`;
}

/**
 * The durable command log for one room. Each accepted command is one storage
 * entry under a sequential key; a `seq` counter tracks the head. On wake the
 * room lists the `cmd:` keys in order and replays them through the engine
 * (KTD13). A single growing array would breach the 128 KiB per-value cap in a
 * long game; per-command keys stay far under it.
 */
export class CommandLog {
  constructor(private readonly store: KeyValueStore) {}

  /** Persist the config once, at room creation, so a woken room can rebuild setup. */
  async saveConfig<T>(config: T): Promise<void> {
    await this.store.put(CONFIG_KEY, config);
  }

  async loadConfig<T>(): Promise<T | undefined> {
    return this.store.get<T>(CONFIG_KEY);
  }

  /** Append one command. Call this before dispatching its events (R7). */
  async append(command: Command): Promise<void> {
    const seq = (await this.store.get<number>(SEQ_KEY)) ?? 0;
    const next = seq + 1;
    await this.store.put(cmdKey(next), command);
    await this.store.put(SEQ_KEY, next);
  }

  /** Every command in application order. */
  async loadAll(): Promise<Command[]> {
    const entries = await this.store.list<Command>({ prefix: CMD_PREFIX });
    return [...entries.keys()].sort().map((key) => entries.get(key)!);
  }

  async count(): Promise<number> {
    return (await this.store.get<number>(SEQ_KEY)) ?? 0;
  }
}

/** An in-memory `KeyValueStore` for tests and the lobby phase before storage matters. */
export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, unknown>();

  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.map.get(key) as T | undefined);
  }

  put<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }

  list<T>(options?: { prefix?: string }): Promise<Map<string, T>> {
    const prefix = options?.prefix ?? '';
    const out = new Map<string, T>();
    for (const [key, value] of this.map) {
      if (key.startsWith(prefix)) out.set(key, value as T);
    }
    return Promise.resolve(out);
  }

  delete(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
}
