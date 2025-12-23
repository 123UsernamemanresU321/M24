export type OpsConfig = {
  add: boolean;
  sub: boolean;
  mul: boolean;
  div: boolean;
  pow: boolean;
  fact: boolean;
  sqrt: boolean;
  concat: boolean;
};

export const defaultOps: OpsConfig = {
  add: true,
  sub: true,
  mul: true,
  div: true,
  pow: false,
  fact: false,
  sqrt: false,
  concat: false
};
