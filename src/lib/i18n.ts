"use client";

import { useSyncExternalStore } from "react";

export type Lang = "en" | "es";

const es: Record<string, string> = {
  // login / auth / join
  "Continue with Google": "Continuar con Google",
  "Split expenses with your partner, friends or on your next trip.": "Reparte gastos con tu pareja, tus amigos o en tu próximo viaje.",
  "Signing you in…": "Iniciando sesión…",
  "Loading invite…": "Cargando invitación…",
  "This invite link is not valid anymore.": "Este enlace de invitación ya no es válido.",
  "You've been invited to": "Te han invitado a",
  "{n} member(s)": "{n} miembro(s)",
  "Are you one of these people?": "¿Eres una de estas personas?",
  "I'm {name}": "Soy {name}",
  "Join as a new member": "Unirme como miembro nuevo",
  "Join group": "Unirme al grupo",
  // home
  "Loading…": "Cargando…",
  "Archive \"{name}\"?": "¿Archivar \"{name}\"?",
  "No group yet": "Aún no hay grupo",
  "Sharing works with groups. Create one for a month, a trip or a flat, or join a friend's by scanning their QR code or opening their link.":
    "Sharing funciona con grupos. Crea uno para un mes, un viaje o un piso, o únete al de un amigo escaneando su código QR o abriendo su enlace.",
  "Scan QR code": "Escanear código QR",
  "Create a new group": "Crear un grupo nuevo",
  "Transactions": "Transacciones",
  "No expenses yet. Tap + to add the first one.": "Aún no hay gastos. Toca + para añadir el primero.",
  "syncing…": "sincronizando…",
  "paid": "pagó",
  "paid back": "devolvió",
  "Show all": "Mostrar todo",
  "Show less": "Mostrar menos",
  "Debts": "Deudas",
  "Everyone is settled up 🎉": "Todo está saldado 🎉",
  "Mark paid": "Marcar pagado",
  "Total spent": "Total gastado",
  "{n} expenses": "{n} gastos",
  "1 expense": "1 gasto",
  "Recent activity": "Actividad reciente",
  "recorded a payment": "registró un pago",
  "added an expense": "añadió un gasto",
  "owes": "debe pagar",
  "Payment": "Pago",
  "Record {amount} paid from {from} to {to}?": "¿Registrar {amount} pagados de {from} a {to}?",
  "Members & balances": "Miembros y saldos",
  "Spending by category": "Gastos por categoría",
  "Invite (link / QR)": "Invitar (enlace / QR)",
  "Scan a QR to join": "Escanear QR para unirse",
  "New group": "Nuevo grupo",
  "Archive this group": "Archivar este grupo",
  "Sign out": "Cerrar sesión",
  "Add expense": "Añadir gasto",
  "Menu": "Menú",
  "Close": "Cerrar",
  // expense form
  "Expense details": "Detalles del gasto",
  "Subject": "Asunto",
  "What was it for?": "¿Para qué fue?",
  "Amount ({currency})": "Importe ({currency})",
  "Who paid": "Quién ha pagado",
  "For whom": "Para quién",
  "Amounts": "Cantidades",
  "Shares": "Partes",
  "Include {name}": "Incluir a {name}",
  "Date and time": "Fecha y hora",
  "Save": "Guardar",
  "Delete expense": "Eliminar gasto",
  "Delete this expense?": "¿Eliminar este gasto?",
  "Select at least one member": "Selecciona al menos un miembro",
  "Values cannot be negative": "Los valores no pueden ser negativos",
  "Amounts must add up to the total": "Las cantidades deben sumar el total",
  "Percentages must add up to 100%": "Los porcentajes deben sumar 100%",
  "At least one share must be above zero": "Al menos una parte debe ser mayor que cero",
  // members / invite / scan / stats / new group
  "Members": "Miembros",
  "(no account yet)": "(sin cuenta aún)",
  "Paid: {amount}": "Gastado: {amount}",
  "Add someone without an account": "Añadir a alguien sin cuenta",
  "Add": "Añadir",
  "You need to be online to add members.": "Necesitas conexión para añadir miembros.",
  "Invite people with a link or QR →": "Invitar con enlace o QR →",
  "Invite to {name}": "Invitar a {name}",
  "Ask your friend to scan this code from Sharing, or send them the link.": "Pide a tu amigo que escanee este código desde Sharing, o envíale el enlace.",
  "Share link": "Compartir enlace",
  "Link copied ✓": "Enlace copiado ✓",
  "Join {name} on Sharing": "Únete a {name} en Sharing",
  "Camera access was denied. You can also open the invite link directly.": "Se denegó el acceso a la cámara. También puedes abrir el enlace de invitación directamente.",
  "Point the camera at the QR code shown in a group's invite screen.": "Apunta la cámara al código QR de la pantalla de invitación de un grupo.",
  "All time": "Todo el tiempo",
  "No expenses in this period.": "No hay gastos en este periodo.",
  "∅ Uncategorised": "∅ Sin categoría",
  "Group name, e.g. November 2026 or Lisbon trip": "Nombre del grupo, p. ej. Noviembre 2026 o Viaje a Lisboa",
  "Create group": "Crear grupo",
  // manage members
  "You need to be online to manage members.": "Necesitas conexión para gestionar miembros.",
  "Some changes are still syncing. Try again in a moment.": "Aún se están sincronizando algunos cambios. Inténtalo de nuevo en un momento.",
  "Merge {from} into {to}? All of {from}'s expenses and balance move to {to}. This can't be undone.":
    "¿Fusionar {from} con {to}? Todos los gastos y el saldo de {from} pasan a {to}. No se puede deshacer.",
  "Remove {name} from the group?": "¿Quitar a {name} del grupo?",
  "Name": "Nombre",
  "Merge into…": "Fusionar con…",
  "Use this when the same person appears twice. Pick the member to keep.": "Úsalo cuando la misma persona aparece dos veces. Elige el miembro que se queda.",
  "has an account": "tiene cuenta",
  "no account yet": "sin cuenta aún",
  "Remove from group": "Quitar del grupo",
  "You need to be online to create a group.": "Necesitas conexión para crear un grupo.",
  // import expenses
  "Import expenses": "Importar gastos",
  "Import {n} expenses": "Importar {n} gastos",
  "Choose the CSV exported from American Express (Fecha, Descripción, Importe).": "Elige el CSV exportado de American Express (Fecha, Descripción, Importe).",
  "Whose card is this?": "¿De quién es la tarjeta?",
  "Paid by this member, split equally between all members.": "Lo paga este miembro, a partes iguales entre todos los miembros.",
  "This group has no members to import for.": "Este grupo no tiene miembros para quien importar.",
  "{n} to import · {s} skipped (negative or zero) · {d} already imported": "{n} para importar · {s} omitidos (negativos o cero) · {d} ya importados",
  "Unreadable rows (line numbers): {lines}": "Filas ilegibles (números de línea): {lines}",
  "Offline: duplicates are filtered after the next sync.": "Sin conexión: los duplicados se filtran tras la próxima sincronización.",
  "… {n} more": "… {n} más",
  "Could not read this file.": "No se pudo leer este archivo.",
  "The file is empty": "El archivo está vacío",
  "Expected the header Fecha,Descripción,Importe": "Se esperaba la cabecera Fecha,Descripción,Importe",
};

const dictionaries: Record<Lang, Record<string, string>> = { en: {}, es };

export function translate(lang: Lang, text: string, params?: Record<string, string | number>): string {
  const base = dictionaries[lang][text] ?? text;
  return params ? base.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`)) : base;
}

const subscribe = (cb: () => void) => {
  window.addEventListener("languagechange", cb);
  return () => window.removeEventListener("languagechange", cb);
};
const clientLang = (): Lang => (navigator.language.toLowerCase().startsWith("es") ? "es" : "en");

/** Follows the phone's language: Spanish when it is Spanish, English otherwise. Server renders English. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, clientLang, () => "en");
}

export function useT() {
  const lang = useLang();
  return { lang, t: (text: string, params?: Record<string, string | number>) => translate(lang, text, params) };
}
