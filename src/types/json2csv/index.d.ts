import type { Transform as StreamTransform } from 'stream';

declare module 'json2csv' {
  interface TransformOptions {
    fields?: string[];
    defaultValue?: string;
    flatten?: boolean;
    withBOM?: boolean;
  }

  class Transform extends StreamTransform {
    constructor(options?: TransformOptions);
  }

  export { Transform, TransformOptions };
}
