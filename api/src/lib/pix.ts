/** Geração de BR Code (Pix "copia e cola") estático, padrão EMV do Banco Central. */

export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const b of Buffer.from(texto, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (id: string, valor: string) => id + String(valor.length).padStart(2, '0') + valor;

const ascii = (s: string, max: number) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()
    .slice(0, max)
    .trim() || 'NA';

export interface DadosBrCode {
  chave: string;
  valorCentavos: number;
  titular: string;
  cidade: string;
  txid: string;
}

export function gerarBrCode(d: DadosBrCode): string {
  const conta = tlv('00', 'br.gov.bcb.pix') + tlv('01', d.chave);
  const txid = d.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const sem = [
    tlv('00', '01'),
    tlv('26', conta),
    tlv('52', '0000'),
    tlv('53', '986'),
    tlv('54', (d.valorCentavos / 100).toFixed(2)),
    tlv('58', 'BR'),
    tlv('59', ascii(d.titular, 25)),
    tlv('60', ascii(d.cidade, 15)),
    tlv('62', tlv('05', txid)),
    '6304',
  ].join('');
  return sem + crc16(sem);
}
