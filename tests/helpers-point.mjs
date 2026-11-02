// Dobles de prueba (datos ficticios, sin red). La reserva imita el índice único parcial de supabase/04.
const ACTIVOS = ["reservado", "created", "at_terminal"];
const tick = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 3)));
let n = 0;

export function crearFakes(opts = {}) {
  const filas = [];
  const mpOrdenes = new Map(); // clave -> orden  (MP idempotente: misma clave => misma orden)
  const est = { llamadasMP: 0, perderRespuesta: opts.perderRespuestaUnaVez ?? false, fallarGuardar: opts.fallarGuardarUnaVez ?? false, errorMP: opts.errorMP ?? null };

  const pagos = {
    async reservar({ restauranteId, ventaId, monto }) {
      await tick();
      // sección atómica (equivale al INSERT con índice único parcial)
      const activa = filas.find((f) => f.restaurante_id === restauranteId && f.venta_id === ventaId && ACTIVOS.includes(f.estado));
      if (activa) return { reserva: { ...activa }, creada: false };
      const id = `res-${++n}`;
      const fila = { id, restaurante_id: restauranteId, venta_id: ventaId, monto, estado: "reservado", mp_order_id: null, clave_idempotencia: `clave-${id}`, referencia_externa: `venta_${ventaId}_${id}` };
      filas.push(fila);
      return { reserva: { ...fila }, creada: true };
    },
    async guardarOrden(id, o) {
      await tick();
      if (est.fallarGuardar) { est.fallarGuardar = false; throw new Error("fallo base"); }
      Object.assign(filas.find((f) => f.id === id), o);
    },
    async cerrar(id, estado, detalle) { Object.assign(filas.find((f) => f.id === id), { estado, detalle }); },
  };

  const mp = {
    async crearOrden({ clave, referencia, monto, terminalId }) {
      await tick();
      est.llamadasMP++;
      if (est.errorMP) return { ok: false, ...est.errorMP };
      let orden = mpOrdenes.get(clave);
      if (!orden) { orden = { id: `ORD-${mpOrdenes.size + 1}`, status: "created", referencia, monto, terminalId }; mpOrdenes.set(clave, orden); }
      if (est.perderRespuesta) { est.perderRespuesta = false; throw new Error("timeout de red"); } // MP creó la orden, la respuesta se pierde
      return { ok: true, orden: { id: orden.id, status: orden.status } };
    },
  };

  return { pagos, mp, filas, est, ordenesEnMP: () => mpOrdenes.size };
}

export const entrada = (o = {}) => ({
  restauranteId: "rest-A", ventaId: "venta-1", monto: 5000, terminalId: "TERM-FICTICIA",
  venta: { total: 5000, estado: "pendiente", estado_pago: "pendiente" }, ...o,
});
