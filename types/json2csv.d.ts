declare module 'json2csv' {
  import { Transform as StreamTransform } from 'stream';

  interface TransformOptions {
    fields?: string[];
    defaultValue?: string;
    flatten?: boolean;
    withBOM?: boolean;
  }

  class Transform extends StreamTransform {
    constructor(options?: TransformOptions);
  }

  interface ParserOptions {
    fields?: string[];
    defaultValue?: string;
    flatten?: boolean;
    withBOM?: boolean;
  }

  class Parser {
    constructor(options?: ParserOptions);
    parse(data: any): string;
  }

  export { Transform, TransformOptions, Parser, ParserOptions };
}
