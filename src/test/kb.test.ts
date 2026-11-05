import { describe, expect, it } from "vitest";
import { taxaSucesso } from "@/lib/kb";

describe("taxaSucesso", () => {
  it("é null quando a solução nunca foi testada", () => expect(taxaSucesso(0, 0)).toBeNull());
  it("13 positivos e 1 negativo = 93%", () => expect(taxaSucesso(13, 1)).toBe(93));
  it("só negativos = 0%", () => expect(taxaSucesso(0, 3)).toBe(0));
});
