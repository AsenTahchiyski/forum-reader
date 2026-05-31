/**
 * Minimal XML-RPC codec for the Tapatalk (mobiquo) API.
 *
 * Requests are built as strings; responses are parsed with the browser's
 * DOMParser. The Tapatalk API base64-encodes most human-readable string
 * fields in both directions, so we expose a `b64()` marker for request params
 * and automatically decode <base64> values to UTF-8 text in responses.
 */
import { fromB64, toB64 } from './crypto';

const textEnc = new TextEncoder();
const textDec = new TextDecoder();

export type XmlRpcValue =
  | string
  | number
  | boolean
  | XmlRpcValue[]
  | { [key: string]: XmlRpcValue }
  | null;

/** Wrap a string so it is encoded as an XML-RPC <base64> param. */
export class Base64Param {
  constructor(public readonly value: string) {}
}
export function b64(value: string): Base64Param {
  return new Base64Param(value);
}

export class XmlRpcFault extends Error {
  constructor(
    public readonly faultCode: number,
    public readonly faultString: string
  ) {
    super(`XML-RPC fault ${faultCode}: ${faultString}`);
    this.name = 'XmlRpcFault';
  }
}

// ---- Encoding -------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function encodeValue(v: unknown): string {
  if (v instanceof Base64Param) {
    return `<value><base64>${toB64(textEnc.encode(v.value))}</base64></value>`;
  }
  if (v === null || v === undefined) {
    return `<value><string></string></value>`;
  }
  if (typeof v === 'string') {
    return `<value><string>${escapeXml(v)}</string></value>`;
  }
  if (typeof v === 'boolean') {
    return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
  }
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? `<value><int>${v}</int></value>`
      : `<value><double>${v}</double></value>`;
  }
  if (v instanceof Uint8Array) {
    return `<value><base64>${toB64(v)}</base64></value>`;
  }
  if (Array.isArray(v)) {
    return `<value><array><data>${v.map(encodeValue).join('')}</data></array></value>`;
  }
  if (typeof v === 'object') {
    const members = Object.entries(v as Record<string, unknown>)
      .map(
        ([name, val]) =>
          `<member><name>${escapeXml(name)}</name>${encodeValue(val)}</member>`
      )
      .join('');
    return `<value><struct>${members}</struct></value>`;
  }
  return `<value><string></string></value>`;
}

export function encodeMethodCall(method: string, params: unknown[]): string {
  const paramXml = params
    .map((p) => `<param>${encodeValue(p)}</param>`)
    .join('');
  return `<?xml version="1.0"?><methodCall><methodName>${escapeXml(
    method
  )}</methodName><params>${paramXml}</params></methodCall>`;
}

// ---- Decoding -------------------------------------------------------------

function firstElementChild(el: Element): Element | null {
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === 1) return node as Element;
  }
  return null;
}

function childrenByTag(el: Element, tag: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === 1 && (node as Element).tagName === tag) {
      out.push(node as Element);
    }
  }
  return out;
}

function parseValue(valueEl: Element): XmlRpcValue {
  const child = firstElementChild(valueEl);
  if (!child) return valueEl.textContent ?? '';

  switch (child.tagName) {
    case 'string':
      return child.textContent ?? '';
    case 'int':
    case 'i4':
      return parseInt(child.textContent || '0', 10);
    case 'double':
      return parseFloat(child.textContent || '0');
    case 'boolean':
      return (child.textContent || '').trim() === '1';
    case 'base64':
      try {
        return textDec.decode(fromB64((child.textContent || '').trim()));
      } catch {
        return child.textContent ?? '';
      }
    case 'dateTime.iso8601':
      return child.textContent ?? '';
    case 'array': {
      const data = firstElementChild(child);
      if (!data) return [];
      return childrenByTag(data, 'value').map(parseValue);
    }
    case 'struct': {
      const obj: Record<string, XmlRpcValue> = {};
      for (const member of childrenByTag(child, 'member')) {
        const nameEl = childrenByTag(member, 'name')[0];
        const valEl = childrenByTag(member, 'value')[0];
        if (nameEl && valEl) {
          obj[nameEl.textContent || ''] = parseValue(valEl);
        }
      }
      return obj;
    }
    default:
      return child.textContent ?? '';
  }
}

export function decodeResponse(xml: string): XmlRpcValue {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Malformed XML-RPC response from the forum.');
  }

  const faults = doc.getElementsByTagName('fault');
  if (faults.length > 0) {
    const faultValue = childrenByTag(faults[0], 'value')[0];
    const parsed = faultValue ? parseValue(faultValue) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const code = parsed.faultCode;
      const str = parsed.faultString;
      throw new XmlRpcFault(
        typeof code === 'number' ? code : -1,
        typeof str === 'string' ? str : 'Unknown fault'
      );
    }
    throw new XmlRpcFault(-1, 'Unknown fault');
  }

  const params = doc.getElementsByTagName('methodResponse')[0];
  if (!params) return null;
  // methodResponse > params > param > value
  const paramEls = params.getElementsByTagName('param');
  if (paramEls.length === 0) return null;
  const valueEl = childrenByTag(paramEls[0], 'value')[0];
  return valueEl ? parseValue(valueEl) : null;
}
