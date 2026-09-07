// troika-three-text ships no type definitions. Only the config surface we use.
declare module 'troika-three-text' {
  export function configureTextBuilder(config: {
    useWorker?: boolean;
    sdfGlyphSize?: number;
    defaultFontURL?: string | null;
  }): void;
}
