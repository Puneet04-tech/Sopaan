declare module "json-logic-js" {
  const jsonLogic: {
    apply: (logic: unknown, data: unknown) => unknown;
    add_operation: (name: string, fn: (...args: unknown[]) => unknown) => void;
  };
  export default jsonLogic;
}

declare module "qrcode" {
  export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
  export function toString(text: string, options?: Record<string, unknown>): Promise<string>;
}
