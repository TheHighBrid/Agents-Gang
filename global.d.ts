declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: unknown;
  }
}

declare namespace React {
  type ReactNode = unknown;
}

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}

declare module "next" {
  export type Metadata = Record<string, unknown>;
  export type NextConfig = Record<string, unknown>;
}

declare module "*.css";
