import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const txt = (min: number, max: number) => z.string().trim().min(min).max(max);
const uuid = z.string().uuid();

export const fnBuscar = createServerFn({ method: "POST" })
  .inputValidator(z.object({ texto: txt(1, 500) }))
  .handler(async ({ data }) => {
    const { dbBuscar } = await import("./kb.db.server");
    const rows = await dbBuscar(data.texto);
    return JSON.stringify(rows);
  });

export const fnSalvar = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    evento: txt(3, 500), solucao: txt(5, 20000),
    ticket_numero: z.string().max(50).nullable().optional(), autor: z.string().max(200).nullable().optional(),
    origem: z.string().max(30).optional(),
  }))
  .handler(async ({ data }) => {
    const { dbSalvarSolucao } = await import("./kb.db.server");
    return dbSalvarSolucao({ evento: data.evento, solucao: data.solucao, ticket_numero: data.ticket_numero ?? null, autor: data.autor ?? null, origem: data.origem ?? "otrs" });
  });

export const fnRegistrarEvento = createServerFn({ method: "POST" })
  .inputValidator(z.object({ evento: txt(3, 500) }))
  .handler(async ({ data }) => (await import("./kb.db.server")).dbRegistrarEvento(data.evento));

export const fnResolverEvento = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: uuid, solucao_id: uuid }))
  .handler(async ({ data }) => { await (await import("./kb.db.server")).dbResolverEvento(data.id, data.solucao_id); return true; });

export const fnSolucaoDoTicket = createServerFn({ method: "POST" })
  .inputValidator(z.object({ ticket: z.string().min(1).max(50) }))
  .handler(async ({ data }) => (await import("./kb.db.server")).dbSolucaoDoTicket(data.ticket));

export const fnVotar = createServerFn({ method: "POST" })
  .inputValidator(z.object({ solucao_id: uuid, positivo: z.boolean(), evento: z.string().max(500), comentario: z.string().max(20000).nullable() }))
  .handler(async ({ data }) => { await (await import("./kb.db.server")).dbVotar(data.solucao_id, data.positivo, data.evento, data.comentario); return true; });
