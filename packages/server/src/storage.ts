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

const CONFIG_KEY = 'config';
const CMD_PREFIX = 'cmd:';

/** Zero-pad so `list({ prefix })` returns keys in application order. */
function cmdKey(seq: number): string {
  return `${CMD_PREFIX}${String(seq).padStart(9, '0')}`;
}

/**
 * The durable command log for one room. Each accepted command is one storage
 * entry under a zero-padded sequential key (KTD13). On wake the room lists the
 * `cmd:` keys in order and replays them through the engine. A single growing
 * array would breach the 128 KiB per-value cap in a long game; per-command
 * keys stay far under it.
 *
 * The head is derived from the keys themselves, never a separate counter —
 * `room.storage` is not transactional, so a counter that got out of sync with
 * the keys could let `append` overwrite a command that was already sent to
 * clients. The trade is one `list()` per append; a whole game is ~200 keys.
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

  /** The `cmd:` keys, sorted (application order). */
  private async keys(): Promise<string[]> {
    const entries = await this.store.list<Command>({ prefix: CMD_PREFIX });
    return [...entries.keys()].sort();
  }

  /**
   * Append one command. Call this before dispatching its events (R7). Throws
   * if the next key already exists — the caller treats that as a persist
   * failure and does not apply the command.
   */
  async append(command: Command): Promise<void> {
    const keys = await this.keys();
    const head = keys.length === 0 ? 0 : Number(keys[keys.length - 1]!.slice(CMD_PREFIX.length));
    const key = cmdKey(head + 1);
    if ((await this.store.get(key)) !== undefined) {
      throw new Error(`command log key ${key} already exists`);
    }
    await this.store.put(key, command);
  }

  /** Every command in application order. */
  async loadAll(): Promise<Command[]> {
    const entries = await this.store.list<Command>({ prefix: CMD_PREFIX });
    return [...entries.keys()].sort().map((key) => entries.get(key)!);
  }

  async count(): Promise<number> {
    return (await this.keys()).length;
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
