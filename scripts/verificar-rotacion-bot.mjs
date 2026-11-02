// Comprueba, sin imprimir secretos, que el bot acepta el secreto NUEVO y rechaza el ANTERIOR.
// Variables: BOT_URL_PRUEBA (solo bot de pruebas o el real con autorización), SECRETO_NUEVO, SECRETO_ANTERIOR.
const { BOT_URL_PRUEBA: url, SECRETO_NUEVO: nuevo, SECRETO_ANTERIOR: viejo } = process.env;
if (!url || !nuevo || !viejo) { console.error("Faltan BOT_URL_PRUEBA, SECRETO_NUEVO o SECRETO_ANTERIOR."); process.exit(2); }
if (nuevo === viejo) { console.error("El secreto nuevo es igual al anterior."); process.exit(2); }
const probar = async (s) => (await fetch(`${url}/cierre-turno`, { method: "POST", headers: { "content-type": "application/json", "x-bot-secret": s }, body: JSON.stringify({ verificacion: true }) })).status;
// SOLO_ANTERIOR=1: contra el bot REAL no se envía nada con el secreto nuevo (podría generar un mensaje); solo se comprueba que el anterior es rechazado.
const soloViejo = process.env.SOLO_ANTERIOR === "1";
const sViejo = await probar(viejo), sNuevo = soloViejo ? 200 : await probar(nuevo);
console.log(`nuevo -> ${sNuevo}   anterior -> ${sViejo}`);
const ok = sNuevo >= 200 && sNuevo < 300 && (sViejo === 401 || sViejo === 403);
console.log(ok ? "OK: el secreto anterior es rechazado." : "FALLA: revisar fase C (el anterior sigue aceptado o el nuevo no).");
process.exit(ok ? 0 : 1);
